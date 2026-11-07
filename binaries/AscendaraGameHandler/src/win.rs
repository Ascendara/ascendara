// Windows-only launch helpers.

use std::ffi::OsStr;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::ptr::null;
use windows_sys::Win32::Foundation::{CloseHandle, ERROR_ACCESS_DENIED, HANDLE, WAIT_OBJECT_0};
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, GetProcessId, OpenProcess, TerminateProcess, WaitForSingleObject, INFINITE,
    PROCESS_TERMINATE,
};
use windows_sys::Win32::UI::Shell::{
    ShellExecuteExW, ShellExecuteW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

pub const ERROR_ELEVATION_REQUIRED: i32 = 740;
pub const ERROR_CANCELLED: i32 = 1223;
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(Some(0)).collect()
}

/// Popen-like handle for a process started through the UAC 'runas' verb.
///
/// ShellExecuteW gives no process handle, which left elevated games untracked
/// (no play time, isRunning never cleared). ShellExecuteExW with
/// SEE_MASK_NOCLOSEPROCESS does, so the normal monitoring loop can wait on it.
pub struct ElevatedProcess {
    handle: HANDLE,
    pub pid: u32,
    returncode: Option<i64>,
}

impl ElevatedProcess {
    pub fn new(exe_path: &str, params: Option<&str>, cwd: Option<&str>) -> io::Result<Self> {
        let verb = wide("runas");
        let file = wide(exe_path);
        let params = params.map(wide);
        let cwd = cwd.map(wide);
        let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
        info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
        info.lpVerb = verb.as_ptr();
        info.lpFile = file.as_ptr();
        info.lpParameters = params.as_ref().map_or(null(), |p| p.as_ptr());
        info.lpDirectory = cwd.as_ref().map_or(null(), |p| p.as_ptr());
        info.nShow = SW_SHOWNORMAL;
        if unsafe { ShellExecuteExW(&mut info) } == 0 {
            return Err(io::Error::last_os_error());
        }
        if info.hProcess.is_null() {
            return Err(io::Error::other(format!(
                "Elevated launch of {exe_path} returned no process handle"
            )));
        }
        let pid = unsafe { GetProcessId(info.hProcess) };
        Ok(ElevatedProcess { handle: info.hProcess, pid, returncode: None })
    }

    fn wait_ms(&mut self, timeout_ms: u32) -> Option<i64> {
        if self.returncode.is_some() {
            return self.returncode;
        }
        if unsafe { WaitForSingleObject(self.handle, timeout_ms) } != WAIT_OBJECT_0 {
            return None;
        }
        let mut code = 0u32;
        unsafe {
            GetExitCodeProcess(self.handle, &mut code);
            CloseHandle(self.handle);
        }
        self.returncode = Some(code as i64);
        self.returncode
    }

    pub fn poll(&mut self) -> Option<i64> {
        self.wait_ms(0)
    }

    pub fn wait(&mut self) -> Option<i64> {
        self.wait_ms(INFINITE)
    }

    pub fn terminate(&mut self) {
        if self.returncode.is_none() {
            unsafe { TerminateProcess(self.handle, 1) };
        }
    }
}

impl Drop for ElevatedProcess {
    fn drop(&mut self) {
        if self.returncode.is_none() {
            unsafe { CloseHandle(self.handle) };
        }
    }
}

/// TerminateProcess by pid. False only when the process exists but access is denied.
pub fn terminate_pid(pid: u32) -> bool {
    let handle = unsafe { OpenProcess(PROCESS_TERMINATE, 0, pid) };
    if handle.is_null() {
        // Anything but a denial means the process is already gone
        return io::Error::last_os_error().raw_os_error() != Some(ERROR_ACCESS_DENIED as i32);
    }
    let terminated = unsafe { TerminateProcess(handle, 1) } != 0;
    let denied = !terminated && io::Error::last_os_error().raw_os_error() == Some(ERROR_ACCESS_DENIED as i32);
    unsafe { CloseHandle(handle) };
    !denied
}

/// Fire-and-forget elevated launch, with no process handle.
pub fn shell_execute_runas(exe_path: &str, cwd: &str) -> io::Result<()> {
    let verb = wide("runas");
    let file = wide(exe_path);
    let dir = wide(cwd);
    let result = unsafe {
        ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), null(), dir.as_ptr(), SW_SHOWNORMAL)
    };
    // Values of 32 or below are errors
    if result as isize <= 32 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}
