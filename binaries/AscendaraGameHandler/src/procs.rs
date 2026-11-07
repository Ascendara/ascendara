use std::collections::{HashMap, HashSet};
use std::process::{Child, ExitStatus};
use std::time::{Duration, Instant};

use crate::{error, pypath};

/// Exit code in Python's Popen.returncode convention: negative signal number
/// when killed on Unix, the unsigned DWORD on Windows.
pub fn return_code(status: ExitStatus) -> i64 {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        match status.code() {
            Some(code) => code as i64,
            None => -(status.signal().unwrap_or(0) as i64),
        }
    }
    #[cfg(windows)]
    {
        status.code().map_or(0, |code| code as u32 as i64)
    }
}

pub enum GameProcess {
    Child(Child),
    #[cfg(windows)]
    Elevated(crate::win::ElevatedProcess),
}

impl GameProcess {
    pub fn pid(&self) -> u32 {
        match self {
            GameProcess::Child(child) => child.id(),
            #[cfg(windows)]
            GameProcess::Elevated(p) => p.pid,
        }
    }

    /// The return code once the process has exited, without blocking.
    pub fn poll(&mut self) -> Option<i64> {
        match self {
            GameProcess::Child(child) => child.try_wait().ok().flatten().map(return_code),
            #[cfg(windows)]
            GameProcess::Elevated(p) => p.poll(),
        }
    }

    pub fn wait(&mut self) -> Option<i64> {
        match self {
            GameProcess::Child(child) => child.wait().ok().map(return_code),
            #[cfg(windows)]
            GameProcess::Elevated(p) => p.wait(),
        }
    }

    /// Popen.terminate(): SIGTERM on Unix, TerminateProcess on Windows.
    pub fn terminate(&mut self) {
        match self {
            #[cfg(unix)]
            GameProcess::Child(child) => unsafe {
                libc::kill(child.id() as libc::pid_t, libc::SIGTERM);
            },
            #[cfg(windows)]
            GameProcess::Child(child) => {
                let _ = child.kill();
            }
            #[cfg(windows)]
            GameProcess::Elevated(p) => p.terminate(),
        }
    }

    pub fn wait_timeout(&mut self, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if self.poll().is_some() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        self.poll().is_some()
    }
}

/// One process from a snapshot of the process table.
struct ProcInfo {
    pid: u32,
    ppid: Option<u32>,
    /// Only compared against other start times from the same backend
    start: u64,
    /// normcase(normpath(exe)), when it was requested and could be read
    exe: Option<String>,
}

/// Process table snapshot. Only parent pid, start time and (once per process)
/// the executable path are read, which keeps a refresh cheap.
pub struct Processes {
    backend: backend::Backend,
    procs: Vec<ProcInfo>,
}

impl Processes {
    pub fn new() -> Self {
        Processes { backend: backend::Backend::new(), procs: Vec::new() }
    }

    pub fn refresh(&mut self, with_exe: bool) {
        self.procs = self.backend.snapshot(with_exe);
    }

    /// Processes whose executable lives inside game_dir.
    pub fn in_dir(&self, game_dir: &str, exclude_pid: u32) -> Vec<u32> {
        let dir = pypath::normcase(&pypath::normpath(game_dir));
        let prefix = format!("{dir}{}", pypath::SEP);
        self.procs
            .iter()
            .filter(|p| p.pid != exclude_pid)
            .filter(|p| p.exe.as_ref().is_some_and(|exe| *exe == dir || exe.starts_with(&prefix)))
            .map(|p| p.pid)
            .collect()
    }

    fn start_time(&self, pid: u32) -> Option<u64> {
        self.procs.iter().find(|p| p.pid == pid).map(|p| p.start)
    }

    /// Return the live descendants of root_pid, recording every descendant ever
    /// seen (pid -> start time) in seen.
    ///
    /// A .bat/launcher can start the real game and exit within milliseconds, so
    /// the game is found by its parent pid, which Windows keeps after the parent
    /// exits. Comparing start times stops a reused pid from adopting unrelated
    /// processes.
    pub fn refresh_tree(&self, seen: &mut HashMap<u32, u64>, root_pid: u32) -> Vec<u32> {
        seen.entry(root_pid).or_insert_with(|| self.start_time(root_pid).unwrap_or(0));
        let procs: Vec<(u32, u32, u64)> =
            self.procs.iter().filter_map(|p| p.ppid.map(|ppid| (p.pid, ppid, p.start))).collect();
        let live: HashMap<u32, u64> = procs.iter().map(|&(pid, _, created)| (pid, created)).collect();
        loop {
            let mut found = false;
            for &(pid, ppid, created) in &procs {
                if seen.contains_key(&pid) {
                    continue;
                }
                let Some(&parent_created) = seen.get(&ppid) else { continue };
                if created < parent_created {
                    continue;
                }
                if live.get(&ppid).is_some_and(|&c| c != parent_created) {
                    continue; // parent pid now belongs to an unrelated process
                }
                seen.insert(pid, created);
                found = true;
            }
            if !found {
                break;
            }
        }
        procs
            .iter()
            .filter(|&&(pid, _, created)| pid != root_pid && seen.get(&pid) == Some(&created))
            .map(|&(pid, _, _)| pid)
            .collect()
    }

