"""Archive detection and extraction for the Ascendara downloader.

Decoders run in a separate worker process; supervise_extraction is the only
entry point the downloader needs. Nothing here touches the network.
"""
import ctypes
import errno
import json
import logging
import multiprocessing
import os
import re
import shutil
import stat
import subprocess
import sys
import threading
import time
import zipfile
import zlib
from tempfile import NamedTemporaryFile
from typing import Optional, Tuple

from AscendaraRarRecovery import (
    _load_api, _extended_path, _check_path, _member_path, _native_error,
    _file_error, _check_archive_target, trust_link,
)


class IncompleteArchiveOutput(RuntimeError):
    """Decoder finished, but its output did not pass staging verification."""
    def __init__(self, message, errors=None, recovery_attempted=False):
        super().__init__(message)
        self.errors = errors or []
        self.recovery_attempted = recovery_attempted


class ExtractionRecoveryCancelled(RuntimeError):
    def __init__(self, message, failure=None):
        if failure is not None:
            message += f'. Extraction failure: {failure}'
        super().__init__(message)


def _win32_read_error(path):
    """Return the Win32 error for opening and reading a file's first bytes, or 0."""
    try:
        from ctypes import wintypes
        kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel32.CreateFileW.restype = wintypes.HANDLE
        kernel32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                                         wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
        kernel32.ReadFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                                      ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
        # GENERIC_READ, share read/write/delete, OPEN_EXISTING
        handle = kernel32.CreateFileW(path, 0x80000000, 7, None, 3, 0, None)
        if handle is None or handle == wintypes.HANDLE(-1).value:
            return ctypes.get_last_error()
        try:
            buffer, count = ctypes.create_string_buffer(8), wintypes.DWORD()
            if not kernel32.ReadFile(handle, buffer, 8, ctypes.byref(count), None):
                return ctypes.get_last_error()
            return 0
        finally:
            kernel32.CloseHandle(handle)
    except Exception:
        logging.debug('Could not query the Win32 error for %r', path, exc_info=True)
        return 0


def detect_file_type(filepath: str, check_cancelled=lambda: None) -> Tuple[str, Optional[str]]:
    """Detect file type from magic bytes."""
    # Reopen for every attempt; never retry a read on an invalid handle.
    # Keep filesystem failures separate from corrupt-archive repair.
    from AscendaraDownloadRecovery import wait_for_retry
    native_path = _extended_path(filepath)
    paths = [native_path]
    # Callers may already pass an extended path, so derive the ordinary
    # form from it instead of from the argument.
    if os.name == 'nt' and native_path.startswith('\\\\?\\'):
        ordinary_path = ('\\\\' + native_path[8:] if native_path.startswith('\\\\?\\UNC\\')
                         else native_path[4:])
        paths.append(ordinary_path)
    for attempt in range(4):
        check_cancelled()
        try:
            for index, candidate in enumerate(paths):
                try:
                    # Read only the signature, without BufferedReader's larger
                    # read-ahead request to Windows filesystem/filter drivers.
                    with open(candidate, 'rb', buffering=0) as f:
                        sig = b''
                        while len(sig) < 8:
                            check_cancelled()
                            chunk = f.read(8 - len(sig))
                            if not chunk:
                                break
                            sig += chunk
                    break
                except OSError as exc:
                    if exc.errno != errno.EINVAL or index == len(paths) - 1:
                        raise
                    logging.warning('Archive header path rejected; trying ordinary path: %r', candidate)
            break
        except InterruptedError:
            raise
        except OSError as exc:
            # The C runtime reports every Win32 error it does not know as
            # EINVAL, so ask Windows for the code behind it.
            winerror = getattr(exc, 'winerror', None)
            if not winerror and os.name == 'nt' and exc.errno == errno.EINVAL:
                winerror = _win32_read_error(native_path)
            blocked = winerror in (225, 226)
            device = winerror in (1006, 1117, 1392)
            retryable = not (blocked or device) and (
                isinstance(exc, PermissionError) or (os.name == 'nt' and exc.errno == errno.EINVAL))
            if not retryable or attempt == 3:
                logging.exception('Archive header read failed: path=%r errno=%s winerror=%s',
                                  filepath, exc.errno, winerror)
                if blocked:
                    reason = ('Security software blocked the downloaded archive. Check its '
                              'protection history and add an exclusion for the download folder')
                elif device:
                    reason = ('The drive reported an error while reading the downloaded archive. '
                              'Check the drive for errors or download to another drive')
                else:
                    reason = exc.strerror or str(exc)
                if winerror:
                    reason += f' (Windows error {winerror}: {ctypes.FormatError(winerror).strip()})'
                raise OSError(exc.errno, f'Cannot read downloaded archive header: {reason}. '
                              'The source file was retained.', filepath) from exc
            logging.warning('Retrying archive header read (%s/3): errno=%s winerror=%s path=%r',
                            attempt + 1, exc.errno, winerror, filepath)
            def stopped():
                check_cancelled()
                return False
            wait_for_retry(.25 * 2 ** attempt, stopped)
        
    if sig.startswith(b'PK\x03\x04') or sig.startswith(b'PK\x05\x06') or sig.startswith(b'PK\x07\x08'):
        return 'zip', None
    elif sig.startswith(b'Rar!\x1A\x07\x00') or sig.startswith(b'Rar!\x1A\x07\x01\x00'):
        return 'rar', None
    elif sig.startswith(b'7z\xBC\xAF\x27\x1C'):
        return '7z', None
    elif sig.startswith(b'MZ'):
        return 'exe', None
    else:
        return 'unknown', sig.hex()


def verify_manifest(root, manifest, check_cancelled):
    root = _extended_path(root)
    errors = []
    next_check = 0
    for name, info in manifest.items():
        now = time.monotonic()
        if now >= next_check:
            check_cancelled()
            next_check = now + .5
        path = _member_path(root, name)
        try:
            for attempt in range(4):
                try:
                    actual = os.stat(path)
                    break
                except (FileNotFoundError, PermissionError):
                    if attempt == 3:
                        raise
                    from AscendaraDownloadRecovery import wait_for_retry
                    def stopped():
                        check_cancelled()
                        return False
                    wait_for_retry(.2 * 2 ** attempt, stopped)
            if not stat.S_ISREG(actual.st_mode):
                errors.append({'file': name, 'error': 'Expected a regular file'})
            elif actual.st_size != info['size']:
                errors.append({'file': name, 'error': f"Size mismatch: expected {info['size']}, got {actual.st_size}"})
        except FileNotFoundError:
            errors.append({'file': name, 'error': 'File not found'})
        except InterruptedError:
            raise
        except OSError as exc:
            errors.append({'file': name, 'error': str(exc)})
    check_cancelled()
    return errors


def _wanted(name):
    return not name.lower().endswith('.url') and '_commonredist' not in name.lower()


def _skip_link(name):
    # Repacks can carry stray symlinks (for example a source tree's test links).
    # Links are never written, so they cannot redirect output; skip them rather
    # than fail the whole game.
    logging.warning('Skipping archive link: %r', name)


def _rar_header_link(header):
    return bool(getattr(header, 'RedirType', 0)
                or header.HostOS == 3 and stat.S_ISLNK(header.FileAttr)
                or header.HostOS != 3 and header.FileAttr & 0x400)


class StopSignal:
    """One shared byte; no semaphore can be left locked by a crashed decoder."""
    def __init__(self, context):
        self.flag = context.RawValue('b', 0)

    def is_set(self):
        return bool(self.flag.value)

    def set(self):
        self.flag.value = 1

    def wait(self, seconds):
        time.sleep(seconds)
        return self.is_set()


def _find_7z():
    roots = [getattr(sys, '_MEIPASS', ''), os.path.dirname(sys.executable),
             os.path.dirname(__file__), r'C:\Program Files\7-Zip', r'C:\Program Files (x86)\7-Zip']
    if sys.platform == 'darwin' and not getattr(sys, 'frozen', False):
        roots.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../.build-tools/macos/7zip')))
    # Prefer our verified, full-codec tool over an unrelated system installation.
    candidates = [os.path.join(root, name) for root in roots if root for name in ('7z.exe', '7zz', '7z')]
    candidates += [shutil.which('7zz'), shutil.which('7z'), shutil.which('7za')]
    return next((path for path in candidates if path and os.path.isfile(path)), None)


