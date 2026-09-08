import ctypes
import ntpath
import os
import re
import stat
import sys
import time
from types import SimpleNamespace


def _extended_path(path):
    path = os.path.abspath(os.fsdecode(path))
    if os.name != 'nt' or path.startswith('\\\\?\\'):
        return path
    if path.startswith('\\\\'):
        return '\\\\?\\UNC\\' + path[2:]
    return '\\\\?\\' + path


def _load_api():
    if 'UNRAR_LIB_PATH' not in os.environ:
        roots = [getattr(sys, '_MEIPASS', None), os.path.dirname(__file__),
                 os.path.dirname(sys.executable)]
        for root in filter(None, roots):
            candidate = os.path.join(root, 'UnRAR.dll')
            if os.path.isfile(candidate):
                os.environ['UNRAR_LIB_PATH'] = candidate
                break
    try:
        from unrar import unrarlib
    except (ImportError, LookupError, OSError) as exc:
        raise RuntimeError('The bundled extraction component is unavailable. '
                           'Update Ascendara or report this issue.') from exc
    factory = ctypes.WINFUNCTYPE if os.name == 'nt' else ctypes.CFUNCTYPE
    callback_type = factory(ctypes.c_int, ctypes.c_uint, ctypes.c_ssize_t,
                            ctypes.c_ssize_t, ctypes.c_ssize_t)

    class Header(ctypes.Structure):
        _fields_ = unrarlib.RARHeaderDataEx._fields_[:-1] + [
            ('DictSize', ctypes.c_uint), ('HashType', ctypes.c_uint),
            ('Hash', ctypes.c_ubyte * 32), ('RedirType', ctypes.c_uint),
            ('RedirName', ctypes.c_wchar_p), ('RedirNameSize', ctypes.c_uint),
            ('DirTarget', ctypes.c_uint), ('Reserved', ctypes.c_uint * 1024)]

    def bind(name, result, *args):
        return factory(result, *args)((name, unrarlib.unrarlib))

    return SimpleNamespace(
        OpenData=unrarlib.RAROpenArchiveDataEx, Header=Header,
        Callback=callback_type,
        open=bind('RAROpenArchiveEx', ctypes.c_void_p,
                  ctypes.POINTER(unrarlib.RAROpenArchiveDataEx)),
        read=bind('RARReadHeaderEx', ctypes.c_int, ctypes.c_void_p,
                  ctypes.POINTER(Header)),
        process=bind('RARProcessFileW', ctypes.c_int, ctypes.c_void_p,
                     ctypes.c_int, ctypes.c_wchar_p, ctypes.c_wchar_p),
        callback=bind('RARSetCallback', None, ctypes.c_void_p,
                      callback_type, ctypes.c_ssize_t),
        password=bind('RARSetPassword', None, ctypes.c_void_p, ctypes.c_char_p),
        close=bind('RARCloseArchive', ctypes.c_int, ctypes.c_void_p))


def _check_path(root, target):
    if os.path.commonpath([root, target]) != root:
        raise ValueError(f'Archive path escapes destination: {target!r}')
    current = target
    while True:
        if os.path.lexists(current):
            info = os.lstat(current)
            if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
                raise ValueError(f'Refusing symlink or reparse-point path: {current!r}')
            if current == target and not stat.S_ISDIR(info.st_mode) and info.st_nlink > 1:
                raise ValueError(f'Refusing hard-linked output: {current!r}')
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    real_root = os.path.realpath(root)
    if os.path.commonpath([real_root, os.path.realpath(target)]) != real_root:
        raise ValueError(f'Archive path resolves outside destination: {target!r}')


def _member_path(root, name):
    normalized = name.replace('\\', '/')
    if not normalized or normalized.startswith('/') or ntpath.splitdrive(normalized)[0]:
        raise ValueError(f'Unsafe archive member name: {name!r}')
    parts = normalized.rstrip('/').split('/')
    for part in parts:
        base = part.split('.')[0].upper()
        if (part in ('', '.', '..') or part.endswith((' ', '.'))
                or any(ord(c) < 32 or c in ':<>"|?*' for c in part)
                or base in {'CON', 'PRN', 'AUX', 'NUL', 'CONIN$', 'CONOUT$'}
                or base in {f'{prefix}{digit}' for prefix in ('COM', 'LPT')
                            for digit in '123456789¹²³'}):
            raise ValueError(f'Unsafe archive member name: {name!r}')
    target = os.path.join(root, *parts)
    _check_path(root, target)
    return target