    /// psutil's Process.children(recursive=True).
    pub fn descendants(&self, root_pid: u32) -> Vec<u32> {
        let Some(root_created) = self.start_time(root_pid) else { return Vec::new() };
        let mut children: HashMap<u32, Vec<(u32, u64)>> = HashMap::new();
        for p in &self.procs {
            if let Some(ppid) = p.ppid {
                children.entry(ppid).or_default().push((p.pid, p.start));
            }
        }
        let mut out = Vec::new();
        let mut visited = HashSet::new();
        let mut stack = vec![root_pid];
        while let Some(pid) = stack.pop() {
            if !visited.insert(pid) {
                continue;
            }
            for &(child, created) in children.get(&pid).into_iter().flatten() {
                if root_created <= created {
                    out.push(child);
                    stack.push(child);
                }
            }
        }
        out
    }

    pub fn kill(&self, pid: u32) {
        if !kill_pid(pid) {
            error!("Permission denied stopping game process {pid}");
        }
    }
}

/// Force-kill a process. False only when it exists but may not be killed.
#[cfg(unix)]
fn kill_pid(pid: u32) -> bool {
    let killed = unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) } == 0;
    killed || std::io::Error::last_os_error().raw_os_error() != Some(libc::EPERM)
}

#[cfg(windows)]
fn kill_pid(pid: u32) -> bool {
    crate::win::terminate_pid(pid)
}

fn normalize_exe(exe: &str) -> Option<String> {
    (!exe.is_empty()).then(|| pypath::normcase(&pypath::normpath(exe)))
}

/// macOS: sysinfo collects full task info for every process, which made each
/// scan cost ~8ms of CPU. libproc's BSD info is all that's needed (~0.4ms).
#[cfg(target_os = "macos")]
mod backend {
    use super::{normalize_exe, ProcInfo};
    use std::collections::HashMap;

    pub struct Backend {
        /// (pid, start time) -> normalized exe; a pid is only resolved once
        exe_cache: HashMap<(u32, u64), Option<String>>,
    }

    fn exe_path(pid: i32) -> Option<String> {
        let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
        let len = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
        if len <= 0 {
            return None;
        }
        normalize_exe(&String::from_utf8_lossy(&buf[..len as usize]))
    }

    impl Backend {
        pub fn new() -> Self {
            Backend { exe_cache: HashMap::new() }
        }

        pub fn snapshot(&mut self, with_exe: bool) -> Vec<ProcInfo> {
            let capacity = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) }.max(0) as usize + 64;
            let mut pids = vec![0i32; capacity];
            let bytes = (pids.len() * std::mem::size_of::<i32>()) as i32;
            let count = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), bytes) }.max(0) as usize;
            pids.truncate(count.min(capacity));

            let mut procs = Vec::with_capacity(pids.len());
            let mut cache = HashMap::with_capacity(self.exe_cache.len());
            for pid in pids.into_iter().filter(|&pid| pid > 0) {
                let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
                let size = std::mem::size_of::<libc::proc_bsdinfo>() as i32;
                let read = unsafe {
                    libc::proc_pidinfo(pid, libc::PROC_PIDTBSDINFO, 0, (&mut info as *mut libc::proc_bsdinfo).cast(), size)
                };
                if read != size {
                    continue; // exited, or not ours to inspect
                }
                let start = info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec;
                let key = (pid as u32, start);
                let exe = match self.exe_cache.remove(&key) {
                    Some(exe) => exe,
                    None if with_exe => exe_path(pid),
                    None => {
                        procs.push(ProcInfo { pid: pid as u32, ppid: Some(info.pbi_ppid), start, exe: None });
                        continue;
                    }
                };
                cache.insert(key, exe.clone());
                procs.push(ProcInfo { pid: pid as u32, ppid: Some(info.pbi_ppid), start, exe });
            }
            // Dropping entries for exited processes keeps the cache bounded
            self.exe_cache = cache;
            procs
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod backend {
    use super::{normalize_exe, ProcInfo};
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

    pub struct Backend {
        sys: System,
    }

    impl Backend {
        pub fn new() -> Self {
            Backend { sys: System::new() }
        }

        pub fn snapshot(&mut self, with_exe: bool) -> Vec<ProcInfo> {
            let mut kind = ProcessRefreshKind::nothing();
            if with_exe {
                kind = kind.with_exe(UpdateKind::OnlyIfNotSet);
            }
            self.sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
            self.sys
                .processes()
                .values()
                .map(|p| ProcInfo {
                    pid: p.pid().as_u32(),
                    ppid: p.parent().map(Pid::as_u32),
                    start: p.start_time(),
                    exe: with_exe.then(|| p.exe().and_then(|e| normalize_exe(&e.to_string_lossy()))).flatten(),
                })
                .collect()
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn tracks_real_process_tree() {
        let mut shell = Command::new("/bin/sh").args(["-c", "sleep 30 & wait"]).spawn().unwrap();
        std::thread::sleep(Duration::from_millis(300));
        let mut procs = Processes::new();
        procs.refresh(true);

        let me = std::process::id();
        assert!(procs.descendants(me).contains(&shell.id()));
        let grandchildren = procs.descendants(shell.id());
        assert_eq!(grandchildren.len(), 1);
        let mut seen = HashMap::new();
        assert_eq!(procs.refresh_tree(&mut seen, shell.id()), grandchildren);

        let exe = std::env::current_exe().unwrap();
        let dir = exe.parent().unwrap().to_string_lossy().into_owned();
        assert!(procs.in_dir(&dir, 0).contains(&me));
        assert!(!procs.in_dir(&dir, me).contains(&me));

        procs.kill(grandchildren[0]);
        procs.kill(shell.id());
        assert_eq!(return_code(shell.wait().unwrap()), -9);
    }
}
