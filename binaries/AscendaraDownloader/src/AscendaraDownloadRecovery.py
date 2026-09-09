import hashlib
import os
import re
import shutil
import sys
import tempfile
import time


def response_size(response, start=0):
    encoding = response.headers.get('Content-Encoding', 'identity').lower()
    if encoding not in ('', 'identity'):
        raise ValueError('Download server returned encoded archive bytes')
    if response.status_code == 206:
        match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
        if not match:
            raise ValueError('Missing or invalid Content-Range')
        first, last, total = map(int, match.groups())
        if first != start or last < first or last >= total:
            raise ValueError('Download server returned the wrong byte range')
        length = response.headers.get('Content-Length')
        if length is not None and int(length) != last - first + 1:
            raise ValueError('Content-Length does not match Content-Range')
        return total
    if response.status_code != 200 or start:
        raise ValueError('Download server did not honor the requested byte range')
    length = response.headers.get('Content-Length')
    if length is None:
        return None
    total = int(length)
    if total <= 0:
        raise ValueError('Download server returned an empty archive')
    return total


def wait_for_retry(delay, should_stop):
    deadline = time.monotonic() + delay
    while True:
        if should_stop():
            raise InterruptedError('Download cancelled')
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(0.25, remaining))


def is_archive_integrity_error(error):
    if isinstance(error, (OSError, ValueError, InterruptedError)):
        return False
    message = str(error).lower()
    if any(term in message for term in ('incorrect password', 'bad password', 'password required',
                                       'password missing', 'permission denied', 'disk space',
                                       'tool available', 'binary not found', 'file create error', 'write error')):
        return False
    return any(term in message for term in (
        'crc', 'bad header data', 'bad archive data', 'corrupt data',
        'unexpected end', 'truncated', 'volume open error', 'volume unavailable',
        'unrar error 12', 'unrar error 13', 'unrar error 15',
        'incomplete rar output', 'file is not a zip file', 'bad magic number',
        'unrar exited with code 3', 'unrar failed (exit 3)',
    ))


def archive_sources(archive, sources):
    archive = os.path.abspath(archive)
    name = os.path.basename(archive)
    multipart = re.fullmatch(r'(.+)\.part\d+\.rar', name, re.IGNORECASE)
    legacy = re.fullmatch(r'(.+)\.(?:rar|[r-z]\d{2})', name, re.IGNORECASE)
    pattern = (re.escape(multipart[1]) + r'\.part\d+\.rar' if multipart else
               re.escape(legacy[1]) + r'\.(?:rar|[r-z]\d{2})' if legacy else re.escape(name))
    return {path: source for path, source in sources.items()
            if os.path.normcase(os.path.dirname(os.path.abspath(path))) == os.path.normcase(os.path.dirname(archive))
            and re.fullmatch(pattern, os.path.basename(path), re.IGNORECASE)}


def _digest(path, should_stop):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        while True:
            if should_stop():
                raise InterruptedError('Download cancelled')
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.digest()


def repair_archive(archive, sources, download, should_stop):
    selected = archive_sources(archive, sources)
    if not selected:
        raise RuntimeError('The damaged or incomplete archive has no known download source. '
                           'Choose another source with all archive volumes.')
    changed = False
    for path, source in selected.items():
        if should_stop():
            raise InterruptedError('Download cancelled')
        folder = os.path.dirname(os.path.abspath(path))
        existing = os.path.isfile(path)
        if existing and shutil.disk_usage(folder).free < os.path.getsize(path):
            raise OSError('Not enough free disk space for an archive repair download. '
                          'The original archive has been kept.')
        with tempfile.TemporaryDirectory(prefix='.ascendara-repair-', dir=folder) as temporary:
            replacement = os.path.join(temporary, os.path.basename(path))
            download(source, replacement)
            if should_stop():
                raise InterruptedError('Download cancelled')
            if not os.path.isfile(replacement) or os.path.getsize(replacement) == 0:
                raise RuntimeError('Archive repair download did not produce a complete file')
            if existing and _digest(path, should_stop) == _digest(replacement, should_stop):
                continue
            os.replace(replacement, path)
            changed = True
    if not changed:
        raise RuntimeError('The source returned identical archive bytes after a fresh download. '
                           'The archive may be damaged at the source or missing a volume. '
                           'Choose another source; retrying this download again will not repair it.')


def recover_archive(error, archive, attempt, sources, download, should_stop, on_retry):
    if not is_archive_integrity_error(error):
        raise error
    if attempt >= 1:
        raise RuntimeError(f'Archive integrity check still failed after an automatic repair download: {error}. '
                           'Choose another source with all archive volumes.') from error
    if not archive_sources(archive, sources):
        raise RuntimeError(f'{error}. No download source is available to repair this archive; '
                           'choose another source with all archive volumes.') from error
    wait_for_retry(2, should_stop)
    on_retry()
    repair_archive(archive, sources, download, should_stop)


def find_unrar():
    roots = [getattr(sys, '_MEIPASS', None), os.path.dirname(sys.executable), os.path.dirname(__file__)]
    for root in filter(None, roots):
        path = os.path.join(root, 'unrar')
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return shutil.which('unrar') or shutil.which('unrar-free')
