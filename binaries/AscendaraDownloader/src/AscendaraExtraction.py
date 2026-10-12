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
    _file_error, _check_archive_target,
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


def _external_tool_env():
    """Environment for spawning system binaries, undoing PyInstaller's LD_LIBRARY_PATH hijack.

    On Linux, PyInstaller's onefile bootloader points LD_LIBRARY_PATH at its bundled
    libs (readline/tinctures/libssl, etc.) so the frozen interpreter can find them.
    That variable leaks into every child process. Tools like p7zip's `7z` wrapper
    exec `/bin/sh`, which then tries to resolve readline symbols against our bundled
    (incompatible) library and dies with "undefined symbol: rl_print_keybinding".
    Restore the original value PyInstaller saves in LD_LIBRARY_PATH_ORIG, or strip it.
    """
    if os.name == 'nt' or 'LD_LIBRARY_PATH' not in os.environ:
        return None
    env = os.environ.copy()
    original = env.pop('LD_LIBRARY_PATH_ORIG', None)
    if original:
        env['LD_LIBRARY_PATH'] = original
    else:
        env.pop('LD_LIBRARY_PATH', None)
    return env


# Disk I/O of external extractor processes: [read, written] bytes of the tools
# that already exited, plus the one still running.
_tool_io = [0, 0]
_tool_process = None


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
        with open(f'/proc/{process.pid if process is not None else os.getpid()}/io') as stream:
            values = dict(line.split(': ', 1) for line in stream.read().splitlines())
        return int(values['rchar']), int(values['wchar'])
    except Exception:
        return None  # No per-process counters (for example macOS); progress still works.


def _extraction_io(baseline):
    """Bytes this worker and its extractor tools have read and written since `baseline`."""
    own = _process_io()
    if own is None or baseline is None:
        return None
    tool = _process_io(_tool_process) if _tool_process is not None else None
    tool = tool or (0, 0)
    return [max(0, own[0] - baseline[0]) + _tool_io[0] + tool[0],
            max(0, own[1] - baseline[1]) + _tool_io[1] + tool[1]]


def _run_cli(command, cancelled, activity):
    """Drain combined output continuously and always reap the native child."""
    global _tool_process
    from collections import deque
    tail = deque(maxlen=64)
    diagnostics = []
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, env=_external_tool_env(),
                               creationflags=0x08000000 if os.name == 'nt' else 0)
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
            activity(text)
    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    try:
        while process.poll() is None:
            cancelled()
            time.sleep(.1)
        reader.join()
        if process.returncode != 0:
            raise RuntimeError(f'Extractor exited with code {process.returncode}: ' +
                               '\n'.join(diagnostics) + '\n' +
                               b''.join(tail).decode('utf-8', errors='replace').replace('\b', '')[-4000:])
        return b''.join(tail).decode('utf-8', errors='replace')
    finally:
        # Keep what the tool transferred before its handle goes away.
        final = _process_io(process)
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
        if name is None:
            continue
        _check_archive_target(archive, _member_path(destination, name))
        # Links and file references must not bypass staging path validation.
        if values.get('Type') not in ('File', 'Directory'):
            raise ValueError(f'Refusing archive link or unsupported entry: {name}')
        if values['Type'] == 'File' and _wanted(name):
            manifest[name.replace('\\', '/')] = {'size': int(values['Size'])}
    return manifest


class UnrarProgress:
    """Read UnRAR's in-place console updates across arbitrary pipe chunks."""
    def __init__(self, destination, manifest, state):
        self.destination = os.path.join(destination, '').replace('\\', '/')
        self.manifest = manifest
        self.state = state
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


