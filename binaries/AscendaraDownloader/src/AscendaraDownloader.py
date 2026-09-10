"""Ascendara Downloader V4.

The CLI and frontend compatibility routines are retained from the existing
downloader. Transfer, extraction supervision, staging and installation are new.
Run this file with the same positional arguments as AscendaraDownloader.py.
"""
import atexit
import ctypes
from contextlib import nullcontext
from collections import deque
import hashlib
import json
import logging
import math
import multiprocessing
import os
import re
import shutil
import stat
import string
import subprocess
import sys
import tempfile
import threading
import time
import zipfile
import zlib
from argparse import ArgumentParser
from tempfile import NamedTemporaryFile
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from AscendaraTransfer import Transfer
from AscendaraGofile import GofileClient, content_id as gofile_content_id
from AscendaraRarRecovery import (
    _load_api, _extended_path, _check_path, _member_path, _native_error,
    _file_error, _check_archive_target,
)

_caffeinate_proc = None

def cleanup_temporary(path, root, empty_only=False):
    """Remove an owned temporary path, retrying Windows locks/read-only files."""
    path, root = os.path.abspath(path), os.path.abspath(root)
    if os.path.normcase(path) == os.path.normcase(root):
        raise ValueError('Cleanup cannot remove the game directory')
    _check_path(root, path)
    target = _extended_path(path)

    def writable_retry(function, failed_path, error):
        if not os.path.islink(failed_path):
            os.chmod(failed_path, stat.S_IWRITE | stat.S_IREAD)
        function(failed_path)

    for attempt in range(5):
        try:
            if empty_only:
                os.rmdir(target)
            elif os.path.isdir(target):
                shutil.rmtree(target, onerror=writable_retry)
            else:
                try:
                    os.remove(target)
                except PermissionError:
                    os.chmod(target, stat.S_IWRITE | stat.S_IREAD)
                    os.remove(target)
            return True
        except FileNotFoundError:
            return True
        except OSError:
            if empty_only and os.path.isdir(target) and os.listdir(target):
                return False
            if attempt == 4:
                logging.warning('Temporary download files remain at %s', path, exc_info=True)
                return False
            time.sleep(.25 * (attempt + 1))

def safe_write_json(filepath, data, reset_stop=False):
    """Atomic UTF-8 writes; preserve Electron's stop request and surface failures."""
    if ('downloadingData' in data or 'game' in data) and not reset_stop:
        try:
            with open(filepath, encoding='utf-8') as stream:
                if json.load(stream).get('downloadingData', {}).get('stopped'):
                    raise InterruptedError('Download stopped by user')
        except InterruptedError:
            raise
        except (OSError, json.JSONDecodeError):
            pass
    temporary = None
    try:
        with NamedTemporaryFile('w', encoding='utf-8', delete=False,
                                dir=os.path.dirname(os.path.abspath(filepath)), suffix='.tmp') as stream:
            temporary = stream.name
            json.dump(data, stream, indent=4)
        for attempt in range(5):
            try:
                os.replace(temporary, filepath)
                return
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(.05 * 2 ** attempt)
    finally:
        if temporary and os.path.exists(temporary):
            os.remove(temporary)


def create_robust_session():
    session = requests.Session()
    # Transfer owns retries; do not multiply adapter retries by transfer retries.
    session.headers.update({'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity'})
    session.mount('https://', HTTPAdapter(max_retries=0))
    session.mount('http://', HTTPAdapter(max_retries=0))
    return session


class VerificationFailure(RuntimeError):
    pass


class SmoothETA:
    """Smooth the predicted finish time while letting seconds count down normally."""
    def __init__(self):
        self.remaining = None
        self.updated_at = None
        self.previous_done = 0
        self.previous_total = None

    def update(self, done, total, speed, now):
        if total != self.previous_total or done < self.previous_done:
            self.remaining = None
            self.updated_at = None
        self.previous_done, self.previous_total = done, total
        if not total or done >= total:
            self.remaining = None
            self.updated_at = None
            return 0
        if speed <= 0:
            return math.ceil(self.remaining) if self.remaining is not None else 0
        measured = max(0, (total - done) / speed)
        if self.remaining is None:
            self.remaining = measured
        else:
            elapsed = max(0, now - self.updated_at)
            predicted = max(0, self.remaining - elapsed)
            # Filter corrections to the finish time, not the countdown itself.
            # Ten seconds of smoothing absorbs brief speed dips, but a sustained
            # slowdown can still move the estimate upward instead of reaching 0 early.
            correction = measured - predicted
            weight = -math.expm1(-elapsed / 10.0)
            self.remaining = predicted + correction * weight
        self.updated_at = now
        # Reserve 0s for actual completion, including the final partial second.
        return max(1, math.ceil(self.remaining))


class ChunkedDownloader:
    """Compatibility adapter for direct downloads and archive repair."""
    def __init__(self, url, dest_path, game_info, game_info_path, session=None, expected_size=None):
        self.url, self.dest_path = url, dest_path
        self.game_info, self.game_info_path = game_info, game_info_path
        self.stopped, self.last_error = False, None
        self._eta = SmoothETA()
        self.session, self.expected_size = session, expected_size

    def _check_for_stop(self):
        try:
            with open(self.game_info_path, encoding='utf-8') as stream:
                self.stopped = self.stopped or json.load(stream).get('downloadingData', {}).get('stopped', False)
        except FileNotFoundError:
            self.stopped = True
        except (OSError, ValueError):
            pass
        return self.stopped

    def _progress(self, done, total, speed):
        if self._check_for_stop():
            raise InterruptedError('Download cancelled')
        eta = self._eta.update(done, total, speed, time.monotonic())
        eta_text = f'{eta}s' if eta < 60 else f'{eta // 60}m {eta % 60}s'
        if eta >= 3600:
            eta_text = f'{eta // 3600}h {(eta % 3600) // 60}m'
        data = self.game_info['downloadingData']
        data.update(downloading=True, extracting=False, verifying=False,
                    progressCompleted=f'{min(100, done / total * 100) if total else 0:.2f}',
                    progressDownloadSpeeds=read_size(speed) + '/s',
                    timeUntilComplete=eta_text if total else f'Downloaded: {read_size(done)}')
        safe_write_json(self.game_info_path, self.game_info)

    def download(self):
        try:
            limit = max(0, int(load_settings().get('downloadLimit', 0))) * 1024
            self._progress(0, None, 0)
            def retry(attempt):
                self.game_info['downloadingData']['retryAttempt'] = attempt
                safe_write_json(self.game_info_path, self.game_info)
            with (nullcontext(self.session) if self.session is not None else create_robust_session()) as session:
                Transfer(self.url, self.dest_path, session, self._progress, self._check_for_stop,
                         limit, retry, self.expected_size).run()
            self.game_info['downloadingData'].pop('retryAttempt', None)
            return True
        except InterruptedError:
            self.stopped = True
            return False
        except Exception as exc:
            self.last_error = str(exc)
            return False


def verify_manifest(root, manifest, check_cancelled):
    errors = []
    next_check = 0
    for name, info in manifest.items():
        now = time.monotonic()
        if now >= next_check:
            check_cancelled()
            next_check = now + .5
        path = _member_path(root, name)
        if not os.path.isfile(path):
            errors.append({'file': name, 'error': 'File not found'})
        elif os.path.getsize(path) != info['size']:
            errors.append({'file': name, 'error': f"Size mismatch: expected {info['size']}, got {os.path.getsize(path)}"})
    check_cancelled()
    return errors