def _find_hatchzip():
    roots = [getattr(sys, '_MEIPASS', ''), os.path.dirname(sys.executable), os.path.dirname(__file__)]
    if not getattr(sys, 'frozen', False):
        roots.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../.build-tools/hatchzip/host')))
    name = 'hatchzip.exe' if os.name == 'nt' else 'hatchzip'
    candidates = [os.path.join(root, name) for root in roots if root] + [shutil.which('hatchzip')]
    return next((path for path in candidates
                 if path and os.path.isfile(path) and os.access(path, os.X_OK)), None)


def inplace_paths(archive):
    """Output folder and state file of an in-place extraction, beside the archive.

    The folder outlives the stage: once HatchZip has consumed the archive, its
    output is the retained source for retries until installation finishes.
    """
    folder, name = os.path.split(archive)
    output = os.path.join(folder, f'.ascendara-inplace-{name}.out')
    return output, output[:-len('.out')] + '.json'


def _load_inplace_state(state_path):
    try:
        with open(state_path, encoding='utf-8') as stream:
            return json.load(stream)
    except (OSError, ValueError):
        return None


def inplace_consumed(archive):
    """True once part of the archive is gone and only a resumed extraction can finish it.

    A re-download would throw that progress away. Archives that cannot resume
    anyway (a solid RAR with freed data) are not consumed in this sense.
    """
    output, state_path = inplace_paths(archive)
    saved = _load_inplace_state(state_path)
    if saved is not None and saved.get('engine') == 'rar':
        return bool(saved.get('freed')) and not saved.get('unresumable')
    return os.path.exists(archive + '.hatchzip') or (
        not os.path.exists(archive) and saved is not None)


def inplace_retained(archive):
    """True when a consumed archive's extracted output can stand in for it."""
    output, state_path = inplace_paths(archive)
    try:
        with open(state_path, encoding='utf-8') as stream:
            return bool(json.load(stream).get('complete')) and os.path.isdir(output)
    except (OSError, ValueError):
        return False


def _external_tool_env():
    """Environment for spawning system binaries, undoing PyInstaller's LD_LIBRARY_PATH hijack.

    On Linux, PyInstaller's onefile bootloader points LD_LIBRARY_PATH at its bundled
    libs (readline/tinctures/libssl, etc.) so the frozen interpreter can find them.
    That variable leaks into every child process. Tools like p7zip's `7z` wrapper
    exec `/bin/sh`, which then tries to resolve readline symbols against our bundled
    (incompatible) library and dies with "undefined symbol: rl_print_keybinding".
    Restore the original value PyInstaller saves in LD_LIBRARY_PATH_ORIG, or strip it.
    """
    if os.name == 'nt':
        return None
    locale = os.environ.get('LC_ALL') or os.environ.get('LC_CTYPE') or os.environ.get('LANG') or ''
    needs_utf8 = 'utf-8' not in locale.lower() and 'utf8' not in locale.lower()
    if 'LD_LIBRARY_PATH' not in os.environ and not needs_utf8:
        return None
    env = os.environ.copy()
    if 'LD_LIBRARY_PATH' in env:
        original = env.pop('LD_LIBRARY_PATH_ORIG', None)
        if original:
            env['LD_LIBRARY_PATH'] = original
        else:
            env.pop('LD_LIBRARY_PATH', None)
    if needs_utf8:
        env.pop('LC_ALL', None)
        env['LC_CTYPE'] = 'C.UTF-8'
        env['LANG'] = 'C.UTF-8'
    return env


# Disk I/O of external extractor processes: [read, written] bytes of the tools
# that already exited, plus the one still running.
_tool_io = [0, 0]
_tool_process = None
# Last counters sampled from the running tool, kept for when it has been reaped.
_tool_seen = [0, 0]
# Held while a finished tool's counters move into _tool_io, so samples never dip.
_tool_lock = threading.Lock()


def _process_io(process=None):
    """Cumulative (read, written) bytes for this process or a child; None if unknown."""
    try:
        if os.name == 'nt':
            class Counters(ctypes.Structure):
                _fields_ = [(name, ctypes.c_ulonglong) for name in
                            ('read_ops', 'write_ops', 'other_ops', 'read', 'written', 'other')]
            kernel32 = ctypes.windll.kernel32
            kernel32.GetCurrentProcess.restype = ctypes.c_void_p
            kernel32.GetProcessIoCounters.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters)]
            handle = int(process._handle) if process is not None else kernel32.GetCurrentProcess()
            counters = Counters()
            if not kernel32.GetProcessIoCounters(handle, ctypes.byref(counters)):
                return None
            return counters.read, counters.written
        if sys.platform == 'darwin':
            # rusage_info_v2 up to its disk I/O fields; reads count physical disk reads only.
            class Usage(ctypes.Structure):
                _fields_ = [('uuid', ctypes.c_uint8 * 16)] + [
                    (str(index), ctypes.c_uint64) for index in range(16)] + [
                    ('read', ctypes.c_uint64), ('written', ctypes.c_uint64)]
            usage = Usage()
            libproc = ctypes.CDLL('/usr/lib/libproc.dylib')
            if libproc.proc_pid_rusage(process.pid if process is not None else os.getpid(),
                                       2, ctypes.byref(usage)) != 0:
                return None
            return usage.read, usage.written
        with open(f'/proc/{process.pid if process is not None else os.getpid()}/io') as stream:
            values = dict(line.split(': ', 1) for line in stream.read().splitlines())
        return int(values['rchar']), int(values['wchar'])
    except Exception:
        return None  # No per-process counters; progress still works.


def _extraction_io(baseline):
    """Bytes this worker and its extractor tools have read and written since `baseline`."""
    own = _process_io()
    if own is None or baseline is None:
        return None
    with _tool_lock:
        process = _tool_process
        tool = _process_io(process) if process is not None else None
        if tool:
            _tool_seen[:] = tool
        elif process is not None:
            tool = _tool_seen  # Exited and reaped: its counters are gone.
        else:
            tool = (0, 0)
        return [max(0, own[0] - baseline[0]) + _tool_io[0] + tool[0],
                max(0, own[1] - baseline[1]) + _tool_io[1] + tool[1]]


class ToolExit(RuntimeError):
    def __init__(self, message, returncode, diagnostics):
        super().__init__(message)
        self.returncode = returncode
        self.diagnostics = diagnostics


def _run_cli(command, cancelled, activity, tick=None):
    """Drain combined output continuously and always reap the native child."""
    global _tool_process
    from collections import deque
    tail = deque(maxlen=64)
    diagnostics = []
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, env=_external_tool_env(),
                               creationflags=0x08000000 if os.name == 'nt' else 0)
    with _tool_lock:
        _tool_seen[:] = 0, 0
        _tool_process = process
    def drain():
        import codecs
        decoder = codecs.getincrementaldecoder('utf-8')(errors='replace')
        pending = ''
        def remember(line):
            line = line.replace('\b', '').strip()
            if len(diagnostics) < 12 and re.search(
                    r'error|unsupported|cannot|can not|failed|wrong password|not enough', line, re.I):
                diagnostics.append(line[:500])
        while True:
            chunk = process.stdout.read1(4096)
            if not chunk:
                remember(pending + decoder.decode(b'', final=True))
                return
            tail.append(chunk)
            text = decoder.decode(chunk)
            lines = re.split(r'[\r\n]', pending + text)
            pending = lines.pop()[-8192:]
            for line in lines:
                remember(line)
            if not failures:
                try:
                    activity(text)
                except BaseException as exc:
                    # Raised on the main thread; keep draining so the tool never blocks.
                    failures.append(exc)
    failures = []
    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    try:
        while process.poll() is None:
            cancelled()
            if failures:
                raise failures[0]
            if tick is not None:
                tick()
            time.sleep(.1)
        reader.join()
        if failures:
            raise failures[0]
        if process.returncode != 0:
            raise ToolExit(f'Extractor exited with code {process.returncode}: ' +
                           '\n'.join(diagnostics) + '\n' +
                           b''.join(tail).decode('utf-8', errors='replace').replace('\b', '')[-4000:],
                           process.returncode, diagnostics)
        return b''.join(tail).decode('utf-8', errors='replace')
    finally:
        # Keep what the tool transferred before its handle goes away.
        with _tool_lock:
            final = _process_io(process) or _tool_seen
            _tool_process = None
            if final:
                _tool_io[0] += final[0]
                _tool_io[1] += final[1]
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        reader.join(timeout=3)
        process.stdout.close()