def _extract_unrar(tool, archive, destination, names, cancelled, activity):
    # Archived read-only attributes can prevent unpacking continuation archives
    # and moving/deleting staging files on Linux.
    # A UTF-8 list avoids command-line size limits for large manifests.
    with NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.unrar-list') as selection:
        for name in sorted(names):
            selection.write(name + '\n')
        selection.flush()
        filters = ['-scfl', '-n@' + selection.name] if names else []
        _run_cli([tool, 'x', '-cfg-', '-y', '-o+', '-ai', '-psteamrip.com', '-@',
                  *filters, '--', archive, os.path.join(destination, '')], cancelled, activity)


def extract_rar_stream(archive_path, dest_dir, password='steamrip.com',
                         on_file=None, should_stop=None, on_progress=None, members=None):
    """Extract in one native UnRAR pass, with Python used only for supervision.

    Existing regular files are overwritten. Failed files can remain partial.
    The destination must not be concurrently modified by another process.
    Native UnRAR writes output and checks CRC; Python verifies the expected size.
    on_file(name, size) runs after each file passes CRC and closes successfully.
    should_stop() is checked per header and at most every 0.5 seconds in chunks;
    a true result raises InterruptedError after the native call returns.
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
            target = _member_path(root, name)
            if (getattr(header, 'RedirType', 0)
                    or header.HostOS == 3 and stat.S_ISLNK(header.FileAttr)
                    or header.HostOS != 3 and header.FileAttr & 0x400):
                raise ValueError(f'Refusing archive link: {name!r}')
            normalized = name.replace('\\', '/')
            skip = not _wanted(name) or members is not None and normalized not in members
            directory = bool(header.Flags & 0x20) or name.endswith(('/', '\\'))
            extracting_file = not skip and not directory
            if not skip:
                _check_archive_target(archive_path, target)
                try:
                    os.makedirs(target if directory else os.path.dirname(target), exist_ok=True)
                    _check_path(root, target)
                except OSError as exc:
                    raise _file_error('create', target, exc) from exc
            # RAR_EXTRACT=2 writes inside UnRAR. RAR_SKIP=0 also avoids testing
            # unwanted files; UnRAR handles dictionary continuity for solid sets.
            code = api.process(handle, 0 if skip else 2, None if skip else root + os.sep, None)
            if callback_error is not None:
                raise callback_error
            check_stop(force=True)
            if code in (16, 17, 19):
                raise OSError(f'Native RAR extraction could not write {name!r} (UnRAR error {code})')
            _native_error(code, f'Extracting {name!r}')
            if not skip and not directory:
                actual_size = os.path.getsize(target)
                if actual_size != expected_size:
                    raise RuntimeError(f'Incomplete RAR output for {name!r}: expected {expected_size} bytes, wrote {actual_size}')
                count += 1
                if on_file is not None:
                    on_file(name, expected_size)
        return count
    finally:
        code = api.close(handle)
        if sys.exc_info()[0] is None:
            _native_error(code, 'Closing archive')


def _retry_archive_members(kind, archive, destination, names, cancelled, activity, use_cli=False):
    selected = {name.replace('\\', '/') for name in names}
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
    if kind == 'exe':
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


def extraction_worker(archive, destination, manifest_path, connection, stop):
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
    def report(force=False):
        nonlocal last_sent
        cancelled()
        now = time.monotonic()
        if force or now - last_sent >= .5:
            io = _extraction_io(io_baseline)
            if io:
                state['io'] = io
            connection.send(('progress', dict(state)))
            last_sent = now
    def completed(name, size):
        normalized = name.replace('\\', '/')
        manifest[normalized] = {'size': size}
        state.update(name=normalized, files=len(manifest))
        state['total'] = max(state['total'], len(manifest))
        report()
    try:
        report(True)
        kind, _ = detect_file_type(archive, cancelled)
        from AscendaraDownloadRecovery import find_unrar
        unrar = find_unrar() if kind == 'rar' and os.name != 'nt' else None
        use_cli = False
        if kind == 'zip':
            with zipfile.ZipFile(archive) as source:
                # Python's ZipCrypto implementation is particularly slow on large repacks.
                use_cli = any(i.flag_bits & 1 or i.compress_type not in (0, 8, 12, 14)
                              for i in source.infolist())
        if kind == 'zip' and not use_cli:
            state.update(engine='Python ZIP', bytes=0)
            with zipfile.ZipFile(archive) as source:
                members = [i for i in source.infolist() if _wanted(i.filename)]
                # Validate every path before creating any output, including links.
                for item in members:
                    target = _member_path(destination, item.filename)
                    _check_archive_target(archive, target)
                    if stat.S_ISLNK(item.external_attr >> 16):
                        raise ValueError(f'Refusing archive link: {item.filename}')
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
                    _member_path(destination, name)
                    if _wanted(name) and not header.Flags & 0x20:
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
            # Stream the full listing to disk; large manifests must not be kept in a pipe tail.
            listing_path = manifest_path + '.listing'
            with open(listing_path, 'w', encoding='utf-8', newline='') as listing:
                def listing_activity(text):
                    listing.write(text)
                    report()
                _run_cli([tool, 'l', '-slt', '-ba', '-sccUTF-8', '-psteamrip.com', '--', archive], cancelled, listing_activity)
            with open(listing_path, encoding='utf-8') as listing:
                records = listing.read().split('\n\n')
            for record in records:
                values = dict(line.split(' = ', 1) for line in record.splitlines() if ' = ' in line)
                name = values.get('Path')
                if not name:
                    continue
                _check_archive_target(archive, _member_path(destination, name))
                if values.get('Symbolic Link') or values.get('Hard Link') or 'l' in values.get('Attributes', '').split(' ')[-1][:1]:
                    raise ValueError(f'Refusing archive link: {name}')
                if values.get('Folder') != '+' and not values.get('Attributes', '').startswith('D') and _wanted(name):
                    manifest[name.replace('\\', '/')] = {'size': int(values['Size'])}
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
            _run_cli([tool, 'x', '-y', '-aoa', '-psteamrip.com', '-bsp1', '-bb1', '-sccUTF-8',
                      '-xr!*.url', '-xr!_CommonRedist', '-o' + destination, '--', archive], cancelled, cli_activity)
        elif kind == 'exe':
            name = os.path.basename(archive)
            shutil.copyfile(archive, _member_path(destination, name))
            completed(name, os.path.getsize(archive))
        else:
            raise RuntimeError('Downloaded file is not a supported ZIP, RAR, 7z archive or executable')
        if not manifest:
            raise RuntimeError('Archive contains no installable files')
        errors = verify_manifest(destination, manifest, cancelled)
        if errors:
            connection.send(('recoverable', {
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
        connection.send(('done', None))
    except BaseException as exc:
        if isinstance(exc, zlib.error):
            exc = RuntimeError(f'Archive corrupt data: {exc}')
        try:
            details = ({'errors': exc.errors, 'recovery_attempted': exc.recovery_attempted}
                       if isinstance(exc, IncompleteArchiveOutput) else {})
            connection.send(('error', (type(exc).__name__, str(exc), details)))
        except (OSError, EOFError):
            pass
    finally:
        connection.close()


def supervise_extraction(archive, destination, check_cancelled, progress, recovery, workdir, idle_timeout=300):
    context = multiprocessing.get_context('spawn')
    receiver, sender = context.Pipe(duplex=True)
    stop = StopSignal(context)
    manifest_path = os.path.join(workdir, 'worker-manifest.json')
    process = context.Process(target=extraction_worker,
                              args=(archive, destination, manifest_path, sender, stop), daemon=True)
    process.start()
    sender.close()
    last_activity = time.monotonic()
    try:
        while True:
            check_cancelled()
            if receiver.poll(.2):
                try:
                    event, value = receiver.recv()
                except EOFError:
                    raise RuntimeError(f'Extraction worker exited unexpectedly (code {process.exitcode})')
                last_activity = time.monotonic()
                if event == 'progress':
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
