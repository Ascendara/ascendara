"""Bounded, resumable HTTP transfer; the caller owns UI state and reporting."""
import json
import os
import shutil
import time

import requests

from AscendaraDownloadRecovery import response_size, wait_for_retry


class Transfer:
    def __init__(self, url, destination, session, progress, stopped, limit=0, retry=None,
                 expected_size=None):
        self.url, self.destination, self.session = url, destination, session
        self.progress, self.stopped, self.limit = progress, stopped, limit
        self.retry = retry or (lambda attempt: None)
        self.expected_size = expected_size

    def run(self):
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
        for attempt in range(6):
            if self.stopped():
                raise InterruptedError('Download cancelled')
            offset = os.path.getsize(self.destination) if os.path.exists(self.destination) else 0
            if not metadata.get('validator'):
                offset = 0
            headers = {'Accept-Encoding': 'identity'}
            if offset:
                headers.update({'Range': f'bytes={offset}-', 'If-Range': metadata['validator']})
            try:
                with self.session.get(self.url, headers=headers, stream=True, timeout=(15, 30)) as response:
                    # Restart an already-complete or no-longer-valid partial transfer.
                    if response.status_code == 416:
                        metadata = {}
                        continue
                    if 400 <= response.status_code < 500 and response.status_code not in (408, 429):
                        raise RuntimeError(f'Download server rejected the request (HTTP {response.status_code})')
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
                    os.remove(sidecar)
                    return
            except (requests.RequestException, ValueError) as exc:
                if attempt == 5:
                    raise RuntimeError(f'Download failed after 6 attempts: {exc}') from exc
                self.retry(attempt + 1)
                wait_for_retry(min(2 ** attempt, 16), self.stopped)
        raise RuntimeError('Server repeatedly rejected the download range')