def _native_error(code, action):
    if code:
        reason = {12: 'corrupt data or CRC mismatch', 15: 'archive or volume unavailable',
                  22: 'password required', 24: 'incorrect password'}.get(code, 'UnRAR failure')
        raise RuntimeError(f'{action}: {reason} (UnRAR error {code}). '
                           'Check the password and all archive volumes; re-download if damaged.')


def _file_error(action, path, exc):
    return OSError(f'Cannot {action} extracted file {path!r}: {exc}. '
                   'Check destination permissions, free disk space, path length support, '
                   'and whether another program has locked the file.')


def _check_archive_target(archive, target):
    source = os.path.normcase(os.path.realpath(archive))
    destination = os.path.normcase(os.path.realpath(target))
    same = source == destination
    if not same and os.path.exists(archive) and os.path.exists(target):
        same = os.path.samefile(archive, target)
    if not same and os.path.dirname(source) == os.path.dirname(destination):
        name = os.path.basename(source)
        multipart = re.fullmatch(r'(.+)\.part\d+\.rar', name, re.IGNORECASE)
        legacy = re.fullmatch(r'(.+)\.(?:rar|[r-z]\d{2})', name, re.IGNORECASE)
        if multipart:
            family = re.escape(multipart[1]) + r'\.part\d+\.rar'
        elif legacy:
            family = re.escape(legacy[1]) + r'\.(?:rar|[r-z]\d{2})'
        else:
            family = re.escape(name)
        same = re.fullmatch(family, os.path.basename(destination), re.IGNORECASE) is not None
    if same:
        raise ValueError(f'Refusing to overwrite input archive or sibling volume: {target!r}')


def extract_rar_recovery(archive_path, dest_dir, password='steamrip.com',
                         on_file=None, should_stop=None):
    """Stream one archive pass through UnRAR testing; return extracted file count.

    Existing regular files are overwritten. Failed files can remain partial.
    The destination must not be concurrently modified by another process.
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
    output = None
    target = None
    callback_error = None
    next_stop_check = 0.0
    written = 0

    def check_stop(force=False):
        nonlocal next_stop_check
        if should_stop is not None:
            now = time.monotonic()
            if force or now >= next_stop_check:
                next_stop_check = now + 0.5
                if should_stop():
                    raise InterruptedError('RAR extraction cancelled')

    def on_event(message, user_data, data, size):
        nonlocal callback_error, written
        if callback_error is not None:
            return -1
        try:
            if message == 1:
                check_stop()
                if size < 0 or (size and not data):
                    raise ValueError('Invalid UnRAR decompression buffer')
                if output is not None and size:
                    chunk = ctypes.string_at(data, size)
                    try:
                        if output.write(chunk) != size:
                            raise OSError('Short file write')
                        written += size
                    except OSError as exc:
                        raise _file_error('write', target, exc) from exc
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
            target = _member_path(root, name)
            if (getattr(header, 'RedirType', 0)
                    or header.HostOS == 3 and stat.S_ISLNK(header.FileAttr)
                    or header.HostOS != 3 and header.FileAttr & 0x400):
                raise ValueError(f'Refusing archive link: {name!r}')
            skip = name.endswith('.url') or '_CommonRedist' in name
            directory = bool(header.Flags & 0x20) or name.endswith(('/', '\\'))
            try:
                if not skip:
                    _check_archive_target(archive_path, target)
                    try:
                        os.makedirs(target if directory else os.path.dirname(target), exist_ok=True)
                        _check_path(root, target)
                        if not directory:
                            output = open(target, 'wb')
                    except OSError as exc:
                        raise _file_error('create', target, exc) from exc
                code = api.process(handle, 1, None, None)
                if callback_error is not None:
                    raise callback_error
                _native_error(code, f'Testing {name!r}')
            finally:
                if output is not None:
                    stream, output = output, None
                    already_failing = sys.exc_info()[0] is not None
                    try:
                        stream.close()
                    except OSError as exc:
                        if not already_failing:
                            raise _file_error('flush or close', target, exc) from exc
            if not skip and not directory:
                expected_size = getattr(header, 'UnpSize', written) + (getattr(header, 'UnpSizeHigh', 0) << 32)
                if written != expected_size:
                    raise RuntimeError(f'Incomplete RAR output for {name!r}: expected {expected_size} bytes, wrote {written}')
                count += 1
                if on_file is not None:
                    on_file(name, written)
        return count
    finally:
        code = api.close(handle)
        if sys.exc_info()[0] is None:
            _native_error(code, 'Closing archive')
