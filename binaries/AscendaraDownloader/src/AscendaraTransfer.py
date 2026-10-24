"""Bounded, resumable HTTP transfer; the caller owns UI state and reporting."""
import json
import logging
import os
import re
import shutil
import threading
import time
from urllib.parse import urlparse

import requests

from AscendaraDownloadRecovery import response_size, wait_for_retry, retry_delay

PROBE_SIZE = 8 * 1024 * 1024
MAX_PIECE_SIZE = 64 * 1024 * 1024
MIN_PIECE_SIZE = 4 * 1024 * 1024
MAX_CONNECTIONS = 16


def validate_download_url(url):
    if not isinstance(url, str) or not url.strip():
        raise ValueError('No download link was provided. Refresh the game source or choose another download link.')
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        raise ValueError('The download link is invalid. Refresh the game source or choose another download link.')
    return url.strip()


def resolve_share_url(url):
    """Turn a file host's viewer page link into the link that serves the file itself."""
    parsed = urlparse(url)
    host = (parsed.hostname or '').lower()
    match = re.fullmatch(r'/u/([A-Za-z0-9]+)/?', parsed.path)
    if host in ('pixeldrain.com', 'www.pixeldrain.com') and match:
        return f'https://pixeldrain.com/api/file/{match[1]}?download'
    return url


def connection_count(settings):
    """Connections per file from the app's Single Stream / thread count settings."""
    if settings.get('singleStream', True):
        return 1
    try:
        return max(1, min(MAX_CONNECTIONS, int(settings.get('threadCount', 4))))
    except (TypeError, ValueError):
        return 1


def _validator(response):
    validator = response.headers.get('ETag', '')
    if validator.startswith('W/') or not validator:
        validator = response.headers.get('Last-Modified', '')
    return validator


def _rejected_message(status):
    detail = ' The download link may have expired or been removed; refresh the source or choose another link.' if status in (403, 404, 410) else ''
    return f'Download server rejected the request (HTTP {status}).{detail}'


class _RangeUnsupported(Exception):
    """The server stopped serving the byte ranges of the file we started."""


class _RangeRejected(Exception):
    def __init__(self, status):
        super().__init__(_rejected_message(status))


class _RangeBusy(Exception):
    def __init__(self, status, delay):
        super().__init__(f'Download server is busy (HTTP {status})')
        self.delay = delay


class _Pieces:
    """State shared by the connections of one parallel transfer."""
    def __init__(self, pieces, total, validator):
        # Each piece is [start, end, position]; end is exclusive.
        self.pieces, self.total, self.validator = pieces, total, validator
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.claimed = set()
        self.responses = set()
        self.active = 0
        self.received = 0
        self.retrying = 0
        self.error = None
        self.unsupported = None
        self.started = time.monotonic()

    def done(self):
        return sum(piece[2] - piece[0] for piece in self.pieces)