def _unrar_manifest(tool, archive, destination, listing_path, cancelled, activity):
    """Inspect RAR headers with the extraction decoder, without requiring 7-Zip."""
    with open(listing_path, 'w', encoding='utf-8') as listing:
        def listing_activity(text):
            listing.write(text)
            activity(text)
        _run_cli([tool, 'lt', '-v', '-cfg-', '-c-', '-psteamrip.com', '--', archive],
                 cancelled, listing_activity)
    manifest = {}
    with open(listing_path, encoding='utf-8') as listing:
        records = listing.read().split('\n\n')
    for record in records:
        values = dict(line.lstrip().split(': ', 1) for line in record.splitlines() if ': ' in line)
        name = values.get('Name')
        if name is None or not _wanted(name):
            continue
        _check_archive_target(archive, _member_path(destination, name))
        # Links and file references must not bypass staging path validation.
        # Left out of the manifest, they are also left out of the -n@ selection.
        if values.get('Type') not in ('File', 'Directory') or values.get('Attributes', '').startswith('l'):
            _skip_link(name)
            continue
        if values['Type'] == 'File' and values.get('Size', '').isdigit():
            manifest[name.replace('\\', '/')] = {'size': int(values['Size'])}
    return manifest


class UnrarProgress:
    """Read UnRAR's in-place console updates across arbitrary pipe chunks."""
    def __init__(self, destination, manifest, state, on_complete=None):
        self.destination = os.path.join(destination, '').replace('\\', '/')
        self.manifest = manifest
        self.state = state
        self.on_complete = on_complete
        self.pending = ''
        self.completed = set()
        self.completed_bytes = 0
        self.next_sample = 0

    def feed(self, text):
        lines = (self.pending + text).replace('\r', '\n').split('\n')
        self.pending = lines.pop()
        for line in [*lines, self.pending]:
            percentages = re.findall(r'(\d+)%', line)
            if percentages:
                self.state['percent'] = min(100, int(percentages[-1]))
            # UnRAR pads the filename then writes percentages using backspaces.
            # Keep the unfinished line so neither names nor percentages are lost
            # when the pipe splits a message in the middle.
            match = re.match(r'^Extracting\s+(.+)', line)
            if not match:
                continue
            name = match.group(1).split('\b', 1)[0].rstrip()
            name = re.sub(r'\s+OK$', '', name).rstrip()
            name = re.sub(r'\s+\d+%$', '', name).rstrip().replace('\\', '/')
            if name.startswith(self.destination):
                name = name[len(self.destination):]
            if name not in self.manifest:
                continue  # Ignore "Extracting from <archive>" and directory messages.
            self.state['name'] = name
            if re.search(r'\bOK\s*$', line) and name not in self.completed:
                self.completed.add(name)
                self.completed_bytes += self.manifest[name]['size']
                self.state.update(files=len(self.completed), bytes=self.completed_bytes)
                if self.on_complete is not None:
                    self.on_complete(name)
        # Bound memory even if an extractor emits a malformed, unterminated line.
        self.pending = self.pending[-16384:]
        now = time.monotonic()
        if now >= self.next_sample:
            self.next_sample = now + .5
            name = self.state['name']
            partial_bytes = 0
            if name in self.manifest and name not in self.completed:
                try:
                    # Sample only the active output, never walk the whole game tree.
                    partial_bytes = min(os.stat(os.path.join(self.destination, name)).st_size,
                                        self.manifest[name]['size'])
                except OSError:
                    pass  # The decoder may not have created the file yet.
            self.state['bytes'] = max(self.state.get('bytes', 0),
                                      self.completed_bytes + partial_bytes)


def _extract_unrar(tool, archive, destination, names, cancelled, activity, tick=None):
    # Archived read-only attributes can prevent unpacking continuation archives
    # and moving/deleting staging files on Linux.
    # A UTF-8 list avoids command-line size limits for large manifests.
    with NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.unrar-list', delete=False) as selection:
        selection_path = selection.name
        for name in sorted(names):
            selection.write(name + '\n')
    try:
        filters = ['-scfl', '-n@' + selection_path] if names else []
        _run_cli([tool, 'x', '-cfg-', '-y', '-o+', '-ol-', '-ai', '-psteamrip.com', '-@',
                  *filters, '--', archive, os.path.join(destination, '')], cancelled, activity, tick)
    finally:
        try:
            os.remove(selection_path)
        except OSError:
            pass


def extract_rar_stream(archive_path, dest_dir, password='steamrip.com',
                         on_file=None, should_stop=None, on_progress=None, members=None,
                         on_passed=None, test=False):
    """Extract in one native UnRAR pass, with Python used only for supervision.

    Existing regular files are overwritten. Failed files can remain partial.
    The destination must not be concurrently modified by another process.
    Native UnRAR writes output and checks CRC; Python verifies the expected size.
    on_file(name, size) runs after each file passes CRC and closes successfully.
    should_stop() is checked per header and at most every 0.5 seconds in chunks;
    a true result raises InterruptedError after the native call returns.
    on_passed(name, size) runs after every header, extracted or skipped, in archive order.
    test=True decodes and checks every file without writing anything.
    """
    api = _load_api()
    archive_path = _extended_path(archive_path)
    root = _extended_path(dest_dir)
    _check_path(root, root)
    try:
        os.makedirs(root, exist_ok=True)
    except OSError as exc:
        raise _file_error('create destination for', root, exc) from exc
    target = None
    callback_error = None
    next_stop_check = 0.0
    next_progress = 0.0
    written = 0
    name = ''
    expected_size = 0
    extracting_file = False

    def check_stop(force=False):
        nonlocal next_stop_check
        if should_stop is not None:
            now = time.monotonic()
            if force or now >= next_stop_check:
                next_stop_check = now + 0.5
                if should_stop():
                    raise InterruptedError('RAR extraction cancelled')

    def on_event(message, user_data, data, size):
        nonlocal callback_error, written, next_progress
        if callback_error is not None:
            return -1
        try:
            if message == 1:
                check_stop()
                if size < 0 or (size and not data):
                    raise ValueError('Invalid UnRAR decompression buffer')
                if extracting_file:
                    written += size
                now = time.monotonic()
                if on_progress is not None and now >= next_progress:
                    on_progress(name, written, expected_size)
                    next_progress = now + .5
                return 1
            if message in (0, 3):
                return 1 if size == 1 else -1
            return -1
        except BaseException as exc:
            callback_error = exc
            return -1

    callback = api.Callback(on_event)
    data = api.OpenData(_extended_path(archive_path), mode=1)
    handle = api.open(ctypes.byref(data))
    if not handle:
        _native_error(data.OpenResult or 15, 'Opening archive')
    count = 0
    try:
        _native_error(data.OpenResult, 'Opening archive')
        api.callback(handle, callback, 0)
        if password is not None:
            api.password(handle, password.encode('utf-8') if isinstance(password, str) else password)
        while True:
            check_stop(force=True)
            written = 0
            header = api.Header()
            code = api.read(handle, ctypes.byref(header))
            if callback_error is not None:
                raise callback_error
            if code == 10:
                break
            _native_error(code, 'Reading archive header')
            name = header.FileNameW or header.FileName.decode('utf-8', errors='strict')
            expected_size = header.UnpSize + (header.UnpSizeHigh << 32)
            normalized = name.replace('\\', '/')
            skip = not test and (not _wanted(name) or members is not None and normalized not in members)
            if not skip and not test and _rar_header_link(header):
                _skip_link(name)
                skip = True
            directory = bool(header.Flags & 0x20) or name.endswith(('/', '\\'))
            extracting_file = not skip and not directory
            if not skip and not test:
                target = _member_path(root, name)
                _check_archive_target(archive_path, target)
                try:
                    os.makedirs(target if directory else os.path.dirname(target), exist_ok=True)
                    _check_path(root, target)
                except OSError as exc:
                    raise _file_error('create', target, exc) from exc
            # RAR_EXTRACT=2 writes inside UnRAR. RAR_SKIP=0 also avoids testing
            # unwanted files; UnRAR handles dictionary continuity for solid sets.
            code = api.process(handle, 0 if skip else 1 if test else 2,
                               None if skip or test else root + os.sep, None)
            if callback_error is not None:
                raise callback_error
            check_stop(force=True)
            if code in (16, 17, 19):
                raise OSError(f'Native RAR extraction could not write {name!r} (UnRAR error {code})')
            _native_error(code, f'Extracting {name!r}')
            if not skip and not directory and not test:
                actual_size = os.path.getsize(target)
                if actual_size != expected_size:
                    raise RuntimeError(f'Incomplete RAR output for {name!r}: expected {expected_size} bytes, wrote {actual_size}')
                count += 1
                if on_file is not None:
                    on_file(name, expected_size)
            if on_passed is not None:
                on_passed(normalized, expected_size)
        return count
    finally:
        code = api.close(handle)
        if sys.exc_info()[0] is None:
            _native_error(code, 'Closing archive')