def flatten_payload(root, manifest, game):
    """Strip a single wrapper using the manifest, without scanning the game tree."""
    roots = {name.split('/')[0] for name in manifest}
    if len(roots) != 1:
        return manifest
    wrapper = next(iter(roots))
    if not os.path.isdir(os.path.join(root, wrapper)):
        return manifest
    # A lone engine asset folder is not a repack wrapper.
    match = re.sub(r'[^a-z0-9]', '', wrapper.lower()) == re.sub(r'[^a-z0-9]', '', game.lower())
    if not match and not any(name.lower().endswith('.exe') for name in manifest):
        return manifest
    prefix = wrapper + '/'
    mapped = {name[len(prefix):]: info for name, info in manifest.items()}
    for name in mapped:
        _member_path(root, name)
    source = os.path.join(root, wrapper)
    # A same-name nested wrapper needs a temporary rename to avoid self-collision.
    temporary = tempfile.mkdtemp(prefix='.flatten-', dir=os.path.dirname(root))
    os.rmdir(temporary)
    os.replace(source, temporary)
    for name in os.listdir(temporary):
        os.replace(os.path.join(temporary, name), os.path.join(root, name))
    os.rmdir(temporary)
    return mapped


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
    candidates = [shutil.which('7z'), shutil.which('7zz'), shutil.which('7za')]
    candidates += [os.path.join(root, name) for root in roots for name in ('7z.exe', '7zz', '7z')]
    return next((path for path in candidates if path and os.path.isfile(path)), None)


def _run_cli(command, cancelled, activity):
    """Drain combined output continuously and always reap the native child."""
    from collections import deque
    tail = deque(maxlen=64)
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, creationflags=0x08000000 if os.name == 'nt' else 0)
    def drain():
        import codecs
        decoder = codecs.getincrementaldecoder('utf-8')(errors='replace')
        while True:
            chunk = process.stdout.read1(4096)
            if not chunk:
                return
            tail.append(chunk)
            activity(decoder.decode(chunk))
    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    try:
        while process.poll() is None:
            cancelled()
            time.sleep(.1)
        reader.join()
        if process.returncode != 0:
            raise RuntimeError(f'Extractor exited with code {process.returncode}: ' +
                               b''.join(tail).decode('utf-8', errors='replace')[-4000:])
        return b''.join(tail).decode('utf-8', errors='replace')
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        reader.join(timeout=3)
        process.stdout.close()


def extraction_worker(archive, destination, manifest_path, connection, stop):
    """Only this process touches archive decoders. No frontend JSON writes here."""
    last_sent = 0
    state = {'name': 'Preparing...', 'files': 0, 'total': 0, 'percent': 0}
    manifest = {}
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
        kind, _ = AscendaraDownloader.detect_file_type(archive)
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
            raise RuntimeError(f'Incomplete archive output: {errors[0]}')
        state.update(files=len(manifest), total=len(manifest), percent=100, name='Finalizing...')
        report(True)
        with open(manifest_path, 'w', encoding='utf-8') as stream:
            json.dump(manifest, stream)
        connection.send(('done', None))
    except BaseException as exc:
        if isinstance(exc, zlib.error):
            exc = RuntimeError(f'Archive corrupt data: {exc}')
        try:
            connection.send(('error', (type(exc).__name__, str(exc))))
        except (OSError, EOFError):
            pass
    finally:
        connection.close()


def supervise_extraction(archive, destination, check_cancelled, progress, workdir, idle_timeout=300):
    context = multiprocessing.get_context('spawn')
    receiver, sender = context.Pipe(duplex=False)
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
                elif event == 'error':
                    kind, message = value
                    exception = {'InterruptedError': InterruptedError, 'OSError': OSError,
                                 'ValueError': ValueError}.get(kind, RuntimeError)
                    raise exception(message)
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

def prevent_sleep():
    """Prevent the system from sleeping while a download is active."""
    global _caffeinate_proc
    try:
        if sys.platform == 'win32':
            import ctypes
            ES_CONTINUOUS        = 0x80000000
            ES_SYSTEM_REQUIRED   = 0x00000001
            ctypes.windll.kernel32.SetThreadExecutionState(
                ES_CONTINUOUS | ES_SYSTEM_REQUIRED
            )
            logging.info("[AscendaraDownloader] Sleep prevention enabled")
        elif sys.platform == 'darwin':
            _caffeinate_proc = subprocess.Popen(
                ['caffeinate', '-s'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            logging.info("[AscendaraDownloader] Sleep prevention enabled (caffeinate)")
    except Exception as e:
        logging.warning(f"[AscendaraDownloader] Could not enable sleep prevention: {e}")


def allow_sleep():
    """Re-allow the system to sleep after download is complete."""
    global _caffeinate_proc
    try:
        if sys.platform == 'win32':
            import ctypes
            ES_CONTINUOUS = 0x80000000
            ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
            logging.info("[AscendaraDownloader] Sleep prevention disabled")
        elif sys.platform == 'darwin' and _caffeinate_proc is not None:
            _caffeinate_proc.terminate()
            _caffeinate_proc = None
            logging.info("[AscendaraDownloader] Sleep prevention disabled (caffeinate stopped)")
    except Exception as e:
        logging.warning(f"[AscendaraDownloader] Could not disable sleep prevention: {e}")


def get_ascendara_log_path():
    if sys.platform == "win32":
        appdata = os.getenv("APPDATA")
    else:
        appdata = os.path.expanduser("~/.config")
    ascendara_dir = os.path.join(appdata, "Ascendara by tagoWorks")
    os.makedirs(ascendara_dir, exist_ok=True)
    return os.path.join(ascendara_dir, "downloadmanager.log")


def _launch_crash_reporter_on_exit(error_code, error_message):
    try:
        binary_name = 'AscendaraCrashReporter.exe' if sys.platform == 'win32' else 'AscendaraCrashReporter'
        crash_reporter_path = os.path.join('.', binary_name)
        if os.path.exists(crash_reporter_path):
            kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
            subprocess.Popen(
                [crash_reporter_path, "maindownloader", str(error_code), error_message],
                **kwargs
            )
        else:
            logging.error(f"Crash reporter not found at: {crash_reporter_path}")
    except Exception as e:
        logging.error(f"Failed to launch crash reporter: {e}")


def launch_crash_reporter(error_code, error_message):
    if not hasattr(launch_crash_reporter, "_registered"):
        atexit.register(_launch_crash_reporter_on_exit, error_code, error_message)
        launch_crash_reporter._registered = True


def _launch_notification(theme, title, message):
    try:
        exe_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
        notification_helper_path = os.path.join(exe_dir, 'AscendaraNotificationHelper.exe')
        logging.debug(f"Looking for notification helper at: {notification_helper_path}")
        
        if os.path.exists(notification_helper_path):
            logging.debug(f"Launching notification: theme={theme}, title='{title}'")
            kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
            subprocess.Popen(
                [notification_helper_path, "--theme", theme, "--title", title, "--message", message],
                **kwargs
            )
        else:
            logging.error(f"Notification helper not found at: {notification_helper_path}")
    except Exception as e:
        logging.error(f"Failed to launch notification helper: {e}")


def read_size(size: int, decimal_places: int = 2) -> str:
    if size == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    i = 0
    size_float = float(size)
    while size_float >= 1024 and i < len(units) - 1:
        size_float /= 1024.0
        i += 1
    return f"{size_float:.{decimal_places}f} {units[i]}"


def sanitize_folder_name(name: str) -> str:
    valid_chars = "-_.() %s%s" % (string.ascii_letters, string.digits)
    return ''.join(c for c in name if c in valid_chars)


def get_settings_path() -> Optional[str]:
    """Get the path to Ascendara settings file."""
    app_folder = 'Ascendara' if getattr(sys, 'frozen', False) else 'Electron'
    if sys.platform == 'win32':
        appdata = os.environ.get('APPDATA')
        if appdata:
            candidate = os.path.join(appdata, app_folder, 'ascendarasettings.json')
            if os.path.exists(candidate):
                return candidate
    elif sys.platform == 'darwin':
        candidate = os.path.join(os.path.expanduser('~/Library/Application Support/ascendara'), 'ascendarasettings.json')
        if os.path.exists(candidate):
            return candidate
    else:
        candidate = os.path.join(os.path.expanduser('~/.config/ascendara'), 'ascendarasettings.json')
        if os.path.exists(candidate):
            return candidate
    return None


def load_settings() -> Dict[str, Any]:
    """Load Ascendara settings."""
    settings_path = get_settings_path()
    if settings_path and os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"Could not read settings: {e}")
    return {}


def get_directory_size(path: str) -> int:
    """Calculate total size of a directory in bytes."""
    total_size = 0
    try:
        for dirpath, dirnames, filenames in os.walk(path):
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                try:
                    total_size += os.path.getsize(filepath)
                except (OSError, FileNotFoundError):
                    pass
    except Exception as e:
        logging.warning(f"Error calculating directory size for {path}: {e}")
    return total_size


def get_free_disk_space(path: str) -> int:
    """Get free disk space in bytes for the drive containing the path."""
    try:
        if sys.platform == 'win32':
            import ctypes
            free_bytes = ctypes.c_ulonglong(0)
            ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                ctypes.c_wchar_p(path), None, None, ctypes.pointer(free_bytes)
            )
            return free_bytes.value
        else:
            stat = os.statvfs(path)
            return stat.f_bavail * stat.f_frsize
    except Exception as e:
        logging.error(f"Error getting free disk space: {e}")
        return 0


