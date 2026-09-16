"""Bounded, resumable HTTP transfer; the caller owns UI state and reporting."""
import json
import os
import shutil
import time
from urllib.parse import urlparse

import requests

from AscendaraDownloadRecovery import response_size, wait_for_retry, retry_delay


def validate_download_url(url):
    if not isinstance(url, str) or not url.strip():
        raise ValueError('No download link was provided. Refresh the game source or choose another download link.')
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        raise ValueError('The download link is invalid. Refresh the game source or choose another download link.')
    return url.strip()


class Transfer:
    def __init__(self, url, destination, session, progress, stopped, limit=0, retry=None,
                 expected_size=None):
        self.url, self.destination, self.session = url, destination, session
        self.progress, self.stopped, self.limit = progress, stopped, limit
        self.retry = retry or (lambda attempt: None)
        self.expected_size = expected_size

    def run(self):
        self.url = validate_download_url(self.url)
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
                        detail = ' The download link may have expired or been removed; refresh the source or choose another link.' if response.status_code in (403, 404, 410) else ''
                        raise RuntimeError(f'Download server rejected the request (HTTP {response.status_code}).{detail}')
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
                    validator = response.headers.get('ETag', '')
                    if validator.startswith('W/') or not validator:
                        validator = response.headers.get('Last-Modified', '')
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
                    try:
                        os.remove(sidecar)
                    except FileNotFoundError:
                        # Resume metadata is disposable after a verified transfer.
                        # Another cleanup may already have removed it.
                        pass
                    return
            except (requests.RequestException, ValueError) as exc:
                failures += 1
                if failures >= 6 or attempt == 47:
                    raise RuntimeError(f'Download stopped after repeated connection failures; partial data was retained: {exc}') from exc
                self.retry(failures)
                wait_for_retry(delay if delay is not None else min(2 ** (failures - 1), 16), self.stopped)
        raise RuntimeError('Server repeatedly rejected the download range; refresh the source link')