def _zip_files(archive, destination, wanted=_wanted, links=None):
    """Manifest of regular entries; link entries are left out and appended to `links`."""
    manifest = {}
    with zipfile.ZipFile(archive) as source:
        for item in source.infolist():
            if not wanted(item.filename):
                continue
            _check_archive_target(archive, _member_path(destination, item.filename))
            if stat.S_ISLNK(item.external_attr >> 16):
                _skip_link(item.filename)
                if links is not None:
                    links.append(item.filename)
                continue
            if not item.is_dir():
                manifest[item.filename.replace('\\', '/')] = {'size': item.file_size}
    return manifest


def _7z_files(tool, archive, destination, listing_path, cancelled, activity, wanted=_wanted, links=None):
    """Manifest of regular entries; link entries are left out and appended to `links`."""
    # Stream the full listing to disk; large manifests must not be kept in a pipe tail.
    with open(listing_path, 'w', encoding='utf-8', newline='') as listing:
        def listing_activity(text):
            listing.write(text)
            activity(text)
        _run_cli([tool, 'l', '-slt', '-ba', '-sccUTF-8', '-psteamrip.com', '--', archive], cancelled, listing_activity)
    with open(listing_path, encoding='utf-8') as listing:
        records = listing.read().split('\n\n')
    manifest = {}
    for record in records:
        values = dict(line.split(' = ', 1) for line in record.splitlines() if ' = ' in line)
        name = values.get('Path')
        if not name or not wanted(name):
            continue
        _check_archive_target(archive, _member_path(destination, name))
        if values.get('Symbolic Link') or values.get('Hard Link') or 'l' in values.get('Attributes', '').split(' ')[-1][:1]:
            _skip_link(name)
            if links is not None:
                links.append(name)
            continue
        if values.get('Folder') != '+' and not values.get('Attributes', '').startswith('D'):
            manifest[name.replace('\\', '/')] = {'size': int(values['Size'])}
    return manifest


def _link_output(output, destination, names, cancelled):
    """Hard-link in-place output into the stage, keeping the output as the retained source."""
    for name in names:
        cancelled()
        # Another archive's worker may have linked the same name (each release's
        # Read_Me, for example); that link is removed below, never written through.
        target = _member_path(destination, name, replacing=True)
        # The retained output is ours and may still be linked from an earlier stage.
        source = os.path.join(_extended_path(output), *name.split('/'))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        try:
            os.remove(target)
        except FileNotFoundError:
            pass
        try:
            os.link(source, target)
            trust_link(target)
        except FileNotFoundError:
            raise IncompleteArchiveOutput(
                f'Extracted file is no longer available for {name}; download the game again',
                [{'file': name, 'error': 'File not found'}], recovery_attempted=True)
        except OSError:
            # FAT32 and exFAT have no hard links. Moving gives up the retained copy.
            shutil.move(source, target)


def trust_inplace_output(archive, destination, manifest):
    """Trust, in this process, the hard links an extraction worker made for `archive`.

    Each link is proven to be the retained output file before it is trusted.
    """
    output = inplace_paths(archive)[0]
    if not inplace_retained(archive):
        return
    for name in manifest:
        target = os.path.join(_extended_path(destination), *name.split('/'))
        try:
            if os.path.samefile(os.path.join(_extended_path(output), *name.split('/')), target):
                trust_link(target)
        except OSError:
            pass  # Moved instead of linked, so there is no link to trust.


def _save_inplace_state(path, value):
    temporary = path + '.tmp'
    with open(temporary, 'w', encoding='utf-8') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    for attempt in range(8):
        try:
            os.replace(temporary, path)
            return
        except PermissionError:
            # Security software briefly opens freshly written files.
            if attempt == 7:
                raise
            time.sleep(.05 * 2 ** attempt)


def _extract_inplace(tool, kind, archive, destination, listing_path, state, report, cancelled):
    """Extract with HatchZip, which truncates the archive as files are written.

    Only free space for the output is needed instead of the output plus the
    archive. An interrupted run resumes from HatchZip's journal next to the
    archive, so the output folder and state file must survive the stage.
    """
    output, state_path = inplace_paths(archive)
    journal_path = archive + '.hatchzip'
    try:
        with open(state_path, encoding='utf-8') as stream:
            saved = json.load(stream)
    except (OSError, ValueError):
        saved = None
    fresh = os.path.exists(archive) and not os.path.exists(journal_path)
    if fresh:
        # Whatever is here belongs to an abandoned attempt on an older copy of
        # the archive, and HatchZip refuses to write over existing files.
        if os.path.isdir(output):
            shutil.rmtree(output, onerror=lambda function, path, error: (
                os.chmod(path, stat.S_IWRITE | stat.S_IREAD), function(path)))
        links = []
        if kind == 'zip':
            files = _zip_files(archive, output, wanted=lambda name: True, links=links)
        else:
            seven = _find_7z()
            if not seven:
                raise RuntimeError('7z extraction requires a bundled or installed 7-Zip command-line tool')
            files = _7z_files(seven, archive, output, listing_path, cancelled,
                              lambda text: report(), wanted=lambda name: True, links=links)
        if links:
            # HatchZip extracts every entry; callers route linked archives elsewhere.
            raise ValueError(f'Refusing archive link for in-place extraction: {links[0]}')
        saved = {'files': {name: info['size'] for name, info in files.items()}, 'complete': False}
        _save_inplace_state(state_path, saved)
    elif saved is None:
        raise RuntimeError('In-place extraction state is missing for a partly extracted archive. '
                           'Download the game again')
    files = saved['files']
    total_bytes = sum(files.values())
    state.update(total=len(files), bytes=0, percent=0)
    if not saved['complete'] and (os.path.exists(archive) or os.path.exists(journal_path)):
        present = 0
        for name, size in files.items():
            try:
                present += size if os.path.getsize(_member_path(output, name)) == size else 0
            except OSError:
                pass
        archive_size = os.path.getsize(archive) if fresh else 0
        next_journal = 0
        def tick():
            nonlocal next_journal
            io = _process_io(_tool_process) if _tool_process is not None else None
            done = None
            if io and fresh and io[1] == 0:
                # --verify-first reads everything before the archive is touched.
                state.update(name='Verifying archive...',
                             percent=min(99, io[0] / archive_size * 100) if archive_size else 0)
                report()
                return
            if io:
                done = present + io[1]
            now = time.monotonic()
            if done is None and now >= next_journal:
                next_journal = now + 1
                try:
                    with open(journal_path, encoding='utf-8') as stream:
                        journal = json.load(stream)
                    original = sum(length for _, length in journal['parts'])
                    done = total_bytes * (1 - journal['committed_len'] / original) if original else 0
                except (OSError, ValueError, KeyError, TypeError):
                    pass
            if done is None:
                return
            done = min(total_bytes, int(done))
            fraction = done / total_bytes if total_bytes else 1
            state.update(name='Extracting...', bytes=done, percent=fraction * 100,
                         files=int(len(files) * fraction))
            report()
        try:
            _run_cli([tool, 'extract', '--yes', '--quiet', '--verify-first', '--keep-free', '1GB',
                      '--password', 'steamrip.com', '--output', output, '--', archive],
                     cancelled, lambda text: report(), tick)
        except ToolExit as exc:
            detail = '; '.join(exc.diagnostics) or str(exc)
            if exc.returncode == 3:
                raise OSError(f'Insufficient disk space for extraction: {detail}') from exc
            if exc.returncode == 4:
                # The archive is verified before it is modified, so a re-download is safe.
                raise RuntimeError(f'Archive corrupt data: {detail}') from exc
            if exc.returncode == 5:
                raise RuntimeError(f'Incorrect password for archive: {detail}') from exc
            raise RuntimeError(f'In-place extraction stopped: {detail}. '
                               'Progress was saved and resumes when extraction is retried') from exc
    saved['complete'] = True
    _save_inplace_state(state_path, saved)
    manifest = {name: {'size': size} for name, size in files.items() if _wanted(name)}
    state.update(name='Linking extracted files...', files=len(files), bytes=total_bytes, percent=100)
    report(True)
    _link_output(output, destination, manifest, cancelled)
    return manifest