def check_disk_space(path: str, required_bytes: int, operation: str = "operation") -> bool:
    """Check if there's enough disk space for an operation.
    
    Args:
        path: Directory path to check
        required_bytes: Required space in bytes
        operation: Description of the operation for logging
    
    Returns:
        True if sufficient space, False otherwise
    """
    try:
        free_space = get_free_disk_space(path)
        # Add 10% buffer for safety
        required_with_buffer = int(required_bytes * 1.1)
        
        if free_space < required_with_buffer:
            logging.error(
                f"Insufficient disk space for {operation}: "
                f"Required: {read_size(required_with_buffer)}, "
                f"Available: {read_size(free_space)}"
            )
            return False
        
        logging.info(
            f"Disk space check passed for {operation}: "
            f"Required: {read_size(required_with_buffer)}, "
            f"Available: {read_size(free_space)}"
        )
        return True
    except Exception as e:
        logging.error(f"Error checking disk space: {e}")
        # Return True to avoid blocking operations if check fails
        return True


def handleerror(game_info: Dict, game_info_path: str, error: Any):
    """Handle download errors by updating game info."""
    game_info['online'] = ""
    game_info['dlc'] = ""
    game_info['isRunning'] = False
    game_info['executable'] = ""
    if 'downloadingData' in game_info:
        prev_data = game_info['downloadingData'] or {}
        game_info['downloadingData'] = {
            "error": True,
            "message": str(error),
            # Preserve the last known progress/speed so error reports reflect
            # how far the download/extraction actually got instead of showing 0%/N-A.
            "progressCompleted": prev_data.get("progressCompleted", "0.00"),
            "progressDownloadSpeeds": prev_data.get("progressDownloadSpeeds", "0.00 KB/s"),
            "timeUntilComplete": prev_data.get("timeUntilComplete", "0s"),
        }
    else:
        logging.error(f"[handleerror] downloadingData missing. Exception: {error}")
    safe_write_json(game_info_path, game_info)


def parse_boolean(value):
    if isinstance(value, bool):
        return value
    if value.lower() in ['true', '1', 'yes']:
        return True
    elif value.lower() in ['false', '0', 'no']:
        return False
    else:
        raise ValueError(f"Invalid boolean value: {value}")



# V4 engine is defined below the compatibility helpers.

