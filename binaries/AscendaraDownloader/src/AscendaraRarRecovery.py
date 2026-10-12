import ctypes
import ntpath
import os
import re
import stat
import sys
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
    # Native extraction and Python inspection must resolve the same long paths.
    root, target = _extended_path(root), _extended_path(target)
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
        # Ancestors of the chosen destination may be user-managed symlinks
        # (for example /mnt). Reject links at and below the output root only.
        if current == root:
            break
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
    archive, target = _extended_path(archive), _extended_path(target)
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