# Never let in-place extraction fill the disk completely.
KEEP_FREE = 1_000_000_000
# Archive data released together, so flushing and journaling stay infrequent.
RELEASE_BATCH = 256 * 1024 * 1024
FREED_MESSAGE = ('Part of this archive was released to make room before extraction stopped, and it '
                 'cannot resume from that point. Download the game again')


def _discard_inplace(output, state_path):
    for path in (state_path, state_path + '.tmp'):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
    if os.path.isdir(output):
        shutil.rmtree(output, onerror=lambda function, path, error: (
            os.chmod(path, stat.S_IWRITE | stat.S_IREAD), function(path)))


def _volume_fingerprint(layout):
    return [[os.path.basename(path), info.st_size, info.st_mtime_ns]
            for path, info in ((path, os.stat(path)) for path in layout.volumes)]


def _has_links(kind, archive, destination, listing_path, cancelled, report):
    """True when a ZIP or 7z archive holds link entries, which HatchZip cannot skip."""
    links = []
    if kind == 'zip':
        _zip_files(archive, destination, wanted=lambda name: True, links=links)
    elif kind == '7z':
        tool = _find_7z()
        if not tool:
            return False  # In-place extraction lists with 7-Zip too and reports its absence.
        _7z_files(tool, archive, destination, listing_path, cancelled, lambda text: report(),
                  wanted=lambda name: True, links=links)
    return bool(links)


def _fits_beside(kind, archive, destination, listing_path, cancelled, report):
    """True when the whole output fits next to the archive, so none of it must be released.

    A kept archive stays the recovery source for files lost after extraction.
    """
    if kind == 'zip':
        with zipfile.ZipFile(archive) as source:
            needed = sum(item.file_size for item in source.infolist())
    elif kind == 'rar':
        from AscendaraRarSpace import RarLayoutError, read_layout
        try:
            needed = sum(entry.size for entry in read_layout(archive).entries if not entry.directory)
        except (RarLayoutError, OSError):
            return False
    elif kind == '7z':
        tool = _find_7z()
        if not tool:
            return False
        needed = sum(info['size'] for info in _7z_files(
            tool, archive, destination, listing_path, cancelled, lambda text: report(),
            wanted=lambda name: True).values())
    else:
        return False
    return needed + KEEP_FREE <= shutil.disk_usage(destination).free


def rar_inplace_layout(archive):
    """The archive's data map when its space can be released during extraction, else None."""
    from AscendaraRarSpace import RarLayoutError, can_punch, read_layout
    try:
        layout = read_layout(archive)
    except (RarLayoutError, OSError) as exc:
        logging.info('RAR extracts without releasing space (%s): %s', exc, archive)
        return None
    # Linked archives take the ordinary path, which skips their links; a
    # hard-linked volume shares its bytes with another copy that freeing would damage.
    if any(entry.link for entry in layout.entries) or any(
            os.stat(volume).st_nlink > 1 for volume in layout.volumes):
        return None
    layout.punch = can_punch(os.path.dirname(archive))
    if not layout.punch and len(layout.volumes) == 1:
        return None  # No holes here, and a single volume cannot be deleted early.
    return layout


class RarReclaimer:
    """Releases the archive space of entries the extractor has passed, in batches as it goes.

    With holes, every header stays in place, so a non-solid archive can reopen
    and skip what is done. Without them, whole volumes are deleted once
    passed, and the extraction can no longer resume.
    """
    def __init__(self, layout, output, saved, save):
        self.layout, self.output, self.saved, self.save = layout, output, saved, save
        self.entries = layout.entries
        self.wanted = [not e.directory and _wanted(e.name) for e in self.entries]
        self.done = set(saved['done'])
        self.freed = set(saved['freed'])
        self.deleted = set(saved.get('deleted', []))
        self.remaining = sum(e.size for i, e in enumerate(self.entries) if self.wanted[i] and i not in self.done)
        self.passed = 0
        self.unreleased = 0
        self.unflushed = []
        self.enabled = True
        self.last_entry = {}
        for index, entry in enumerate(self.entries):
            for volume, _, _ in entry.pieces:
                self.last_entry[volume] = index

    def disable(self, reason):
        if self.enabled:
            logging.warning('Stopped releasing archive space: %s', reason)
            self.enabled = False

    def advance(self, passed):
        """Entries before `passed` are behind the extractor and never read again."""
        passed = min(passed, len(self.entries))
        for index in range(self.passed, passed):
            self.unreleased += sum(end - start for _, start, end in self.entries[index].pieces)
            if self.wanted[index] and index not in self.done:
                self.done.add(index)
                self.unflushed.append(index)
                self.remaining -= self.entries[index].size
        self.passed = max(self.passed, passed)
        if self.enabled and (self.unreleased >= RELEASE_BATCH
                             or shutil.disk_usage(self.output).free < self.remaining + KEEP_FREE):
            self.release()

    def _flush(self):
        from AscendaraRarSpace import flush_file
        for index in self.unflushed:
            entry = self.entries[index]
            path = os.path.join(_extended_path(self.output), *entry.name.split('/'))
            try:
                size = os.path.getsize(path)
            except OSError:
                size = None
            # A wrong passed signal must never free data that is not extracted yet.
            if size != entry.size:
                raise RuntimeError(f'Extracted size of {entry.name!r} is {size}, expected {entry.size}')
            flush_file(path)
        self.unflushed = []

    def release(self):
        from AscendaraRarSpace import punch_hole
        if self.layout.punch:
            indices = [i for i in range(self.passed) if i not in self.freed and self.entries[i].pieces]
            volumes = []
        else:
            # Volume v is closed once an entry beyond its last one is passed.
            indices = []
            current = (self.entries[self.passed].pieces[0][0]
                       if self.passed < len(self.entries) and self.entries[self.passed].pieces
                       else len(self.layout.volumes))
            volumes = [v for v in range(len(self.layout.volumes)) if v not in self.deleted
                       and v < current and self.last_entry.get(v, -1) < self.passed]
        self.unreleased = 0
        if not indices and not volumes:
            return
        try:
            self._flush()
        except (OSError, RuntimeError) as exc:
            self.disable(exc)
            return
        self.saved['done'] = sorted(self.done)
        if indices:
            self.freed.update(indices)
            self.saved.update(freed=sorted(self.freed), pending=indices)
            # A solid stream must be decoded from its start, so it cannot resume.
            self.saved['unresumable'] = self.saved.get('unresumable') or self.layout.solid
        else:
            self.saved['unresumable'] = True
        self.save()
        try:
            if self.saved['unresumable']:
                # Nothing rereads the headers of passed entries once resuming is
                # impossible, so each volume's passed prefix goes in one hole.
                spans = {}
                for index in self.freed:
                    for volume, start, end in self.entries[index].pieces:
                        low, high = spans.get(volume, (start, end))
                        spans[volume] = (min(low, start), max(high, end))
                for volume, (start, end) in spans.items():
                    punch_hole(self.layout.volumes[volume], start, end)
            else:
                for index in indices:
                    for volume, start, end in self.entries[index].pieces:
                        punch_hole(self.layout.volumes[volume], start, end)
        except OSError as exc:
            self.disable(exc)
        for volume in volumes:
            try:
                os.remove(self.layout.volumes[volume])
                self.deleted.add(volume)
            except OSError:
                pass  # Still open in the extractor; retried after the next entry.
        self.saved.update(pending=None, deleted=sorted(self.deleted))
        if indices:
            self.saved['volumes'] = _volume_fingerprint(self.layout)
        self.save()