class AscendaraDownloader:
    def __init__(self, game: str, online: bool, dlc: bool, isVr: bool, 
                 updateFlow: bool, version: str, size: str, download_dir: str, gameID: str = ""):
        self.game = game
        if sanitize_folder_name(game).strip(' .') == '':
            raise ValueError('Game name must contain a valid folder name')
        self.online = online
        self.dlc = dlc
        self.isVr = isVr
        self.updateFlow = updateFlow
        self.version = version
        self.size = size
        self.gameID = gameID
        self.download_dir = os.path.abspath(os.path.join(download_dir, sanitize_folder_name(game)))
        os.makedirs(self.download_dir, exist_ok=True)
        self.game_info_path = os.path.join(self.download_dir, f"{sanitize_folder_name(game)}.ascendara.json")
        self.withNotification = None
        
        # Initialize or update game info
        if updateFlow and os.path.exists(self.game_info_path):
            with open(self.game_info_path, 'r') as f:
                self.game_info = json.load(f)
            if 'downloadingData' not in self.game_info:
                self.game_info['downloadingData'] = {}
            self.game_info['downloadingData']['updating'] = True
            # Update version to the new version being downloaded
            if version:
                logging.info(f"[AscendaraDownloader] Updating version from {self.game_info.get('version', 'unknown')} to {version}")
                self.game_info['version'] = version
        else:
            self.game_info = {
                "game": game,
                "online": online,
                "dlc": dlc,
                "isVr": isVr,
                "version": version if version else "",
                "size": size,
                "gameID": gameID,
                "executable": os.path.join(self.download_dir, f"{sanitize_folder_name(game)}.exe"),
                "isRunning": False,
                "downloadingData": {
                    "downloading": False,
                    "verifying": False,
                    "extracting": False,
                    "updating": updateFlow,
                    "progressCompleted": "0.00",
                    "progressDownloadSpeeds": "0.00 KB/s",
                    "timeUntilComplete": "0s",
                    "extractionProgress": {
                        "currentFile": "",
                        "filesExtracted": 0,
                        "totalFiles": 0,
                        "percentComplete": "0.00",
                        "extractionSpeed": "0 files/s"
                    }
                }
            }
        self.game_info.get('downloadingData', {}).pop('stopped', None)
        safe_write_json(self.game_info_path, self.game_info, reset_stop=True)


    def _get_filename_from_url(self, url: str) -> str:
        """Extract filename from URL or Content-Disposition header."""
        from urllib.parse import unquote
        base_name = unquote(os.path.basename(url.split('?')[0].split('#')[0]))
        
        try:
            session = create_robust_session()
            head = session.head(url, allow_redirects=True, timeout=10)
            cd = head.headers.get('content-disposition', '')
            fname = re.findall(r'filename\*?=(?:UTF-8\'\')?["\']?([^"\';\r\n]+)', cd, re.IGNORECASE)
            if fname:
                base_name = unquote(fname[-1].strip())
            session.close()
        except Exception:
            pass

        # Strip characters Windows cannot use and guard against empty names
        # (e.g. URLs ending in "/dl/<token>" with no Content-Disposition).
        base_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', base_name).strip().rstrip('.')
        if not base_name or base_name in ('download', 'dl'):
            base_name = f"{sanitize_folder_name(self.game)}.download"
        return base_name


    @staticmethod
    def detect_file_type(filepath: str) -> Tuple[str, Optional[str]]:
        """Detect file type from magic bytes."""
        with open(filepath, 'rb') as f:
            sig = f.read(8)
        
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


    def _fix_file_extension(self, dest: str) -> str:
        """Fix file extension based on detected file type."""
        filetype, hexsig = self.detect_file_type(dest)
        logging.info(f"[AscendaraDownloader] Detected file type: {filetype}")
        
        ext_map = {'zip': '.zip', 'rar': '.rar', '7z': '.7z', 'exe': '.exe'}
        correct_ext = ext_map.get(filetype)
        
        if correct_ext and not dest.endswith(correct_ext):
            current_ext = os.path.splitext(dest)[1]
            if current_ext:
                new_dest = dest[:-len(current_ext)] + correct_ext
            else:
                new_dest = dest + correct_ext
            
            logging.info(f"[AscendaraDownloader] Renaming to: {new_dest}")
            # os.rename raises FileExistsError on Windows if a stale target exists
            os.replace(dest, new_dest)
            return new_dest
        
        return dest


    def _pre_download_disk_check(self) -> bool:
        """Check disk space before starting a download based on the reported install size.

        Returns True if it's safe to proceed (or the check could not be performed),
        False if there is not enough disk space (error is already recorded).
        """
        if not self.size:
            return True
        try:
            size_parts = self.size.split()
            if len(size_parts) != 2:
                return True
            size_value = float(size_parts[0])
            size_unit = size_parts[1].upper()
            multipliers = {'B': 1, 'KB': 1024, 'MB': 1024**2, 'GB': 1024**3, 'TB': 1024**4}
            estimated_download_size = int(size_value * multipliers.get(size_unit, 1024**3))
            # Estimate total needed: download + extraction (3x) + backup if update
            total_needed = estimated_download_size * 4 if self.updateFlow else estimated_download_size * 3

            if not check_disk_space(self.download_dir, total_needed, "download and extraction"):
                error_msg = f"Insufficient disk space. Need ~{read_size(total_needed)}"
                logging.error(f"[AscendaraDownloader] {error_msg}")
                handleerror(self.game_info, self.game_info_path, error_msg)
                if self.withNotification:
                    _launch_notification(self.withNotification, "Download Failed", error_msg)
                return False
        except Exception as e:
            logging.warning(f"[AscendaraDownloader] Could not parse size for disk check: {e}")
        return True


    def _download_buzzheavier(self, url: str):
        """Download from Buzzheavier with robust chunked download and resume support."""
        from urllib.parse import urlparse, parse_qs
        import re

        logging.info(f"[AscendaraDownloader] Buzzheavier download: {url}")

        if not self._pre_download_disk_check():
            return

        parsed = urlparse(url)
        path_parts = parsed.path.strip('/').split('/')
        is_presigned = len(path_parts) >= 2 and path_parts[0] == 'd' and parsed.query

        if is_presigned:
            # New format: https://ts.bzzhr.to/d/{file_id}?v={token} - direct download URL
            logging.info(f"[Buzzheavier] Detected pre-signed URL, downloading directly")
            final_url = url
            # Try to get filename from Content-Disposition header
            session = create_robust_session()
            try:
                head = session.head(url, allow_redirects=True, timeout=20)
                cd = head.headers.get('content-disposition', '')
                fname_match = re.findall(r'filename[*]?=["\']?([^"\';\r\n]+)', cd, re.IGNORECASE)
                filename = sanitize_folder_name(fname_match[0].strip()) if fname_match else path_parts[1]
            except Exception as e:
                logging.warning(f"[Buzzheavier] Could not get filename from headers: {e}")
                filename = path_parts[1]
            finally:
                session.close()
            logging.info(f"[Buzzheavier] Filename: {filename}")
        else:
            # Legacy format: https://bzzhr.to/{file_id} - scrape page for token
            from bs4 import BeautifulSoup
            session = create_robust_session()
            page_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                # No 'br': requests can't decode brotli without an extra package,
                # which would turn the page into garbage and break token parsing.
                'Accept-Encoding': 'gzip, deflate',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
            }
            response = session.get(url, headers=page_headers, timeout=30)
            if response.status_code in (403, 429):
                raise Exception(
                    f"Buzzheavier blocked the request (HTTP {response.status_code}). "
                    "The host may be rate limiting you; try again later or with a VPN."
                )
            if response.status_code == 404:
                raise Exception("Buzzheavier file not found (HTTP 404). The link may have expired or been removed.")
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')
            title = soup.title.string.strip() if soup.title else 'buzzheavier_download'
            logging.info(f"[Buzzheavier] Title/filename: {title}")

            token_match = re.search(r'hx-get="[^"]+/download\?t=([^"&]+)', response.text)
            if not token_match:
                raise Exception("Could not find download token in page. Buzzheavier may have changed their API.")

            token = token_match.group(1)
            logging.info(f"[Buzzheavier] Found token: {token[:20]}...")

            base_domain = parsed.netloc
            file_id = url.rstrip('/').split('/')[-1]
            download_url_with_token = f"https://{base_domain}/{file_id}/download?t={token}"

            hx_headers = {
                'hx-current-url': url,
                'hx-request': 'true',
                'referer': url
            }
            head_response = session.head(download_url_with_token, headers=hx_headers, allow_redirects=False, timeout=30)
            hx_redirect = head_response.headers.get('hx-redirect') or head_response.headers.get('Hx-Redirect')

            if not hx_redirect:
                raise Exception(f"No hx-redirect in response. Status: {head_response.status_code}")

            if hx_redirect.rstrip('/') == url.rstrip('/'):
                raise Exception(f"Buzzheavier returned self-redirect loop: {hx_redirect}")

            logging.info(f"[Buzzheavier] Final download URL: {hx_redirect}")

            if hx_redirect.startswith('/'):
                final_url = f"https://{base_domain}{hx_redirect}"
            else:
                final_url = hx_redirect

            session.close()
            filename = sanitize_folder_name(title) if title else file_id
        if not filename.strip():
            filename = f"{sanitize_folder_name(self.game)}.download"
        # Use the robust ChunkedDownloader for the actual file download
        dest_path = self._download_path(filename)
        
        # Update state
        self.game_info["downloadingData"]["downloading"] = True
        safe_write_json(self.game_info_path, self.game_info)
        
        # Create chunked downloader and start download
        downloader = ChunkedDownloader(final_url, dest_path, self.game_info, self.game_info_path)
        success = downloader.download()

        if downloader.stopped:
            logging.info("[Buzzheavier] Download cancelled by user; not reporting as error")
            return

        if success:
            logging.info(f"[Buzzheavier] Downloaded as: {dest_path}")
            
            # Update state
            self.game_info["downloadingData"]["downloading"] = False
            self.game_info["downloadingData"]["progressCompleted"] = "100.00"
            self.game_info["downloadingData"]["progressDownloadSpeeds"] = "0.00 KB/s"
            self.game_info["downloadingData"]["timeUntilComplete"] = "0s"
            safe_write_json(self.game_info_path, self.game_info)
            
            # Detect and fix file extension
            dest_path = self._fix_file_extension(dest_path)
            self._archive_sources = {os.path.abspath(dest_path): final_url}
            
            # Extract files
            self._extract_files(dest_path)
            
            if self.withNotification and "downloadingData" not in self.game_info:
                _launch_notification(self.withNotification, "Download Complete", f"Successfully downloaded {self.game}")
        else:
            detail = f": {downloader.last_error}" if downloader.last_error else ""
            raise Exception(f"Buzzheavier download failed after all retries{detail}")


    def _repair_archive(self, error, archive_path, attempt):
        from AscendaraDownloadRecovery import recover_archive

        def download(source, destination):
            if isinstance(source, dict):
                downloader = ChunkedDownloader(source['link'], destination, self.game_info, self.game_info_path,
                                               session=self._gofile_session, expected_size=source.get('size'))
            else:
                downloader = ChunkedDownloader(source, destination, self.game_info, self.game_info_path)
            if not downloader.download():
                if downloader.stopped:
                    raise InterruptedError('Archive repair cancelled')
                raise RuntimeError('Archive repair download failed; the original archive has been kept')

        def on_retry():
            logging.warning(f"[AscendaraDownloader] Re-downloading damaged archive: {os.path.basename(archive_path)}")
            self.game_info['downloadingData'].update({
                'extracting': False, 'downloading': True, 'verifying': False,
                'progressCompleted': '0.00', 'retryAttempt': attempt + 1,
                'timeUntilComplete': 'Repairing archive',
            })
            safe_write_json(self.game_info_path, self.game_info)

        recover_archive(error, archive_path, attempt, getattr(self, '_archive_sources', {}),
                        download, self._check_for_stop, on_retry)
        self.game_info['downloadingData'].update({'downloading': False, 'extracting': True,
                                                 'progressCompleted': '100.00'})
        self.game_info['downloadingData'].pop('retryAttempt', None)
        safe_write_json(self.game_info_path, self.game_info)


    def _detect_and_set_executable(self):
        """Intelligently detect and set the correct executable file for the game."""
        try:
            logging.info(f"[AscendaraDownloader] Detecting executable for {self.game}")
            
            # Collect all .exe files in the download directory
            exe_files = []
            for root, dirs, files in os.walk(self.download_dir):
                for file in files:
                    if file.lower().endswith('.exe'):
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path, self.download_dir)
                        exe_files.append({
                            'path': full_path,
                            'rel_path': rel_path,
                            'name': file,
                            'size': os.path.getsize(full_path)
                        })
            
            if not exe_files:
                logging.warning(f"[AscendaraDownloader] No .exe files found in {self.download_dir}")
                return
            
            logging.info(f"[AscendaraDownloader] Found {len(exe_files)} .exe files")
            
            # Try to find executable reference in text files
            exe_from_text = self._find_exe_in_text_files()
            
            # Score each executable based on various criteria
            best_exe = None
            best_score = -1
            
            for exe in exe_files:
                score = 0
                exe_name_lower = exe['name'].lower()
                game_name_lower = self.game.lower()
                
                # Skip common installer/uninstaller/setup files
                skip_keywords = ['unins', 'uninstall', 'setup', 'installer', 'redist', 'vcredist', 
                                'directx', 'dotnet', 'prerequisite', 'launcher', 'updater', 
                                'crash', 'report', 'config', 'settings', 'easyanticheat', 
                                'battleye', 'steam_api']
                if any(keyword in exe_name_lower for keyword in skip_keywords):
                    logging.debug(f"[AscendaraDownloader] Skipping {exe['name']} (installer/utility)")
                    continue
                
                # Exact match with text file reference
                if exe_from_text and exe['name'].lower() == exe_from_text.lower():
                    score += 1000
                    logging.info(f"[AscendaraDownloader] Exact match with text file: {exe['name']}")
                
                # Partial match with text file reference
                if exe_from_text and exe_from_text.lower() in exe_name_lower:
                    score += 500
                
                # Match with game name (sanitized)
                sanitized_game = sanitize_folder_name(self.game).lower()
                if sanitized_game in exe_name_lower or exe_name_lower.replace('.exe', '') == sanitized_game:
                    score += 300
                
                # Partial game name match
                game_words = set(re.findall(r'\w+', game_name_lower))
                exe_words = set(re.findall(r'\w+', exe_name_lower.replace('.exe', '')))
                common_words = game_words & exe_words
                if common_words:
                    score += len(common_words) * 50
                
                # Prefer files in root or immediate subdirectories
                depth = exe['rel_path'].count(os.sep)
                if depth == 0:
                    score += 100
                elif depth == 1:
                    score += 50
                
                # Prefer larger files (likely the main game executable)
                if exe['size'] > 10 * 1024 * 1024:  # > 10 MB
                    score += 30
                elif exe['size'] > 1 * 1024 * 1024:  # > 1 MB
                    score += 10
                
                # Common game executable patterns
                game_exe_patterns = [r'^game\.exe$', r'^start\.exe$', r'^play\.exe$', 
                                    r'.*game.*\.exe$', r'^[^_]+\.exe$']
                for pattern in game_exe_patterns:
                    if re.match(pattern, exe_name_lower):
                        score += 20
                        break
                
                logging.debug(f"[AscendaraDownloader] {exe['name']}: score={score}, size={exe['size']}, depth={depth}")
                
                if score > best_score:
                    best_score = score
                    best_exe = exe
            
            if best_exe:
                self.game_info['executable'] = best_exe['path']
                logging.info(f"[AscendaraDownloader] Set executable to: {best_exe['rel_path']} (score: {best_score})")
                safe_write_json(self.game_info_path, self.game_info)
            else:
                # Fallback to first exe if no good match found
                if exe_files:
                    self.game_info['executable'] = exe_files[0]['path']
                    logging.warning(f"[AscendaraDownloader] No good match found, using first exe: {exe_files[0]['rel_path']}")
                    safe_write_json(self.game_info_path, self.game_info)
                
        except Exception as e:
            logging.error(f"[AscendaraDownloader] Error detecting executable: {e}")


    def _find_exe_in_text_files(self):
        """Search text files for executable references."""
        try:
            text_extensions = ['.txt', '.nfo', '.md', '.readme', '.diz']
            exe_pattern = re.compile(r'([a-zA-Z0-9_\-\s]+\.exe)', re.IGNORECASE)
            
            for root, dirs, files in os.walk(self.download_dir):
                for file in files:
                    file_lower = file.lower()
                    if any(file_lower.endswith(ext) for ext in text_extensions):
                        file_path = os.path.join(root, file)
                        try:
                            # Try different encodings
                            for encoding in ['utf-8', 'latin-1', 'cp1252']:
                                try:
                                    with open(file_path, 'r', encoding=encoding, errors='ignore') as f:
                                        content = f.read(50000)  # Read first 50KB
                                        matches = exe_pattern.findall(content)
                                        if matches:
                                            # Filter out common false positives
                                            filtered = [m for m in matches if not any(
                                                skip in m.lower() for skip in 
                                                ['unins', 'setup', 'install', 'redist', 'vcredist', 'directx']
                                            )]
                                            if filtered:
                                                logging.info(f"[AscendaraDownloader] Found exe reference in {file}: {filtered[0]}")
                                                return filtered[0].strip()
                                    break
                                except (UnicodeDecodeError, LookupError):
                                    continue
                        except Exception as e:
                            logging.debug(f"[AscendaraDownloader] Error reading {file}: {e}")
                            continue
            
            return None
        except Exception as e:
            logging.error(f"[AscendaraDownloader] Error searching text files: {e}")
            return None


    def _handle_post_download_behavior(self):
        """Handle post-download actions like lock, sleep, shutdown."""
        allow_sleep()
        try:
            settings = load_settings()
            behavior = settings.get('behaviorAfterDownload', 'none')
            logging.info(f"[AscendaraDownloader] Post-download behavior: {behavior}")
            
            if behavior == 'lock':
                logging.info("[AscendaraDownloader] Locking computer")
                if sys.platform == 'win32':
                    os.system('rundll32.exe user32.dll,LockWorkStation')
                elif sys.platform == 'darwin':
                    os.system('/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend')
            elif behavior == 'sleep':
                logging.info("[AscendaraDownloader] Putting computer to sleep")
                if sys.platform == 'win32':
                    os.system('rundll32.exe powrprof.dll,SetSuspendState 0,1,0')
                elif sys.platform == 'darwin':
                    os.system('pmset sleepnow')
            elif behavior == 'shutdown':
                logging.info("[AscendaraDownloader] Shutting down computer")
                if sys.platform == 'win32':
                    os.system('shutdown /s /t 60 /c "Ascendara download complete - shutting down in 60 seconds"')
                elif sys.platform == 'darwin':
                    os.system('osascript -e "tell app \\"System Events\\" to shut down"')
            else:
                logging.info("[AscendaraDownloader] No post-download action required")
        except Exception as e:
            logging.error(f"[AscendaraDownloader] Post-download behavior error: {e}")



    VALID_BUZZHEAVIER_DOMAINS = ('buzzheavier.com', 'bzzhr.co', 'bzzhr.to',
                               'ts.bzzhr.to', 'fafda.to', 'fuckingfast.net', 'fuckingfast.co')

    def _check_for_stop(self):
        if getattr(self, '_stopped', False):
            return True
        now = time.monotonic()
        if now - getattr(self, '_last_stop_poll', -1) < .2:
            return False
        self._last_stop_poll = now
        try:
            with open(self.game_info_path, encoding='utf-8') as stream:
                self._stopped = json.load(stream).get('downloadingData', {}).get('stopped', False)
        except FileNotFoundError:
            self._stopped = True
        except (OSError, ValueError):
            pass  # Electron may be halfway through writing the stop request.
        return getattr(self, '_stopped', False)

    def _check_cancelled(self):
        if self._check_for_stop():
            raise InterruptedError('Download stopped by user')

    def _download_path(self, filename):
        folder = _member_path(self.download_dir, '.ascendara-downloads')
        os.makedirs(folder, exist_ok=True)
        return _member_path(folder, filename)

    def download(self, url, withNotification=None, provider='auto', password=None):
        self.withNotification = withNotification
        prevent_sleep()
        try:
            if provider not in ('auto', 'direct', 'gofile'):
                raise ValueError('Unknown download provider')
            normalized = url if '://' in url else 'https://' + url.lstrip('/')
            share_host = (urlparse(normalized).hostname or '').lower()
            if provider == 'gofile' or (provider == 'auto' and share_host in ('gofile.io', 'www.gofile.io')):
                self._download_gofile(normalized, password)
                if withNotification and 'downloadingData' not in self.game_info:
                    _launch_notification(withNotification, 'Download Complete', f'Successfully downloaded {self.game}')
                return
            host = (urlparse(url).hostname or '').lower()
            if any(host == domain or host.endswith('.' + domain) for domain in self.VALID_BUZZHEAVIER_DOMAINS):
                self._download_buzzheavier(url)
                return
            if not self._pre_download_disk_check():
                return
            self._check_cancelled()
            if withNotification:
                _launch_notification(withNotification, 'Download Started', f'Starting download for {self.game}')
            destination = self._download_path(self._get_filename_from_url(url))
            if destination.endswith('.ascendara.json'):
                raise ValueError('Download filename conflicts with Ascendara metadata')
            transfer = ChunkedDownloader(url, destination, self.game_info, self.game_info_path)
            if not transfer.download():
                if transfer.stopped:
                    raise InterruptedError('Download stopped by user')
                raise RuntimeError(transfer.last_error)
            destination = self._fix_file_extension(destination)
            self._archive_sources = {os.path.abspath(destination): url}
            self._extract_files(destination)
            if withNotification and 'downloadingData' not in self.game_info:
                _launch_notification(withNotification, 'Download Complete', f'Successfully downloaded {self.game}')
        except InterruptedError:
            logging.info('Download cancelled; retaining source archive and partial download')
        except VerificationFailure:
            logging.error('Verification failed; previous installation restored')
        except Exception as exc:
            logging.exception('V4 download failed')
            if not self._check_for_stop():
                message = str(exc)
                if any(term in message for term in ('SSL: WRONG_VERSION_NUMBER', 'WinError 10054', 'forcibly closed')):
                    message = 'provider_blocked_error'
                handleerror(self.game_info, self.game_info_path, message)
                if withNotification:
                    _launch_notification(withNotification, 'Download Error', f'Error downloading {self.game}: {exc}')
        finally:
            allow_sleep()

    def _extract_files(self, archive_path=None, loose_files=None, cleanup_folder=None):
        self._check_cancelled()
        loose_files = loose_files or []
        archives = ([os.path.abspath(p) for p in archive_path] if isinstance(archive_path, (list, tuple)) else
                    [os.path.abspath(archive_path)] if archive_path else
                    [os.path.join(self.download_dir, name) for name in os.listdir(self.download_dir)
                     if name.lower().endswith(('.zip', '.rar', '.7z'))])
        from AscendaraDownloadRecovery import archive_sources
        for part in archives:
            if re.search(r'\.part(?!0*1\.)\d+\.rar$', part, re.I):
                first_parts = {p: None for p in archives if re.search(r'\.part0*1\.rar$', p, re.I)}
                if not archive_sources(part, first_parts):
                    raise RuntimeError(f'Missing first RAR volume for {os.path.basename(part)}')
        archives = [p for p in archives if not re.search(r'\.part(?!0*1\.)\d+\.rar$', p, re.I)]
        if not archives and not loose_files:
            raise RuntimeError('No archive found to extract')
        data = self.game_info['downloadingData']
        data.update(downloading=False, extracting=True, verifying=False,
                    progressCompleted='100.00', progressDownloadSpeeds='0.00 KB/s', timeUntilComplete='0s')
        safe_write_json(self.game_info_path, self.game_info)
        started = time.monotonic()
        manifest = {}
        processed = []
        # Same-volume staging makes installation a rename rather than a second copy.
        stage = tempfile.mkdtemp(prefix='.ascendara-stage-', dir=self.download_dir)
        self._preserve_stage = False
        try:
            payload = os.path.join(stage, 'payload')
            os.mkdir(payload)
            last_copy_update = 0
            for item in loose_files:
                self._check_cancelled()
                target = _member_path(payload, item['filename'])
                os.makedirs(os.path.dirname(target), exist_ok=True)
                expected = item['size']
                if expected > shutil.disk_usage(payload).free:
                    raise OSError('Insufficient disk space for downloaded game files')
                copied = 0
                with open(item['source'], 'rb') as incoming, open(target, 'wb') as output:
                    while True:
                        self._check_cancelled()
                        chunk = incoming.read(1024 * 1024)
                        if not chunk:
                            break
                        output.write(chunk)
                        copied += len(chunk)
                        now = time.monotonic()
                        if now - last_copy_update >= .5:
                            self._extraction_progress({'name': item['filename'], 'files': len(manifest),
                                                       'total': len(loose_files)}, started)
                            last_copy_update = now
                if copied != expected:
                    raise RuntimeError(f'Incomplete downloaded file: {item["filename"]}')
                manifest[item['filename']] = {'size': expected}
            pending = list(archives)
            while pending:
                self._check_cancelled()
                archive = pending.pop(0)
                for attempt in range(2):
                    try:
                        result = supervise_extraction(archive, payload, self._check_cancelled,
                            lambda state: self._extraction_progress(state, started), stage)
                        break
                    except InterruptedError:
                        raise
                    except Exception as exc:
                        self._repair_archive(exc, archive, attempt)
                manifest.update(result)
                processed.append(archive)
                from AscendaraDownloadRecovery import archive_sources
                if os.path.commonpath([payload, archive]) == payload:
                    family = archive_sources(archive, {os.path.join(payload, n): None for n in os.listdir(payload)})
                    for path in family:
                        os.remove(path)
                        manifest.pop(os.path.relpath(path, payload).replace('\\', '/'), None)
                # All primary archives may contribute to the same wrapper directory.
                if not pending:
                    manifest = flatten_payload(payload, manifest, self.game)
                # Only unpack root continuation archives; nested game assets stay intact.
                for name in list(manifest):
                    if '/' not in name and name.lower().endswith(('.zip', '.rar', '.7z')):
                        nested = os.path.join(payload, name)
                        if re.search(r'\.part(?!0*1\.)\d+\.rar$', name, re.I):
                            continue
                        if nested in pending:
                            continue
                        if nested in processed:
                            raise RuntimeError('Recursive archive wrapper detected')
                        pending.append(nested)
                if len(processed) + len(pending) > len(archives) + 32:
                    raise RuntimeError('Too many nested archive wrappers')
            # Remove only archives actually consumed successfully (including their volumes).
            from AscendaraDownloadRecovery import archive_sources
            for archive in processed:
                if os.path.commonpath([payload, archive]) == payload:
                    family = archive_sources(archive, {os.path.join(payload, n): None for n in os.listdir(payload)})
                    for path in family:
                        os.remove(path)
                        manifest.pop(os.path.relpath(path, payload).replace('\\', '/'), None)
            manifest = flatten_payload(payload, manifest, self.game)
            errors = verify_manifest(payload, manifest, self._check_cancelled)
            if errors:
                data.update(extracting=False, verifying=False, verifyError=errors)
                safe_write_json(self.game_info_path, self.game_info)
                return
            self._check_cancelled()
            self._install_payload(payload, manifest, stage)
        finally:
            if not self._preserve_stage:
                cleanup_temporary(stage, self.download_dir)
        # Archives survive every failure above, including failed verification.
        for archive in archives:
            if not archive.lower().endswith(('.zip', '.rar', '.7z')):
                continue
            if os.path.commonpath([self.download_dir, archive]) != self.download_dir:
                continue
            archive_dir = os.path.dirname(archive)
            family = archive_sources(archive, {os.path.join(archive_dir, n): None
                                               for n in os.listdir(archive_dir)})
            for path in family:
                cleanup_temporary(path, self.download_dir)
        if cleanup_folder is not None:
            cleanup_temporary(cleanup_folder, self.download_dir)
        cleanup_temporary(os.path.join(self.download_dir, '.ascendara-downloads'),
                          self.download_dir, empty_only=True)
        # Publish completion only after cleanup, before sleep/shutdown actions.
        del self.game_info['downloadingData']
        safe_write_json(self.game_info_path, self.game_info)
        self._handle_post_download_behavior()

    def _download_gofile(self, url, password=None):
        self._check_cancelled()
        folder_id = gofile_content_id(url)
        folder = self._download_path('gofile-' + folder_id)
        os.makedirs(folder, exist_ok=True)
        receipts = _member_path(folder, '.ascendara-receipts')
        os.makedirs(receipts, exist_ok=True)
        data = self.game_info['downloadingData']
        data.update(downloading=True, extracting=False, verifying=False, timeUntilComplete='Getting download links...')
        safe_write_json(self.game_info_path, self.game_info)
        if self.withNotification:
            _launch_notification(self.withNotification, 'Download Started', f'Starting download for {self.game}')
        with create_robust_session() as api, create_robust_session() as session:
            client = GofileClient(api, self._check_cancelled)
            items = client.resolve(url, password)
            client.authenticate_downloads(session)
            # This session must remain open through automatic archive repair.
            self._gofile_session = session
            self._archive_sources = {}
            sizes = {item['id']: item['size'] for item in items}
            for item in items:
                if item['filename'].lower().startswith('.ascendara') or item['filename'].lower().endswith(('.resume.json', '.ascendara.json')):
                    raise ValueError('GOFile filename conflicts with downloader metadata')
                item['source'] = _member_path(folder, item['filename'])
                self._archive_sources[item['source']] = dict(item)
            # Each transfer checks remaining disk space. Counting the whole batch
            # here would count completed, cached files twice when resuming.
            reporter = ChunkedDownloader('', '', self.game_info, self.game_info_path)
            completed, last_speed, last_update = 0, 0, 0
            limit = max(0, int(load_settings().get('downloadLimit', 0))) * 1024
            for item in items:
                self._check_cancelled()
                receipt_path = os.path.join(receipts, hashlib.sha256(item['id'].encode()).hexdigest() + '.json')
                identity = {key: item[key] for key in ('id', 'filename', 'size', 'md5')}
                cached = False
                try:
                    with open(receipt_path, encoding='utf-8') as stream:
                        cached = (json.load(stream) == identity and item['size'] is not None
                                  and os.path.getsize(item['source']) == item['size'])
                except (OSError, ValueError):
                    pass
                def progress(done, total, speed):
                    nonlocal last_speed, last_update
                    if total is not None:
                        sizes[item['id']] = total
                    if speed > 0:
                        last_speed = speed
                    now = time.monotonic()
                    if now - last_update >= .5:
                        batch_total = sum(sizes.values()) if all(v is not None for v in sizes.values()) else None
                        reporter._progress(completed + done, batch_total, last_speed)
                        last_update = now
                def retry(attempt):
                    data['retryAttempt'] = attempt
                    safe_write_json(self.game_info_path, self.game_info)
                if not cached:
                    Transfer(item['link'], item['source'], session, progress, self._check_for_stop,
                             limit, retry, item['size']).run()
                    item['size'] = os.path.getsize(item['source'])
                    identity['size'] = item['size']
                    safe_write_json(receipt_path, identity)
                completed += item['size']
                sizes[item['id']] = item['size']
            self._check_cancelled()
            data.pop('retryAttempt', None)
            reporter._progress(completed, completed, 0)
            self.game_info['size'] = read_size(completed)
            archives, loose = [], []
            for item in items:
                if item['filename'].lower().endswith(('.zip', '.rar', '.7z')):
                    archives.append(item['source'])
                elif re.search(r'\.[r-z]\d{2}$', item['filename'], re.I):
                    from AscendaraDownloadRecovery import archive_sources
                    candidates = {i['source']: None for i in items if i['filename'].lower().endswith('.rar')}
                    if not archive_sources(item['source'], candidates):
                        raise RuntimeError(f'Missing first RAR volume for {item["filename"]}')
                elif _wanted(item['filename']):
                    loose.append(item)
            self._extract_files(archives, loose, cleanup_folder=folder)
            self._gofile_session = None

    def _extraction_progress(self, state, started):
        self._check_cancelled()
        now = time.monotonic()
        done, total = state['files'], state['total']
        byte_count = state.get('bytes')
        samples = getattr(self, '_extraction_samples', None)
        if (samples is None or getattr(self, '_extraction_sample_start', None) != started or
                samples and (done < samples[-1][1] or
                             (byte_count is None) != (samples[-1][2] is None) or
                             byte_count is not None and samples[-1][2] is not None and byte_count < samples[-1][2])):
            samples = self._extraction_samples = deque()
            self._extraction_sample_start = started
        samples.append((now, done, byte_count))
        while len(samples) > 2 and samples[1][0] <= now - 10:
            samples.popleft()
        elapsed = max(.001, now - samples[0][0])
        file_rate = max(0, done - samples[0][1]) / elapsed
        speed = f'{file_rate:.2f} files/s'
        if byte_count is not None and samples[0][2] is not None:
            byte_rate = max(0, byte_count - samples[0][2]) / elapsed
            speed = f'{read_size(byte_rate)}/s ({speed})'
        name = state['name'].replace('\\', '/').rstrip('/').rsplit('/', 1)[-1]
        percent = state.get('percent', done / total * 100 if total else 0)
        self.game_info['downloadingData']['extractionProgress'] = {
            'currentFile': name, 'filesExtracted': done,
            'totalFiles': total, 'percentComplete': f'{min(100, percent):.2f}',
            'extractionSpeed': speed,
        }
        safe_write_json(self.game_info_path, self.game_info)
        if now - getattr(self, '_last_extraction_log', 0) >= 15:
            logging.info('Extraction [%s]: %s, %s/%s files, %.2f%%, %s',
                         state.get('engine', 'Preparing'), speed, done, total, percent, name)
            self._last_extraction_log = now

    def _install_payload(self, payload, manifest, stage):
        """Journal overwritten files by rename and roll back a failed installation."""
        rollback = os.path.join(stage, 'rollback')
        os.mkdir(rollback)
        journal = []
        old_filemap = os.path.join(self.download_dir, 'filemap.ascendara.json')
        old_map = None
        if os.path.isfile(old_filemap):
            with open(old_filemap, 'rb') as stream:
                old_map = stream.read()
        installed_manifest = {}
        if self.updateFlow and old_map is not None:
            installed_manifest = {name: info for name, info in json.loads(old_map).items()
                                  if not name.endswith('.ascendara.json')}
        installed_manifest.update(manifest)
        # Retain a readable recovery map if the process is killed during installation.
        safe_write_json(os.path.join(rollback, 'paths.json'),
                        {str(index): name for index, name in enumerate(manifest)})
        if old_map is not None:
            with open(os.path.join(rollback, 'previous-filemap.json'), 'wb') as stream:
                stream.write(old_map)
        try:
            for name in manifest:
                self._check_cancelled()
                if any(part.lower().endswith('.ascendara.json') or part.lower().startswith(('.ascendara-', '.ascendara_')) for part in name.split('/')):
                    raise ValueError(f'Archive conflicts with Ascendara metadata: {name}')
                target = _member_path(self.download_dir, name)
                source = _member_path(payload, name)
                backup = None
                os.makedirs(os.path.dirname(target), exist_ok=True)
                if os.path.exists(target):
                    if not os.path.isfile(target):
                        raise ValueError(f'Archive file conflicts with existing directory: {name}')
                    backup = os.path.join(rollback, str(len(journal)))
                    os.replace(target, backup)
                journal.append((target, backup))
                os.replace(source, target)
            safe_write_json(old_filemap, installed_manifest)
            data = self.game_info['downloadingData']
            data.update(extracting=False, verifying=True)
            safe_write_json(self.game_info_path, self.game_info)
            if self.withNotification:
                _launch_notification(self.withNotification, 'Extraction Complete', f'Extraction complete for {self.game}')
            verify_started = time.monotonic()
            errors = verify_manifest(self.download_dir, installed_manifest, self._check_cancelled)
            from AscendaraDownloadRecovery import wait_for_retry
            wait_for_retry(max(0, 1 - (time.monotonic() - verify_started)), self._check_for_stop)
            data['verifying'] = False
            if errors:
                data['verifyError'] = errors
                safe_write_json(self.game_info_path, self.game_info)
                raise VerificationFailure('Installed files failed size verification')
            self._detect_and_set_executable()
            self._check_cancelled()
        except BaseException:
            self.game_info.setdefault('downloadingData', data if 'data' in locals() else {})
            try:
                for target, backup in reversed(journal):
                    if os.path.isfile(target):
                        os.remove(target)
                    if backup:
                        os.replace(backup, target)
                if old_map is not None:
                    with open(old_filemap, 'wb') as stream:
                        stream.write(old_map)
                elif os.path.exists(old_filemap):
                    os.remove(old_filemap)
            except BaseException:
                self._preserve_stage = True
                logging.exception('Rollback could not finish. Recovery files retained at %s', stage)
                raise
            raise