class Transfer:
    def __init__(self, url, destination, session, progress, stopped, limit=0, retry=None,
                 expected_size=None, connections=1):
        self.url, self.destination, self.session = url, destination, session
        self.progress, self.stopped, self.limit = progress, stopped, limit
        self.retry = retry or (lambda attempt: None)
        self.expected_size = expected_size
        self.connections = connections

    def run(self):
        self.url = validate_download_url(self.url)
        # Parallel transfers keep their own partial file, so a single-stream
        # resume never mistakes a file with holes for a contiguous prefix.
        if self._run_parallel():
            return
        # A validator sidecar prevents appending bytes from a changed remote file.
        sidecar = self.destination + '.resume.json'
        metadata = {}
        try:
            with open(sidecar, encoding='utf-8') as stream:
                metadata = json.load(stream)
        except (OSError, ValueError):
            pass
        if not isinstance(metadata, dict) or metadata.get('url') != self.url:
            metadata = {}
        received = 0
        started = time.monotonic()
        failures, high_water = 0, 0
        for attempt in range(48):
            if self.stopped():
                raise InterruptedError('Download cancelled')
            offset = os.path.getsize(self.destination) if os.path.exists(self.destination) else 0
            if not metadata.get('validator'):
                offset = 0
            high_water = max(high_water, offset)
            delay = None
            headers = {'Accept-Encoding': 'identity'}
            if offset:
                headers.update({'Range': f'bytes={offset}-', 'If-Range': metadata['validator']})
            try:
                with self.session.get(self.url, headers=headers, stream=True, timeout=(15, 60)) as response:
                    # Restart an already-complete or no-longer-valid partial transfer.
                    if response.status_code == 416:
                        metadata = {}
                        raise ValueError('Download server rejected the saved range; restarting the transfer')
                    if 400 <= response.status_code < 500 and response.status_code not in (408, 429):
                        raise RuntimeError(_rejected_message(response.status_code))
                    if response.status_code in (429, 503):
                        delay = retry_delay(response.headers.get('Retry-After'), min(2 ** failures, 30))
                    response.raise_for_status()
                    if response.status_code == 200:
                        offset = 0
                    if (self.expected_size == 0 and response.status_code == 200 and
                            response.headers.get('Content-Length') == '0' and
                            response.headers.get('Content-Encoding', 'identity') == 'identity'):
                        total = 0
                    else:
                        total = response_size(response, offset)
                    if self.expected_size is not None:
                        if total is not None and total != self.expected_size:
                            raise RuntimeError('Remote file size differs from the GOFile source metadata')
                        total = self.expected_size
                    if offset and metadata.get('total') is not None and total != metadata['total']:
                        metadata = {}
                        raise ValueError('Remote file size changed while resuming')
                    validator = _validator(response)
                    if offset and validator and validator != metadata['validator']:
                        metadata = {}
                        raise ValueError('Remote file changed while resuming')
                    metadata = {'url': self.url, 'validator': validator, 'total': total}
                    if total and total - offset > shutil.disk_usage(os.path.dirname(self.destination)).free:
                        raise OSError('Insufficient disk space for download')
                    written = offset
                    last = 0
                    # Smaller reads when rate-limited keep cancellation responsive.
                    chunk_size = min(1024 * 1024, max(1024, self.limit // 4)) if self.limit else 1024 * 1024
                    with open(self.destination, 'ab' if offset else 'wb') as output:
                        # Truncate old bytes before publishing a replacement validator.
                        with open(sidecar, 'w', encoding='utf-8') as stream:
                            json.dump(metadata, stream)
                        for chunk in response.iter_content(chunk_size):
                            if not chunk:
                                continue
                            output.write(chunk)
                            written += len(chunk)
                            # Intermittent stalls during a large, advancing download
                            # must not exhaust a lifetime budget of six attempts.
                            if written >= high_water + 8 * 1024 * 1024:
                                failures = 0
                                high_water = written
                            received += len(chunk)
                            now = time.monotonic()
                            if now - last >= .5:
                                if self.stopped():
                                    raise InterruptedError('Download cancelled')
                                self.progress(written, total, received / max(.001, now - started))
                                last = now
                            if self.limit:
                                delay = received / self.limit - (time.monotonic() - started)
                                if delay > 0:
                                    wait_for_retry(delay, self.stopped)
                    if total is not None and written != total:
                        raise requests.ConnectionError(f'Incomplete download: {written}/{total} bytes')
                    if not written and self.expected_size != 0:
                        raise ValueError('Download server returned an empty file')
                    self.progress(written, total or written, 0)
                    # Resume metadata is disposable after a verified transfer;
                    # another cleanup may already have removed it.
                    self._discard(sidecar, self.destination + '.partial', self.destination + '.partial.json')
                    return
            except (requests.RequestException, ValueError) as exc:
                failures += 1
                if failures >= 6 or attempt == 47:
                    raise RuntimeError(f'Download stopped after repeated connection failures; partial data was retained: {exc}') from exc
                self.retry(failures)
                wait_for_retry(delay if delay is not None else min(2 ** (failures - 1), 16), self.stopped)
        raise RuntimeError('Server repeatedly rejected the download range; refresh the source link')

    @staticmethod
    def _discard(*paths):
        for path in paths:
            try:
                os.remove(path)
            except OSError:
                pass

    def _open_range(self, start, end, total, validator):
        """Request bytes start..end-1 and return (response, total size)."""
        headers = {'Accept-Encoding': 'identity', 'Range': f'bytes={start}-{end - 1}'}
        if validator:
            headers['If-Range'] = validator
        response = self.session.get(self.url, headers=headers, stream=True, timeout=(15, 60))
        try:
            status = response.status_code
            if status in (408, 429) or status >= 500:
                raise _RangeBusy(status, retry_delay(response.headers.get('Retry-After'), 2))
            if 400 <= status < 500 and status != 416:
                raise _RangeRejected(status)
            if status != 206:
                raise _RangeUnsupported(f'Download server did not honor the requested byte range (HTTP {status})')
            try:
                found = response_size(response, start)
            except ValueError as exc:
                raise _RangeUnsupported(str(exc)) from exc
            if total is not None and found != total:
                raise _RangeUnsupported('Remote file size changed during the download')
            if validator and _validator(response) != validator:
                raise _RangeUnsupported('Remote file changed during the download')
            return response, found
        except BaseException:
            response.close()
            raise

    def _load_pieces(self, partial, state_path):
        """Return saved pieces for this URL, or None when they cannot be trusted."""
        try:
            with open(state_path, encoding='utf-8') as stream:
                state = json.load(stream)
            pieces, total, validator = state['pieces'], state['total'], state['validator']
            size = os.path.getsize(partial)
            position = 0
            for start, end, done in pieces:
                # Bytes are only counted after they reach the file, so a piece
                # can never claim more than the partial file holds.
                if start != position or not start <= done <= end or (done > start and done > size):
                    return None
                position = end
            if state['url'] != self.url or not validator or not isinstance(total, int) or position != total:
                return None
            if self.expected_size is not None and total != self.expected_size:
                return None
            return _Pieces([list(piece) for piece in pieces], total, validator)
        except (OSError, ValueError, KeyError, TypeError):
            return None

    @staticmethod
    def _save_pieces(shared, url, state_path):
        temporary = state_path + '.tmp'
        with open(temporary, 'w', encoding='utf-8') as stream:
            json.dump({'url': url, 'validator': shared.validator, 'total': shared.total,
                       'pieces': shared.pieces}, stream)
        for attempt in range(5):
            try:
                os.replace(temporary, state_path)
                return
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(.1)

    def _run_parallel(self):
        """Download over several range requests; False means use the single stream."""
        partial, state_path = self.destination + '.partial', self.destination + '.partial.json'
        if self.expected_size == 0 or (self.connections < 2 and not os.path.exists(state_path)):
            return False
        if os.path.exists(self.destination) and os.path.exists(self.destination + '.resume.json'):
            return False  # Finish the single-stream transfer that is already underway.
        first = None
        shared = self._load_pieces(partial, state_path)
        if shared is None:
            self._discard(partial, state_path)
            # The first request doubles as the test for byte-range support.
            try:
                response, total = self._open_range(0, PROBE_SIZE, self.expected_size, None)
            except (requests.RequestException, _RangeUnsupported, _RangeRejected, _RangeBusy) as exc:
                logging.info('Using a single connection: %s', exc)
                return False
            size = max(MIN_PIECE_SIZE, min(MAX_PIECE_SIZE, -(-total // (self.connections * 2))))
            pieces = [[0, min(PROBE_SIZE, total), 0]]
            while pieces[-1][1] < total:
                pieces.append([pieces[-1][1], min(total, pieces[-1][1] + size), pieces[-1][1]])
            shared = _Pieces(pieces, total, _validator(response))
            shared.claimed.add(0)
            first = (0, response)
        try:
            folder = os.path.dirname(os.path.abspath(self.destination))
            if shared.total - shared.done() > shutil.disk_usage(folder).free:
                raise OSError('Insufficient disk space for download')
            with open(partial, 'ab'):
                pass
            self._save_pieces(shared, self.url, state_path)
        except BaseException:
            if first:
                first[1].close()
            raise
        remaining = sum(1 for piece in shared.pieces if piece[2] < piece[1])
        count = max(1, min(self.connections, MAX_CONNECTIONS, remaining))
        shared.active = count
        logging.info('Downloading %s over %d connections (%d bytes, %d pieces)',
                     os.path.basename(self.destination), count, shared.total, len(shared.pieces))
        threads = [threading.Thread(target=self._connection, daemon=True,
                                    args=(shared, partial) + (first if index == 0 and first else ()))
                   for index in range(count)]
        for thread in threads:
            thread.start()
        last_progress = last_save = time.monotonic()
        retrying = 0
        try:
            while any(thread.is_alive() for thread in threads):
                time.sleep(.1)
                now = time.monotonic()
                if now - last_progress >= .5:
                    if self.stopped():
                        raise InterruptedError('Download cancelled')
                    if shared.retrying != retrying:
                        retrying = shared.retrying
                        if retrying:
                            self.retry(retrying)
                    self.progress(shared.done(), shared.total,
                                  shared.received / max(.001, now - shared.started))
                    last_progress = now
                if now - last_save >= 2:
                    self._save_pieces(shared, self.url, state_path)
                    last_save = now
        finally:
            shared.stop.set()
            # Unblock connections waiting on a stalled socket.
            with shared.lock:
                for response in list(shared.responses):
                    try:
                        response.close()
                    except Exception:
                        pass
            for thread in threads:
                thread.join(5)
            if shared.unsupported is None:
                try:
                    self._save_pieces(shared, self.url, state_path)
                except OSError:
                    logging.warning('Could not save parallel download progress', exc_info=True)
        if shared.unsupported is not None:
            logging.warning('Restarting with a single connection: %s', shared.unsupported)
            self._discard(partial, state_path)
            return False
        if shared.error is not None:
            raise shared.error
        if shared.done() != shared.total or os.path.getsize(partial) != shared.total:
            raise RuntimeError('Download stopped after repeated connection failures; partial data was retained: '
                               f'Incomplete download: {shared.done()}/{shared.total} bytes')
        for attempt in range(8):
            try:
                os.replace(partial, self.destination)
                break
            except PermissionError:
                # A scanner may briefly hold the finished file open.
                if attempt == 7:
                    raise
                wait_for_retry(min(.1 * 2 ** attempt, 1), self.stopped)
        self._discard(state_path, self.destination + '.resume.json')
        self.progress(shared.total, shared.total, 0)
        return True

    def _connection(self, shared, partial, index=None, response=None):
        """One connection: claim unfinished pieces in file order until none remain."""
        chunk_size = min(256 * 1024, max(1024, self.limit // 4)) if self.limit else 256 * 1024
        failures = 0
        left = False
        try:
            with open(partial, 'r+b', buffering=0) as output:
                while not shared.stop.is_set():
                    if index is None:
                        with shared.lock:
                            index = next((i for i, piece in enumerate(shared.pieces)
                                          if i not in shared.claimed and piece[2] < piece[1]), None)
                            if index is None:
                                # Leaving and "nothing to claim" must be one step, or a
                                # retiring connection could strand the piece it releases.
                                shared.active -= 1
                                left = True
                                return
                            shared.claimed.add(index)
                    piece = shared.pieces[index]
                    while piece[2] < piece[1] and not shared.stop.is_set():
                        before = piece[2]
                        delay = rejected = problem = None
                        try:
                            if response is None:
                                response, _ = self._open_range(piece[2], piece[1], shared.total, shared.validator)
                            with shared.lock:
                                shared.responses.add(response)
                            try:
                                for chunk in response.iter_content(chunk_size):
                                    if shared.stop.is_set():
                                        return
                                    chunk = memoryview(chunk)[:piece[1] - piece[2]]
                                    output.seek(piece[2])
                                    while len(chunk):
                                        written = output.write(chunk)
                                        chunk = chunk[written:]
                                        piece[2] += written
                                        with shared.lock:
                                            shared.received += written
                                    if piece[2] >= piece[1]:
                                        break
                                    if self.limit:
                                        ahead = shared.received / self.limit - (time.monotonic() - shared.started)
                                        if ahead > 0 and shared.stop.wait(ahead):
                                            return
                            finally:
                                with shared.lock:
                                    shared.responses.discard(response)
                                response.close()
                                response = None
                        except _RangeUnsupported as exc:
                            shared.unsupported = str(exc)
                            shared.stop.set()
                            return
                        except _RangeRejected as exc:
                            rejected = problem = exc
                        except _RangeBusy as exc:
                            problem, delay = exc, exc.delay
                        except requests.RequestException as exc:
                            problem = exc
                        if piece[2] >= piece[1] or shared.stop.is_set():
                            break
                        if piece[2] - before >= 1024 * 1024:
                            failures = 0  # The connection dropped, but it is making progress.
                            continue
                        failures += 1
                        with shared.lock:
                            # Hosts that cap connections refuse the extra ones; give
                            # the piece back and let the remaining connections finish.
                            if shared.active > 1 and (rejected or failures >= 3):
                                shared.claimed.discard(index)
                                shared.active -= 1
                                left = True
                                logging.info('Dropping a download connection (%d left): %s',
                                             shared.active, problem)
                                return
                        if rejected:
                            raise RuntimeError(str(rejected))
                        if failures >= 6:
                            raise RuntimeError('Download stopped after repeated connection failures; '
                                               f'partial data was retained: {problem or "connection closed early"}')
                        if shared.active == 1:
                            shared.retrying = failures
                        if shared.stop.wait(delay if delay is not None else min(2 ** (failures - 1), 16)):
                            return
                    failures = 0
                    index = None
        except BaseException as exc:
            with shared.lock:
                if not shared.stop.is_set() and shared.error is None:
                    shared.error = exc
            shared.stop.set()
        finally:
            if response is not None:
                response.close()
            if not left:
                with shared.lock:
                    shared.active -= 1