def _extract_rar_inplace(archive, layout, destination, state, report, cancelled, stop):
    """Extract a RAR archive, releasing its space as extraction moves past each file.

    Output goes to a folder beside the archive that survives the stage, and
    progress is journaled, so an interrupted non-solid extraction resumes.
    """
    from AscendaraRarSpace import punch_hole
    output, state_path = inplace_paths(archive)
    saved = _load_inplace_state(state_path)
    if saved is not None and saved.get('engine') != 'rar':
        saved = None
    if saved is not None and saved.get('complete') and os.path.isdir(output):
        files = saved['files']
    else:
        if saved is not None and (saved.get('unresumable') or layout is None):
            _discard_inplace(output, state_path)
            raise RuntimeError(FREED_MESSAGE)
        if layout is None:
            raise RuntimeError('Archive volume is missing')
        entries = layout.entries
        files = {e.name: e.size for e in entries if not e.directory}
        if saved is not None and saved.get('pending'):
            # Interrupted while releasing: finish it before checking the volumes.
            for index in saved['pending']:
                for volume, start, end in entries[index].pieces:
                    punch_hole(layout.volumes[volume], start, end)
            saved.update(pending=None, volumes=_volume_fingerprint(layout))
            _save_inplace_state(state_path, saved)
        if saved is not None and (saved['volumes'] != _volume_fingerprint(layout) or saved['files'] != files):
            saved = None  # The archive was replaced, for example by a repair download.
        if saved is None:
            _discard_inplace(output, state_path)
            saved = {'engine': 'rar', 'files': files, 'complete': False, 'verified': False,
                     'volumes': _volume_fingerprint(layout), 'done': [], 'freed': [], 'pending': None}
            _save_inplace_state(state_path, saved)
        os.makedirs(output, exist_ok=True)
        # Only files journaled as done were flushed; anything else is redone.
        done = set()
        for index in saved['done']:
            entry = entries[index]
            try:
                if os.path.getsize(os.path.join(_extended_path(output), *entry.name.split('/'))) == entry.size:
                    done.add(index)
                    continue
            except OSError:
                pass
            if index in saved['freed']:
                _discard_inplace(output, state_path)
                raise RuntimeError(FREED_MESSAGE)
        saved['done'] = sorted(done)
        wanted = [i for i, e in enumerate(entries) if not e.directory and _wanted(e.name)]
        remaining = [i for i in wanted if i not in done]
        total_bytes = sum(entries[i].size for i in wanted)
        state.update(total=len(wanted), files=len(done), bytes=total_bytes - sum(entries[i].size for i in remaining),
                     percent=0, name='Preparing...')
        free = shutil.disk_usage(output).free
        # The most free space the run needs at any point, releasing as it goes.
        from AscendaraRarSpace import releasable
        released_after = {}
        for index, entry in enumerate(entries):
            if layout.punch and index not in saved['freed']:
                released_after[index] = sum(releasable(start, end) for _, start, end in entry.pieces)
        if not layout.punch:
            last_entry = {}
            for index, entry in enumerate(entries):
                for volume, _, _ in entry.pieces:
                    last_entry[volume] = index
            for volume, index in last_entry.items():
                if volume < len(layout.volumes) - 1:
                    released_after[index] = released_after.get(index, 0) + os.path.getsize(layout.volumes[volume])
        used = released = peak = 0
        remaining_set = set(remaining)
        for index, entry in enumerate(entries):
            if index in remaining_set:
                # Output an interrupted run left behind is overwritten, not added to.
                try:
                    existing = os.path.getsize(os.path.join(_extended_path(output), *entry.name.split('/')))
                except OSError:
                    existing = 0
                used += entry.size - min(existing, entry.size)
                peak = max(peak, used - released)
            released += released_after.get(index, 0)
        # A fresh start keeps the reserve. Once the archive is partly released,
        # finishing is the only way forward, so only an impossible run is refused.
        if peak + (0 if saved['freed'] else KEEP_FREE) > free:
            raise OSError(f'Insufficient disk space for extraction: {peak + KEEP_FREE} bytes '
                          f'are required while releasing the archive, {free} are free')
        if not saved['verified'] and not saved['freed']:
            # Nothing is released from a damaged archive; it can still be re-downloaded.
            state.update(name='Verifying archive...', percent=0)
            report(True)
            _rar_backend(archive, layout, output, [], state, report, cancelled, stop, test=True)
            saved['verified'] = True
            _save_inplace_state(state_path, saved)
        reclaimer = RarReclaimer(layout, output, saved, lambda: _save_inplace_state(state_path, saved))
        # An unverified archive is never released: if it is damaged, a re-download must still help.
        reclaimer.enabled = saved['verified']
        reclaimer.advance(0)
        state.update(name='Extracting...', percent=0)
        report(True)
        _rar_backend(archive, layout, output, remaining, state, report, cancelled, stop, reclaimer=reclaimer)
        reclaimer.advance(len(entries))
        saved.update(complete=True, done=sorted(reclaimer.done))
        _save_inplace_state(state_path, saved)
    manifest = {name: {'size': size} for name, size in files.items() if _wanted(name)}
    state.update(name='Linking extracted files...', files=len(manifest), total=len(manifest), percent=100)
    report(True)
    _link_output(output, destination, manifest, cancelled)
    return manifest


def _rar_backend(archive, layout, output, remaining, state, report, cancelled, stop, reclaimer=None, test=False):
    """Run the platform's RAR extractor over `remaining` entry indices, reporting passed entries."""
    entries = layout.entries
    names = {entries[i].name for i in remaining}
    total = sum(e.size for e in entries) if test else sum(entries[i].size for i in remaining)
    total = total or 1
    base = state.get('bytes', 0) if not test else 0
    index_of = {}
    for index, entry in enumerate(entries):
        index_of.setdefault(entry.name, []).append(index)
    def found(name, after):
        return next((i for i in index_of.get(name, ()) if i >= after), None)
    if os.name == 'nt':
        position = 0
        finished = 0
        def same(index, name, size):
            return 0 <= index < len(entries) and entries[index].name == name and entries[index].size == size
        def passed(name, size):
            nonlocal position
            previous = entries[position - 1] if 0 < position <= len(entries) else None
            # Skipping a file that spans volumes reports it again from each next volume.
            if (previous is not None and len(previous.pieces) > 1 and same(position - 1, name, size)
                    and not same(position, name, size)):
                return
            if reclaimer is not None and not same(position, name, size):
                reclaimer.disable(f'archive order differs at {name!r}')
            position += 1
            if reclaimer is not None:
                # A spanning entry is only behind UnRAR once the next entry starts.
                reclaimer.advance(position - 1 if len(entries[position - 1].pieces) > 1 else position)
        def progress(name, written, expected):
            state.update(name=name, bytes=base + finished + min(written, expected),
                         percent=min(100, (finished + min(written, expected)) / total * 100))
            report()
        def completed(name, size):
            nonlocal finished
            finished += size
            state.update(files=state.get('files', 0) + 1)
        extract_rar_stream(archive, output, on_file=None if test else completed, should_stop=stop.is_set,
                           on_progress=progress, members=names, on_passed=passed, test=test)
        return
    from AscendaraDownloadRecovery import find_unrar
    unrar = find_unrar()
    target = 0
    def tick():
        if reclaimer is not None:
            reclaimer.advance(target)
    if unrar:
        if test:
            _run_cli([unrar, 't', '-cfg-', '-y', '-psteamrip.com', '--', archive], cancelled,
                     lambda text: report())
            return
        manifest = {entries[i].name: {'size': entries[i].size} for i in remaining}
        def complete(name):
            nonlocal target
            index = found(name, target)
            if index is not None:
                target = max(target, index + 1)
        progress = UnrarProgress(output, manifest, state, complete)
        def activity(text):
            progress.feed(text)
            state['percent'] = min(100, progress.completed_bytes / total * 100)
            report()
        _extract_unrar(unrar, archive, output, names, cancelled, activity, tick)
        return
    tool = _find_7z()
    if not tool:
        raise RuntimeError('RAR extraction requires a bundled or installed 7-Zip command-line tool')
    if test:
        _run_cli([tool, 't', '-y', '-psteamrip.com', '--', archive], cancelled, lambda text: report())
        return
    pending = ''
    def activity(text):
        nonlocal pending, target
        lines = re.split(r'[\r\n\b]', pending + text)
        pending = lines.pop()[-8192:]
        for line in lines:
            # "- name" starts a file, so every entry before it is behind 7-Zip.
            match = re.match(r'(?:\d+%\s+(?:\d+\s+)?)?- (.+)$', line.strip())
            if match:
                name = match.group(1).replace('\\', '/')
                index = found(name, target)
                if index is not None:
                    target = max(target, index)
                    state['name'] = name
        percentages = re.findall(r'(\d+)%', text)
        if percentages:
            state['percent'] = int(percentages[-1])
        report()
    with NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.7z-list', delete=False) as selection:
        selection_path = selection.name
        for name in sorted(names):
            selection.write(name + '\n')
    try:
        _run_cli([tool, 'x', '-y', '-aoa', '-psteamrip.com', '-bsp1', '-bb1', '-sccUTF-8', '-scsUTF-8',
                  '-o' + output, '-i@' + selection_path, '--', archive], cancelled, activity, tick)
    finally:
        try:
            os.remove(selection_path)
        except OSError:
            pass