def extract_rar_stream(archive_path, dest_dir, password='steamrip.com',
                         on_file=None, should_stop=None, on_progress=None):
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
            skip = not _wanted(name)
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


def create_argument_parser():
    parser = ArgumentParser(description='Ascendara Downloader V4')
    parser.add_argument('url', help='Download URL')
    parser.add_argument('game', help='Name of the game')
    parser.add_argument('online', type=parse_boolean)
    parser.add_argument('dlc', type=parse_boolean)
    parser.add_argument('isVr', type=parse_boolean)
    parser.add_argument('updateFlow', type=parse_boolean)
    parser.add_argument('version')
    parser.add_argument('size')
    parser.add_argument('download_dir')
    parser.add_argument('gameID', nargs='?', default='')
    parser.add_argument('--withNotification', default=None)
    parser.add_argument('--provider', choices=('auto', 'direct', 'gofile'), default='auto',
                        help='Download provider; auto detects GOFile sharing URLs')
    parser.add_argument('--password', default=None, help='Password for a protected GOFile folder')
    return parser


def main():
    args = create_argument_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                        handlers=[logging.FileHandler(get_ascendara_log_path(), encoding='utf-8'),
                                  logging.StreamHandler(sys.stdout)])
    try:
        downloader = AscendaraDownloader(args.game, args.online, args.dlc, args.isVr,
                                         args.updateFlow, args.version, args.size,
                                         args.download_dir, args.gameID)
        downloader.download(args.url, args.withNotification, args.provider, args.password)
    except Exception as exc:
        logging.exception('AscendaraDownloaderV4 fatal error')
        launch_crash_reporter(1, str(exc))
        raise


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()