def _retry_archive_members(kind, archive, destination, names, cancelled, activity, use_cli=False):
    selected = {name.replace('\\', '/') for name in names}
    if kind in ('inplace', 'rarinplace'):
        _link_output(inplace_paths(archive)[0], destination, selected, cancelled)
        return
    if kind == 'zip' and not use_cli:
        with zipfile.ZipFile(archive) as source:
            members = {item.filename.replace('\\', '/'): item for item in source.infolist()}
            for name in selected:
                item = members.get(name)
                if item is None or item.is_dir():
                    raise IncompleteArchiveOutput(f'Archive member is unavailable for recovery: {name}')
                target = _member_path(destination, item.filename)
                _check_archive_target(archive, target)
                if stat.S_ISLNK(item.external_attr >> 16):
                    raise ValueError(f'Refusing archive link: {item.filename}')
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with source.open(item, pwd=b'steamrip.com') as incoming, open(target, 'wb', buffering=1024*1024) as output:
                    while True:
                        cancelled()
                        chunk = incoming.read(1024 * 1024)
                        if not chunk:
                            break
                        output.write(chunk)
                activity(item.filename)
        return
    if kind == 'rar' and os.name == 'nt':
        extract_rar_stream(archive, destination, should_stop=lambda: _cancelled_value(cancelled),
                           members=selected, on_file=lambda name, size: activity(name))
        return
    if kind == 'rar':
        from AscendaraDownloadRecovery import find_unrar
        tool = find_unrar()
        if tool:
            _extract_unrar(tool, archive, destination, selected, cancelled, activity)
            return
    if kind in ('7z', 'rar', 'zip'):
        tool = _find_7z()
        if not tool:
            raise RuntimeError(f'{kind.upper()} recovery requires a bundled or installed 7-Zip command-line tool')
        _run_cli([tool, 'x', '-y', '-aoa', '-psteamrip.com', '-bb1', '-sccUTF-8',
                  '-o' + destination, '--', archive, *sorted(selected)], cancelled, activity)
        return
    if kind in ('exe', 'unknown'):
        name = os.path.basename(archive).replace('\\', '/')
        if name not in selected:
            raise IncompleteArchiveOutput(f'Archive member is unavailable for recovery: {next(iter(selected))}')
        shutil.copyfile(archive, _member_path(destination, name))
        activity(name)
        return
    raise RuntimeError(f'{kind.upper()} files do not support targeted extraction recovery')


def _cancelled_value(cancelled):
    cancelled()
    return False


def extraction_worker(archive, destination, manifest_path, connection, stop, allow_inplace=True):
    """Only this process touches archive decoders. No frontend JSON writes here."""
    archive, destination, manifest_path = map(_extended_path, (archive, destination, manifest_path))
    last_sent = 0
    state = {'name': 'Preparing...', 'files': 0, 'total': 0, 'percent': 0}
    manifest = {}
    io_baseline = _process_io()
    parent = multiprocessing.parent_process()
    def parent_watch():
        while not stop.wait(.5):
            if parent is not None and not parent.is_alive():
                stop.set()
                time.sleep(5)
                os._exit(1)
    threading.Thread(target=parent_watch, daemon=True).start()
    def cancelled():
        if stop.is_set():
            raise InterruptedError('Extraction cancelled')
    send_lock = threading.Lock()
    def send(message):
        with send_lock:
            connection.send(message)
    def report(force=False):
        nonlocal last_sent
        cancelled()
        with send_lock:
            now = time.monotonic()
            if force or now - last_sent >= .5:
                io = _extraction_io(io_baseline)
                if io:
                    state['io'] = io
                connection.send(('progress', dict(state)))
                last_sent = now
    def io_watch():
        # Flushing, releasing archive space and verifying report no progress,
        # so disk rates are sampled on their own clock rather than going stale.
        while not stop.wait(.5):
            try:
                # Sampled under the lock so samples reach the parent in counter order.
                with send_lock:
                    io = _extraction_io(io_baseline)
                    if io is None:
                        return
                    connection.send(('io', io))
            except (OSError, ValueError):
                return
    threading.Thread(target=io_watch, daemon=True).start()
    def completed(name, size):
        normalized = name.replace('\\', '/')
        manifest[normalized] = {'size': size}
        state.update(name=normalized, files=len(manifest))
        state['total'] = max(state['total'], len(manifest))
        report()
    try:
        report(True)
        hatchzip = _find_hatchzip() if allow_inplace else None
        saved = _load_inplace_state(inplace_paths(archive)[1])
        rar_saved = saved is not None and saved.get('engine') == 'rar'
        layout = None
        if rar_saved and not os.path.exists(archive):
            # Volumes deleted to free space, or a finished extraction kept for retries.
            kind = source_kind = 'rarinplace'
        elif not rar_saved and inplace_consumed(archive):
            # Partly or fully consumed: the archive can no longer be read normally.
            kind, source_kind = 'inplace', None
            hatchzip = hatchzip or _find_hatchzip()
            if not hatchzip:
                raise RuntimeError('This archive was partly extracted in place and HatchZip is '
                                   'required to resume it. Reinstall Ascendara')
        else:
            source_kind, _ = detect_file_type(archive, cancelled)
            if allow_inplace and not rar_saved and _fits_beside(
                    source_kind, archive, destination, manifest_path + '.listing', cancelled, report):
                allow_inplace, hatchzip = False, None
            # A hard-linked archive shares its bytes with another retained copy,
            # which truncation would destroy.
            # HatchZip writes every entry, so archives with links take the
            # ordinary extractors, which skip them.
            kind = ('inplace' if hatchzip and source_kind in ('zip', '7z')
                    and os.stat(archive).st_nlink == 1 and not _has_links(
                        source_kind, archive, destination, manifest_path + '.listing', cancelled, report)
                    else source_kind)
            if kind == 'rar' and (allow_inplace or rar_saved):
                layout = rar_inplace_layout(archive)
                if layout is not None or rar_saved and (saved.get('freed') or saved.get('unresumable')):
                    kind = 'rarinplace'
                elif rar_saved:
                    _discard_inplace(*inplace_paths(archive))  # Nothing was released yet.
        from AscendaraDownloadRecovery import find_unrar
        unrar = find_unrar() if kind == 'rar' and os.name != 'nt' else None
        use_cli = False
        if kind == 'zip':
            with zipfile.ZipFile(archive) as source:
                # Python's ZipCrypto implementation is particularly slow on large repacks.
                use_cli = any(i.flag_bits & 1 or i.compress_type not in (0, 8, 12, 14)
                              for i in source.infolist())
        if kind == 'inplace':
            state['engine'] = 'HatchZip'
            manifest = _extract_inplace(hatchzip, source_kind, archive, destination,
                                        manifest_path + '.listing', state, report, cancelled)
        elif kind == 'rarinplace':
            state['engine'] = 'RAR in place'
            manifest = _extract_rar_inplace(archive, layout, destination, state, report, cancelled, stop)
        elif kind == 'zip' and not use_cli:
            state.update(engine='Python ZIP', bytes=0)
            with zipfile.ZipFile(archive) as source:
                members = [i for i in source.infolist() if _wanted(i.filename)]
                # Validate every path before creating any output, including links.
                for item in members:
                    target = _member_path(destination, item.filename)
                    _check_archive_target(archive, target)
                    if stat.S_ISLNK(item.external_attr >> 16):
                        _skip_link(item.filename)
                members = [i for i in members if not stat.S_ISLNK(i.external_attr >> 16)]
                files = [i for i in members if not i.is_dir()]
                total_bytes = sum(i.file_size for i in files)
                if total_bytes > shutil.disk_usage(destination).free:
                    raise OSError('Insufficient disk space for extraction')
                state['total'] = len(files)
                report(True)
                done_bytes = 0
                for item in members:
                    cancelled()
                    target = _member_path(destination, item.filename)
                    if item.is_dir():
                        os.makedirs(target, exist_ok=True)
                        continue
                    state['name'] = item.filename
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    with source.open(item, pwd=b'steamrip.com') as incoming, open(target, 'wb', buffering=1024*1024) as output:
                        while True:
                            cancelled()
                            chunk = incoming.read(1024 * 1024)
                            if not chunk:
                                break
                            output.write(chunk)
                            done_bytes += len(chunk)
                            state['bytes'] = done_bytes
                            state['percent'] = done_bytes / total_bytes * 100 if total_bytes else 0
                            report()
                    completed(item.filename, item.file_size)
        elif kind == 'rar' and os.name == 'nt':
            state.update(engine='UnRAR native', bytes=0)
            # Header-only pass: no test/decompression pass before extraction.
            api = _load_api()
            opening = api.OpenData(_extended_path(archive), mode=0)
            handle = api.open(ctypes.byref(opening))
            if not handle:
                _native_error(opening.OpenResult or 15, 'Opening archive')
            total_bytes = 0
            try:
                _native_error(opening.OpenResult, 'Opening archive')
                api.password(handle, b'steamrip.com')
                while True:
                    cancelled()
                    header = api.Header()
                    code = api.read(handle, ctypes.byref(header))
                    if code == 10:
                        break
                    _native_error(code, 'Reading archive header')
                    name = header.FileNameW or header.FileName.decode('utf-8')
                    if _wanted(name):
                        _member_path(destination, name)
                        if not header.Flags & 0x20 and not _rar_header_link(header):
                            state['total'] += 1
                            total_bytes += header.UnpSize + (header.UnpSizeHigh << 32)
                    _native_error(api.process(handle, 0, None, None), 'Listing archive')
                    report()
            finally:
                api.close(handle)
            if total_bytes > shutil.disk_usage(destination).free:
                raise OSError('Insufficient disk space for extraction')
            finished_bytes = 0
            def rar_progress(name, written, expected):
                state.update(name=name, bytes=finished_bytes + min(written, expected),
                             percent=(finished_bytes + min(written, expected)) / total_bytes * 100 if total_bytes else 0)
                report()
            def rar_file(name, size):
                nonlocal finished_bytes
                finished_bytes += size
                state['bytes'] = finished_bytes
                completed(name, size)
            extract_rar_stream(archive, destination, on_file=rar_file,
                               should_stop=stop.is_set, on_progress=rar_progress)
        elif unrar:
            state['engine'] = 'UnRAR CLI'
            manifest = _unrar_manifest(unrar, archive, destination, manifest_path + '.listing',
                                       cancelled, lambda text: report())
            if not manifest:
                raise RuntimeError('Archive contains no installable files')
            total_bytes = sum(item['size'] for item in manifest.values())
            if total_bytes > shutil.disk_usage(destination).free:
                raise OSError('Insufficient disk space for extraction')
            state.update(total=len(manifest), name='Extracting...', bytes=0)
            report(True)
            progress = UnrarProgress(destination, manifest, state)
            def unrar_activity(text):
                progress.feed(text)
                report()
            _extract_unrar(unrar, archive, destination, manifest, cancelled, unrar_activity)
        elif kind in ('7z', 'rar', 'zip'):
            state['engine'] = '7-Zip CLI'
            tool = _find_7z()
            if not tool:
                raise RuntimeError(f'{kind.upper()} extraction requires a bundled or installed 7-Zip command-line tool')
            links = []
            manifest = _7z_files(tool, archive, destination, manifest_path + '.listing',
                                 cancelled, lambda text: report(), links=links)
            total_bytes = sum(v['size'] for v in manifest.values())
            if total_bytes > shutil.disk_usage(destination).free:
                raise OSError('Insufficient disk space for extraction')
            state['total'] = len(manifest)
            def cli_activity(text):
                percentages = re.findall(r'(\d+)%', text)
                if percentages:
                    state['percent'] = int(percentages[-1])
                names = re.findall(r'^- (.+)', text, re.M)
                if names:
                    state['name'] = names[-1]
                state['files'] = min(state['total'], state['files'] + len(names))
                report()
            # Exclude listed links by full path; a UTF-8 list avoids command-line limits.
            exclusions = None
            if links:
                with NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.7z-exclude',
                                        delete=False) as excluded:
                    exclusions = excluded.name
                    for name in links:
                        excluded.write(name + '\n')
            try:
                _run_cli([tool, 'x', '-y', '-aoa', '-psteamrip.com', '-bsp1', '-bb1', '-sccUTF-8', '-scsUTF-8',
                          '-ssc-', '-xr!*.url', '-xr!*_commonredist*',
                          *(['-x@' + exclusions] if exclusions else []),
                          '-o' + destination, '--', archive], cancelled, cli_activity)
            finally:
                if exclusions:
                    try:
                        os.remove(exclusions)
                    except OSError:
                        pass
        elif kind == 'exe' or not archive.lower().endswith(('.zip', '.rar', '.7z')):
            # Anything that is not an archive is installed as the file itself.
            name = os.path.basename(archive)
            shutil.copyfile(archive, _member_path(destination, name))
            completed(name, os.path.getsize(archive))
        else:
            raise RuntimeError('Downloaded file is not a supported ZIP, RAR, 7z archive or executable')
        if not manifest:
            raise RuntimeError('Archive contains no installable files')
        errors = verify_manifest(destination, manifest, cancelled)
        if errors:
            send(('recoverable', {
                'type': 'missingExtractedFiles',
                'archive': os.path.basename(archive),
                'files': errors,
            }))
            while True:
                cancelled()
                if connection.poll(.2):
                    action = connection.recv()
                    break
            if action != 'retry':
                raise ExtractionRecoveryCancelled(
                    'Extraction recovery cancelled; the downloaded source files were retained',
                    f'Missing or incomplete extracted files: {errors[0]}')
            state.update(name='Recovering missing files...', percent=0)
            report(True)
            failed_names = [error['file'] for error in errors]
            _retry_archive_members(kind, archive, destination, failed_names, cancelled,
                                   lambda name: state.update(name=name), use_cli)
            errors = verify_manifest(destination, manifest, cancelled)
            if errors:
                raise IncompleteArchiveOutput(f'Incomplete archive output: {errors[0]}', errors,
                                              recovery_attempted=True)
        state.update(files=len(manifest), total=len(manifest), percent=100, name='Finalizing...')
        report(True)
        with open(manifest_path, 'w', encoding='utf-8') as stream:
            json.dump(manifest, stream)
        send(('done', None))
    except BaseException as exc:
        if isinstance(exc, zlib.error):
            exc = RuntimeError(f'Archive corrupt data: {exc}')
        try:
            details = ({'errors': exc.errors, 'recovery_attempted': exc.recovery_attempted}
                       if isinstance(exc, IncompleteArchiveOutput) else {})
            send(('error', (type(exc).__name__, str(exc), details)))
        except (OSError, EOFError):
            pass
    finally:
        connection.close()


def supervise_extraction(archive, destination, check_cancelled, progress, recovery, workdir, idle_timeout=300,
                         inplace=True):
    context = multiprocessing.get_context('spawn')
    receiver, sender = context.Pipe(duplex=True)
    stop = StopSignal(context)
    manifest_path = os.path.join(workdir, 'worker-manifest.json')
    process = context.Process(target=extraction_worker,
                              args=(archive, destination, manifest_path, sender, stop, inplace), daemon=True)
    process.start()
    sender.close()
    last_activity = time.monotonic()
    latest = None
    try:
        while True:
            check_cancelled()
            if receiver.poll(.2):
                try:
                    event, value = receiver.recv()
                except EOFError:
                    raise RuntimeError(f'Extraction worker exited unexpectedly (code {process.exitcode})')
                if event == 'io':
                    if latest is not None:
                        # Disk samples only count as activity while the counters still move.
                        if value != latest.get('io'):
                            last_activity = time.monotonic()
                        latest = dict(latest, io=value)
                        progress(latest)
                    continue
                last_activity = time.monotonic()
                if event == 'progress':
                    latest = value
                    progress(value)
                elif event == 'recoverable':
                    receiver.send(recovery(value))
                    last_activity = time.monotonic()
                elif event == 'error':
                    kind, message, details = value
                    exception = {'InterruptedError': InterruptedError, 'OSError': OSError,
                                 'IncompleteArchiveOutput': IncompleteArchiveOutput,
                                 'ExtractionRecoveryCancelled': ExtractionRecoveryCancelled,
                                 'ValueError': ValueError}.get(kind, RuntimeError)
                    raise exception(message, **details)
                elif event == 'done':
                    with open(manifest_path, encoding='utf-8') as stream:
                        return json.load(stream)
            elif not process.is_alive():
                raise RuntimeError(f'Extraction worker exited unexpectedly (code {process.exitcode})')
            if time.monotonic() - last_activity > idle_timeout:
                raise RuntimeError(f'Extraction stalled: no decoder activity for {idle_timeout} seconds. Source archive retained.')
    finally:
        stop.set()
        process.join(timeout=5)
        if process.is_alive():
            process.terminate()
            process.join(timeout=3)
        if process.is_alive():
            process.kill()
            process.join()
        receiver.close()
        process.close()
