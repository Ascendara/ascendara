"""Ascendara Downloader V4.

The CLI and frontend compatibility routines are retained from the existing
downloader. Transfer, extraction supervision, staging and installation are new.
Run this file with the same positional arguments as the old AscendaraDownloader.
"""
import atexit
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
import time
from argparse import ArgumentParser
from tempfile import NamedTemporaryFile
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from AscendaraTransfer import Transfer, validate_download_url, connection_count, resolve_share_url
from AscendaraGofile import GofileClient, content_id as gofile_content_id
from AscendaraRarRecovery import _extended_path, _check_path, _member_path
from AscendaraExtraction import (
    IncompleteArchiveOutput, ExtractionRecoveryCancelled, detect_file_type,
    verify_manifest, supervise_extraction, _wanted, inplace_consumed, inplace_paths,
    inplace_retained, trust_inplace_output,
)

DOWNLOADER_VERSION = '4.0.1'
DOWNLOADER_VERSION_URL = 'https://api.ascendara.app/downloader-version'
DOWNLOADER_DOWNLOAD_URL = 'https://cdn.ascendara.app/files/AscendaraDownloader.exe'

_caffeinate_proc = None


def _version_parts(value):
    """Return a comparable numeric version tuple, or None for invalid input."""
    if not isinstance(value, str) or not re.fullmatch(r'v?\d+(?:\.\d+){0,3}', value.strip()):
        return None
    parts = tuple(int(part) for part in value.strip().lstrip('v').split('.'))
    return parts + (0,) * (4 - len(parts))


def _schedule_downloader_update():
    """Download and install a newer packaged downloader after this process exits."""
    if not getattr(sys, 'frozen', False) or sys.platform != 'win32':
        return False
    try:
        local_version = _version_parts(DOWNLOADER_VERSION)
        response = requests.get(DOWNLOADER_VERSION_URL, timeout=5)
        response.raise_for_status()
        payload = response.json()
        remote_version = _version_parts(payload.get('version') if isinstance(payload, dict) else None)
        if local_version is None or remote_version is None or remote_version <= local_version:
            return False

        executable = os.path.abspath(sys.executable)
        executable_dir = os.path.dirname(executable)
        with requests.get(DOWNLOADER_DOWNLOAD_URL, stream=True, timeout=(5, 60)) as download:
            download.raise_for_status()
            with NamedTemporaryFile('wb', delete=False, dir=executable_dir,
                                    prefix='AscendaraDownloader-', suffix='.new') as stream:
                replacement = stream.name
                for chunk in download.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        stream.write(chunk)
        # A PE header rejects error pages and other accidental CDN responses.
        with open(replacement, 'rb') as stream:
            if stream.read(2) != b'MZ':
                raise ValueError('Downloaded updater is not a Windows executable')

        script = NamedTemporaryFile('w', delete=False, dir=executable_dir,
                                    prefix='AscendaraDownloader-update-', suffix='.cmd', encoding='utf-8')
        with script:
            script.write('@echo off\r\n'
                         'set "target=%s"\r\n'
                         'set "replacement=%s"\r\n'
                         'set "pid=%s"\r\n'
                         ':wait\r\n'
                         'tasklist /fi "PID eq %%pid%%" /nh | find "%%pid%%" >nul\r\n'
                         'if not errorlevel 1 (\r\n'
                         '  timeout /t 1 /nobreak >nul\r\n'
                         '  goto wait\r\n'
                         ')\r\n'
                         'move /y "%%replacement%%" "%%target%%" >nul\r\n'
                         'del "%%~f0"\r\n' % (executable, replacement, os.getpid()))
        subprocess.Popen(['cmd.exe', '/d', '/c', script.name], close_fds=True,
                         creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        logging.info('Scheduled AscendaraDownloader update: %s -> %s', DOWNLOADER_VERSION, payload['version'])
        return True
    except Exception:
        replacement = locals().get('replacement')
        if replacement:
            try:
                os.remove(replacement)
            except OSError:
                pass
        logging.warning('Could not check for an AscendaraDownloader update', exc_info=True)
        return False

def replace_file(source, target, check_cancelled=lambda: None):
    """Atomic same-volume move with bounded retries for Windows file contention."""
    source, target = _extended_path(source), _extended_path(target)
    from AscendaraDownloadRecovery import wait_for_retry
    for attempt in range(9):
        check_cancelled()
        try:
            os.replace(source, target)
            return
        except OSError as exc:
            transient = isinstance(exc, (PermissionError, FileNotFoundError)) or getattr(exc, 'winerror', None) in (5, 32, 33)
            if not transient or attempt == 8:
                if isinstance(exc, FileNotFoundError) and not os.path.exists(source):
                    raise FileNotFoundError(f'Extracted or temporary file disappeared before it could be moved: {source}. '
                                            'Check security-software history '
                                            'and whether another process removed the file.') from exc
                raise
            if isinstance(exc, PermissionError) and os.path.isfile(target):
                try:
                    info = os.stat(target)
                    if not info.st_mode & stat.S_IWRITE:
                        os.chmod(target, info.st_mode | stat.S_IWRITE)
                except OSError:
                    pass  # A sharing lock can also prevent attribute access.
            def stopped():
                check_cancelled()
                return False
            wait_for_retry(min(.1 * 2 ** attempt, 1), stopped)

def install_staged_file(source, target, check_cancelled=lambda: None):
    """Install verified staging output even when a reader denies source renames.

    The caller journals the destination and owns staging cleanup. Leave the
    source in staging on the copy path so a delete lock cannot fail installation.
    Never use this fallback for rollback backups, which must actually move.
    """
    try:
        replace_file(source, target, check_cancelled)
        return
    except OSError as exc:
        if not (isinstance(exc, PermissionError) or getattr(exc, 'winerror', None) in (5, 32, 33)):
            raise
        logging.warning('Staged file rename blocked; trying atomic copy: %s -> %s', source, target)

    source, target = _extended_path(source), _extended_path(target)
    temporary = None
    try:
        check_cancelled()
        with open(source, 'rb') as incoming:
            expected = os.fstat(incoming.fileno()).st_size
            with NamedTemporaryFile('wb', delete=False, dir=os.path.dirname(target),
                                    prefix='.ascendara-install-') as output:
                temporary = output.name
                copied = 0
                while True:
                    check_cancelled()
                    chunk = incoming.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    copied += len(chunk)
                if copied != expected or os.fstat(incoming.fileno()).st_size != expected:
                    raise OSError(f'Staged file changed while being installed: {source}')
        # Preserve executable permissions on platforms that use them, without
        # copying Windows archive attributes or security descriptors.
        if os.name != 'nt':
            shutil.copymode(source, temporary)
        replace_file(temporary, target, check_cancelled)
    finally:
        if temporary is not None:
            cleanup_temporary(temporary, os.path.dirname(target))


def cleanup_temporary(path, root, empty_only=False):
    """Remove an owned temporary path, retrying Windows locks/read-only files."""
    path, root = os.path.abspath(path), os.path.abspath(root)
    if os.path.normcase(_extended_path(path)) == os.path.normcase(_extended_path(root)):
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
    filepath = _extended_path(filepath)
    def check_stopped():
        if reset_stop or not ('downloadingData' in data or 'game' in data):
            return
        try:
            with open(filepath, encoding='utf-8') as stream:
                if json.load(stream).get('downloadingData', {}).get('stopped'):
                    raise InterruptedError('Download stopped by user')
        except InterruptedError:
            raise
        except (OSError, json.JSONDecodeError):
            pass
    check_stopped()
    # Lets the app tell a live download from one whose process has exited.
    if isinstance(data.get('downloadingData'), dict):
        data['downloadingData']['ownerPid'] = os.getpid()
    temporary = None
    try:
        with NamedTemporaryFile('w', encoding='utf-8', delete=False,
                                dir=os.path.dirname(os.path.abspath(filepath)), suffix='.tmp') as stream:
            temporary = stream.name
            json.dump(data, stream, indent=4)
        replace_file(temporary, filepath, check_stopped)
    finally:
        if temporary and os.path.exists(temporary):
            try:
                os.remove(temporary)
            except OSError:
                logging.warning('Could not remove temporary JSON file: %s', temporary)


def create_robust_session():
    session = requests.Session()
    # Transfer owns retries; do not multiply adapter retries by transfer retries.
    session.headers.update({'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity'})
    session.mount('https://', HTTPAdapter(max_retries=0))
    session.mount('http://', HTTPAdapter(max_retries=0))
    return session


class ProgressWriter:
    """Coalesce UI updates and tolerate temporary metadata access contention.

    Lifecycle writes still use safe_write_json directly: completion must never
    be reported unless it was persisted. Cancellation and other disk failures
    must also propagate, even for these optional progress snapshots.
    """
    def __init__(self):
        self.next_write = 0
        self.blocked_since = None

    def write(self, filepath, data):
        now = time.monotonic()
        if now < self.next_write:
            return
        try:
            safe_write_json(filepath, data)
        except OSError as exc:
            if not (isinstance(exc, PermissionError) or getattr(exc, 'winerror', None) in (5, 32, 33)):
                raise
            if self.blocked_since is None:
                self.blocked_since = now
                logging.warning('Progress metadata is temporarily locked: %s', filepath, exc_info=True)
            elif now - self.blocked_since >= 60:
                raise PermissionError(
                    f'Cannot update download progress for over a minute: {filepath}. '
                    'Check file permissions and other programs accessing this file.') from exc
            self.next_write = time.monotonic() + 2
        else:
            if self.blocked_since is not None:
                logging.info('Progress metadata writes recovered: %s', filepath)
            self.blocked_since = None
            self.next_write = time.monotonic() + .5


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
        self._progress_writer = ProgressWriter()
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
        self._progress_writer.write(self.game_info_path, self.game_info)

    def download(self):
        try:
            settings = load_settings()
            limit = max(0, int(settings.get('downloadLimit', 0))) * 1024
            self._progress(0, None, 0)
            safe_write_json(self.game_info_path, self.game_info)
            def retry(attempt):
                self.game_info['downloadingData']['retryAttempt'] = attempt
                self._progress_writer.write(self.game_info_path, self.game_info)
            with (nullcontext(self.session) if self.session is not None else create_robust_session()) as session:
                Transfer(self.url, self.dest_path, session, self._progress, self._check_for_stop,
                         limit, retry, self.expected_size, connection_count(settings)).run()
            self.game_info['downloadingData'].pop('retryAttempt', None)
            return True
        except InterruptedError:
            self.stopped = True
            return False
        except Exception as exc:
            self.last_error = str(exc)
            return False


def flatten_payload(root, manifest, game):
    """Remove archive wrappers, retaining game-relative asset directories."""
    root = _extended_path(root)
    normalize = lambda value: re.sub(r'[^a-z0-9]', '', value.lower())
    asset_folders = {'bin', 'bin32', 'bin64', 'binaries', 'data', 'engine',
                     'content', 'assets', 'plugins', 'redist', '_commonredist'}
    sidecar_extensions = {'.txt', '.nfo', '.pdf', '.html', '.htm', '.url',
                          '.jpg', '.jpeg', '.png', '.webp', '.ico'}
    while manifest:
        directories = {name.split('/')[0] for name in manifest if '/' in name}
        loose = [name for name in manifest if '/' not in name]
        # A launcher or other runtime file at this level means it is already
        # the game root. Moving its dependencies would break relative paths.
        if len(directories) != 1 or any(os.path.splitext(name)[1].lower()
                                       not in sidecar_extensions for name in loose):
            break
        wrapper = next(iter(directories))
        if wrapper.lower() in asset_folders or wrapper.lower().endswith('_data'):
            break
        prefix = wrapper + '/'
        wrapped = {name: info for name, info in manifest.items() if name.startswith(prefix)}
        match = normalize(wrapper) == normalize(game)
        archive_wrapper = (
            any(name.lower().endswith(('.zip', '.rar', '.7z')) for name in wrapped)
            and all(name.lower().endswith(('.zip', '.rar', '.7z'))
                    or re.search(r'\.[r-z]\d{2}$', name, re.I)
                    or os.path.splitext(name)[1].lower() in sidecar_extensions
                    for name in wrapped)
        )
        if not match and not archive_wrapper and not any(name.lower().endswith('.exe') for name in wrapped):
            break
        mapped = {name: manifest[name] for name in loose}
        for name, info in wrapped.items():
            destination = name[len(prefix):]
            _member_path(root, destination)
            # Check Windows case-insensitive file and directory collisions before
            # moving anything, including collisions with loose archive readmes.
            mapped[destination] = info
        folded = [name.casefold() for name in loose]
        folded.extend(name[len(prefix):].casefold() for name in wrapped)
        names = set(folded)
        if len(names) != len(folded) or any(
                '/'.join(name.split('/')[:index]) in names
                for name in names for index in range(1, len(name.split('/')))):
            if archive_wrapper:
                raise ValueError(f'Archive wrapper has conflicting files: {wrapper}; '
                                 'continuation archives cannot be flattened safely')
            # Flattening is optional for a game payload. Keep both copies in
            # their original locations; executable discovery searches recursively.
            logging.info('Keeping archive wrapper %s to preserve conflicting files', wrapper)
            break
        # Move the wrapper aside first to handle repeated, same-name wrappers.
        temporary = tempfile.mkdtemp(prefix='.flatten-', dir=os.path.dirname(root))
        os.rmdir(temporary)
        replace_file(_member_path(root, wrapper), temporary)
        for name in wrapped:
            relative = name[len(prefix):]
            destination = _member_path(root, relative)
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            install_staged_file(_member_path(temporary, relative), destination)
        cleanup_temporary(temporary, os.path.dirname(root))
        manifest = mapped
    return manifest


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
        crash_reporter_path = os.path.join(os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.abspath(os.path.join(os.path.dirname(__file__), '../../AscendaraCrashReporter/target/release')), binary_name)
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
        notification_helper_path = os.path.join(exe_dir, 'AscendaraNotificationHelper.exe' if sys.platform == 'win32' else 'AscendaraNotificationHelper')
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


def installed_size(folder: str) -> int:
    total = 0
    for root, _, files in os.walk(folder):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


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
    # disk_usage checks Windows API errors and reports space available to this user.
    # Let failures reach check_disk_space instead of treating them as a full disk.
    return shutil.disk_usage(path).free


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
        # Compare the same byte count that is reported in errors.
        
        if free_space < required_bytes:
            logging.error(
                f"Insufficient disk space for {operation}: "
                f"Required: {read_size(required_bytes)}, "
                f"Available: {read_size(free_space)}"
            )
            return False
        
        logging.info(
            f"Disk space check passed for {operation}: "
            f"Required: {read_size(required_bytes)}, "
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


def simplify_download_error(error: Any) -> str:
    """Replace noisy provider/TLS failures with an actionable message."""
    message = str(error)
    lowered = message.lower()
    network_markers = (
        'httpsconnectionpool', 'connection pool', 'sslerror', 'ssl:',
        'ssleoferror', 'decryption_failed_or_bad_record_mac',
        'connection reset', 'connection aborted', 'connection broken',
        'incomplete read', 'repeated connection failures',
        'max retries exceeded', 'eof occurred in violation of protocol',
    )
    if any(marker in lowered for marker in network_markers):
        return 'download_connection_error'
    return message


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
        safe_write_json(self.game_info_path, self.game_info)


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


    def _fix_file_extension(self, dest: str) -> str:
        """Fix file extension based on detected file type."""
        while True:
            try:
                filetype, hexsig = detect_file_type(dest, self._check_cancelled)
                break
            except InterruptedError:
                raise
            except OSError as exc:
                # This check runs before the extraction worker/recovery loop.
                # Give a temporarily unreadable source the same local retry UI.
                action = self._await_extraction_recovery({
                    'type': 'archiveExtractionFailed',
                    'archive': os.path.basename(dest),
                    'message': 'The downloaded file could not be read. Check that the drive is '
                               'available and the file is not blocked by another program, then retry extraction.',
                    'extractionError': str(exc),
                    'files': [],
                }, force=True)
                if action != 'retry':
                    raise ExtractionRecoveryCancelled(
                        'Extraction recovery cancelled; the downloaded source files were retained', exc) from exc
        logging.info(f"[AscendaraDownloader] Detected file type: {filetype}")
        # Hosts answer expired, blocked or rate-limited links with a web page.
        if filetype == 'unknown' and bytes.fromhex(hexsig).removeprefix(b'\xef\xbb\xbf').lstrip().startswith(b'<'):
            raise RuntimeError('The download host returned a web page instead of the game file. '
                               'The link may have expired or be rate limited; try again later or choose another download link.')
        
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
            replace_file(dest, new_dest, self._check_cancelled)
            return new_dest
        
        return dest


    def _pre_download_disk_check(self) -> bool:
        """Check space for the reported download size; extraction is checked separately.

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
            # Archive expansion is unknown until extraction. Do not block downloads
            # using a speculative multiplier (including a nonexistent update backup).
            total_needed = estimated_download_size

            if not check_disk_space(self.download_dir, total_needed, "download"):
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
                raise RuntimeError('Archive repair download failed; the original archive has been kept. '
                                   f'{downloader.last_error or "No transfer error details were provided"}')

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
                # Stages and retained in-place output are not part of the game.
                dirs[:] = [d for d in dirs if not d.startswith('.ascendara-')]
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
            if not isinstance(url, str) or not url.strip():
                validate_download_url(url)
            if provider not in ('auto', 'direct', 'gofile'):
                raise ValueError('Unknown download provider')
            normalized = url if '://' in url else 'https://' + url.lstrip('/')
            share_host = (urlparse(normalized).hostname or '').lower()
            if provider == 'gofile' or (provider == 'auto' and share_host in ('gofile.io', 'www.gofile.io')):
                self._download_gofile(normalized, password)
                if withNotification and 'downloadingData' not in self.game_info:
                    _launch_notification(withNotification, 'Download Complete', f'Successfully downloaded {self.game}')
                return
            url = resolve_share_url(validate_download_url(url))
            host = (urlparse(url).hostname or '').lower()
            if provider != 'direct' and any(host == domain or host.endswith('.' + domain) for domain in self.VALID_BUZZHEAVIER_DOMAINS):
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
                message = simplify_download_error(exc)
                if any(term in str(exc) for term in ('SSL: WRONG_VERSION_NUMBER', 'WinError 10054', 'forcibly closed')):
                    message = 'provider_blocked_error'
                handleerror(self.game_info, self.game_info_path, message)
                if withNotification:
                    _launch_notification(withNotification, 'Download Error', f'Error downloading {self.game}: {exc}')
        finally:
            allow_sleep()

    def _extract_files(self, archive_path=None, loose_files=None, cleanup_folder=None):
        if archive_path is not None:
            archives = list(archive_path) if isinstance(archive_path, (list, tuple)) else [archive_path]
            self.game_info['extractionSources'] = {
                'archives': [os.path.relpath(p, self.download_dir) for p in archives],
                'loose': [dict(filename=i['filename'], size=i['size'],
                               source=os.path.relpath(i['source'], self.download_dir))
                          for i in (loose_files or [])],
                'cleanup': os.path.relpath(cleanup_folder, self.download_dir) if cleanup_folder else None,
                'updating': self.updateFlow,
            }
            safe_write_json(self.game_info_path, self.game_info)
        # Restart the whole staging transaction: earlier archives and nested
        # wrappers may have contributed files to the same payload directory.
        for attempt in range(2):
            try:
                return self._extract_files_once(archive_path, loose_files, cleanup_folder)
            except IncompleteArchiveOutput as exc:
                # The worker already retried the affected members. Repeating the
                # entire game extraction cannot fix files being removed again.
                if exc.recovery_attempted or attempt == 1:
                    raise IncompleteArchiveOutput(
                        f'{exc}. Extracted files are still missing or incomplete after recovery. '
                        'Check security-software quarantine/history and whether another program '
                        'removed or blocked the listed files. The cause could not be confirmed. '
                        'The downloaded source files were retained.', exc.errors,
                        recovery_attempted=True) from exc
                if not getattr(self, '_recovery_prompted', False):
                    action = self._await_extraction_recovery({
                        'type': 'missingExtractedFiles',
                        'archive': 'staged payload',
                        'files': exc.errors,
                    })
                    if action != 'retry':
                        raise ExtractionRecoveryCancelled(
                            'Extraction recovery cancelled; the downloaded source files were retained', exc) from exc
                self._check_cancelled()
                logging.warning('Retrying extraction from retained archives in a fresh stage: %s', exc)
                data = self.game_info['downloadingData']
                data.update(downloading=False, extracting=True, verifying=False,
                            retryAttempt=1, timeUntilComplete='Retrying extraction...')
                data.pop('verifyError', None)
                self._extraction_progress({'name': 'Retrying extraction...', 'files': 0,
                                           'total': 0, 'percent': 0}, time.monotonic())
                safe_write_json(self.game_info_path, self.game_info)
                from AscendaraDownloadRecovery import wait_for_retry
                wait_for_retry(2, self._check_for_stop)

    def _await_extraction_recovery(self, details, force=False):
        if not force and getattr(self, '_recovery_prompted', False):
            return 'retry'
        self._recovery_prompted = True
        request_id = f'{os.getpid()}-{time.time_ns()}'
        data = self.game_info['downloadingData']
        data.update(downloading=False, extracting=False, verifying=False,
                    awaitingRecoveryAction=True, timeUntilComplete='Action required',
                    progressDownloadSpeeds='0.00 KB/s')
        for key in ('error', 'message', 'retryAttempt'):
            data.pop(key, None)
        data['recoverableError'] = dict(details, requestId=request_id)
        data.pop('recoveryAction', None)
        safe_write_json(self.game_info_path, self.game_info)
        while True:
            self._check_cancelled()
            try:
                with open(self.game_info_path, encoding='utf-8') as stream:
                    current = json.load(stream)
            except (OSError, ValueError):
                time.sleep(.2)
                continue
            current_data = current.get('downloadingData', {})
            action = current_data.get('recoveryAction')
            if (action in ('retry', 'cancel') and
                    current_data.get('recoverableError', {}).get('requestId') == request_id):
                self.game_info = current
                current_data.pop('recoveryAction', None)
                current_data.pop('recoverableError', None)
                current_data.update(awaitingRecoveryAction=False, extracting=action == 'retry',
                                    timeUntilComplete='Recovering extracted files...' if action == 'retry' else 'Cancelled')
                safe_write_json(self.game_info_path, self.game_info)
                return action
            time.sleep(.2)

    def _extract_archive_with_recovery(self, archive, payload, stage, started):
        """Keep the stage alive while the user retries only the failed archive."""
        repair_attempted = getattr(self, '_local_extraction_only', False)
        manual_retry = False
        while True:
            self._check_cancelled()
            try:
                try:
                    result = supervise_extraction(archive, payload, self._check_cancelled,
                        lambda state: self._extraction_progress(state, started),
                        self._await_extraction_recovery, stage,
                        # Private packages keep their archive after extraction.
                        inplace=not self.game_info.get('privateSource'))
                finally:
                    self._end_extraction_io()
                safe_write_json(self.game_info_path, self.game_info)
                trust_inplace_output(archive, payload, result)
                return result
            except (InterruptedError, ExtractionRecoveryCancelled):
                raise
            except Exception as exc:
                failure = exc
                # Preserve the existing one-shot repair, but a user's extraction
                # retry must never silently start another download.
                # A re-download would replace an archive HatchZip already
                # truncated; retrying resumes it from its journal instead.
                if (not manual_retry and not repair_attempted and not isinstance(exc, IncompleteArchiveOutput)
                        and not inplace_consumed(archive)):
                    repair_attempted = True
                    try:
                        self._repair_archive(exc, archive, 0)
                    except (InterruptedError, ExtractionRecoveryCancelled):
                        raise
                    except Exception as repair_error:
                        failure = repair_error
                    else:
                        continue
                logging.warning('Extraction needs user action for %s: %s', archive, failure)
                action = self._await_extraction_recovery({
                    'type': 'archiveExtractionFailed',
                    'archive': os.path.basename(archive),
                    'message': str(failure),
                    'extractionError': str(exc),
                    'files': getattr(exc, 'errors', []),
                }, force=True)
                if action != 'retry':
                    raise ExtractionRecoveryCancelled(
                        'Extraction recovery cancelled; the downloaded source files were retained',
                        f'{exc}; recovery failed: {failure}' if failure is not exc else exc) from failure
                manual_retry = True
                data = self.game_info['downloadingData']
                data.update(downloading=False, extracting=True, verifying=False,
                            progressCompleted='100.00', progressDownloadSpeeds='0.00 KB/s',
                            timeUntilComplete='Retrying extraction...')
                self._extraction_progress({'name': os.path.basename(archive), 'files': 0,
                                          'total': 0, 'percent': 0}, started)
                safe_write_json(self.game_info_path, self.game_info)

    def _extract_files_once(self, archive_path=None, loose_files=None, cleanup_folder=None):
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
        # A process killed mid-extraction leaves its stage behind. Reclaim that
        # space, but keep any stage holding rollback backups of replaced files.
        for name in os.listdir(self.download_dir):
            old_stage = os.path.join(self.download_dir, name)
            if not (name.startswith('.ascendara-stage-') and os.path.isdir(old_stage)):
                continue
            rollback = os.path.join(old_stage, 'rollback')
            if os.path.isdir(rollback) and set(os.listdir(rollback)) - {'paths.json'}:
                logging.warning('Keeping abandoned stage with rollback files: %s', old_stage)
                continue
            logging.info('Removing abandoned extraction stage %s', old_stage)
            cleanup_temporary(old_stage, self.download_dir)
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
                result = self._extract_archive_with_recovery(archive, payload, stage, started)
                manifest.update(result)
                processed.append(archive)
                from AscendaraDownloadRecovery import archive_sources
                if os.path.commonpath([payload, archive]) == payload:
                    family = archive_sources(archive, {os.path.join(payload, n): None for n in os.listdir(payload)})
                    for path in family:
                        os.remove(path)
                        manifest.pop(os.path.relpath(path, payload).replace('\\', '/'), None)
                    # In-place extraction already removed the archive itself.
                    manifest.pop(os.path.relpath(archive, payload).replace('\\', '/'), None)
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
                raise IncompleteArchiveOutput(f'Incomplete archive output: {errors[0]}', errors)
            self._check_cancelled()
            self._install_payload(payload, manifest, stage)
        finally:
            if not self._preserve_stage:
                cleanup_temporary(stage, self.download_dir)
        # Archives survive every failure above, including failed verification.
        if self.game_info.get('privateSource'):
            # Private packages never inherit automatic launch/post-download behavior.
            self.game_info['privateSource']['extracted'] = True
            self.game_info['executable'] = ''
            self.game_info['downloadingData'] = dict(
                downloading=False, pendingManualInstall=True, privatePackage=True,
                progressCompleted='100.00', manualInstallDir=self.download_dir,
                message='privateSources.status.archiveExtracted')
            self.game_info.pop('extractionSources', None)
            safe_write_json(self.game_info_path, self.game_info)
            return
        downloads = os.path.join(self.download_dir, '.ascendara-downloads')
        for archive in archives:
            # A downloaded non-archive file was copied into the install, so drop the source too.
            if (not archive.lower().endswith(('.zip', '.rar', '.7z'))
                    and os.path.commonpath([downloads, archive]) != downloads):
                continue
            if os.path.commonpath([self.download_dir, archive]) != self.download_dir:
                continue
            archive_dir = os.path.dirname(archive)
            family = archive_sources(archive, {os.path.join(archive_dir, n): None
                                               for n in os.listdir(archive_dir)})
            for path in [*family, *inplace_paths(archive)]:
                cleanup_temporary(path, self.download_dir)
        if cleanup_folder is not None:
            cleanup_temporary(cleanup_folder, self.download_dir)
        cleanup_temporary(os.path.join(self.download_dir, '.ascendara-downloads'),
                          self.download_dir, empty_only=True)
        # The catalog size is the compressed download; record what the verified
        # install really occupies, so the app's library check skips this game.
        try:
            measured = installed_size(self.download_dir)
            self.game_info['size'] = read_size(measured)
            self.game_info['sizeMeasured'] = True
            # Exact and untouched by play yet, so the app shares it with the catalog
            self.game_info['installedBytes'] = measured
            self.game_info.pop('sizeReported', None)
        except OSError as exc:
            logging.warning(f"[AscendaraDownloader] Could not measure installed size: {exc}")
        # Publish completion only after cleanup, before sleep/shutdown actions.
        del self.game_info['downloadingData']
        self.game_info.pop('extractionSources', None)
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
            items = [
                item for item in client.resolve(url, password)
                if item['filename'].lower().endswith(('.zip', '.rar', '.7z'))
                or re.search(r'\.[r-z]\d{2}$', item['filename'], re.I)
                or _wanted(item['filename'])
            ]
            if not items:
                raise RuntimeError('no_files_error: GOFile folder contains no downloadable files')
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
            settings = load_settings()
            limit = max(0, int(settings.get('downloadLimit', 0))) * 1024
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
                    reporter._progress_writer.write(self.game_info_path, self.game_info)
                if not cached:
                    Transfer(item['link'], item['source'], session, progress, self._check_for_stop,
                             limit, retry, item['size'], connection_count(settings)).run()
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
            speed = f'{read_size(byte_rate)}/s'
        name = state['name'].replace('\\', '/').rstrip('/').rsplit('/', 1)[-1]
        percent = state.get('percent', done / total * 100 if total else 0)
        self.game_info['downloadingData']['extractionProgress'] = {
            'currentFile': name, 'filesExtracted': done,
            'totalFiles': total, 'percentComplete': f'{min(100, percent):.2f}',
            'extractionSpeed': speed,
        }
        # Disk read/write rates in bytes per second, for the app's activity graph.
        io = state.get('io')
        io_samples = getattr(self, '_io_samples', None)
        if io_samples is None or (io and io_samples and (io[0] < io_samples[-1][1] or io[1] < io_samples[-1][2])):
            io_samples = self._io_samples = deque()  # A new worker restarts its counters.
        if io:
            io_samples.append((now, io[0], io[1]))
            while len(io_samples) > 2 and io_samples[1][0] <= now - 2:
                io_samples.popleft()
            span = max(.001, now - io_samples[0][0])
            self.game_info['downloadingData']['extractionProgress'].update(
                readSpeed=round((io[0] - io_samples[0][1]) / span) if len(io_samples) > 1 else 0,
                writeSpeed=round((io[1] - io_samples[0][2]) / span) if len(io_samples) > 1 else 0)
        if not hasattr(self, '_extraction_progress_writer'):
            self._extraction_progress_writer = ProgressWriter()
        self._extraction_progress_writer.write(self.game_info_path, self.game_info)
        if now - getattr(self, '_last_extraction_log', 0) >= 15:
            logging.info('Extraction [%s]: %s, %s/%s files, %.2f%%, %s',
                         state.get('engine', 'Preparing'), speed, done, total, percent, name)
            self._last_extraction_log = now

    def _end_extraction_io(self):
        """The worker is gone; its last disk rates must not linger on the graph."""
        self._io_samples = None
        progress = self.game_info.get('downloadingData', {}).get('extractionProgress')
        if progress and 'readSpeed' in progress:
            progress.update(readSpeed=0, writeSpeed=0)

    def _install_payload(self, payload, manifest, stage):
        """Journal overwritten files by rename and roll back a failed installation."""
        payload, stage = _extended_path(payload), _extended_path(stage)
        rollback = os.path.join(stage, 'rollback')
        os.mkdir(rollback)
        journal = []
        old_filemap = _extended_path(os.path.join(self.download_dir, 'filemap.ascendara.json'))
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
                target = _member_path(_extended_path(self.download_dir), name)
                source = _member_path(payload, name)
                backup = None
                os.makedirs(os.path.dirname(target), exist_ok=True)
                if os.path.exists(target):
                    if not os.path.isfile(target):
                        raise ValueError(f'Archive file conflicts with existing directory: {name}')
                    backup = os.path.join(rollback, str(len(journal)))
                    replace_file(target, backup, self._check_cancelled)
                journal.append((target, backup))
                install_staged_file(source, target, self._check_cancelled)
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
                        if not cleanup_temporary(target, self.download_dir):
                            raise OSError(f'Could not remove installed file during rollback: {target}')
                    if backup:
                        replace_file(backup, target)
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


def retry_local_extraction(metadata_path):
    """Restart staging from retained sources without entering any network path."""
    metadata_path = os.path.abspath(metadata_path)
    with open(metadata_path, encoding='utf-8') as stream:
        info = json.load(stream)
    worker = AscendaraDownloader.__new__(AscendaraDownloader)
    worker.game_info, worker.game_info_path = info, metadata_path
    worker.download_dir = os.path.dirname(metadata_path)
    worker.game = info['game']
    worker.withNotification = None
    worker._local_extraction_only = True
    plan = info.get('extractionSources')
    worker.updateFlow = bool((plan or {}).get('updating', info.get('downloadingData', {}).get('updating', False)))
    prevent_sleep()
    try:
        def source_path(name, archive=False):
            target = _member_path(worker.download_dir, name)
            _check_path(worker.download_dir, target)
            # An archive consumed by in-place extraction is retained as its output.
            if not os.path.isfile(target) and not (archive and inplace_retained(target)):
                raise FileNotFoundError(f'Retained source is missing: {name}')
            return target
        if plan:
            archives = [source_path(name, archive=True) for name in plan['archives']]
            loose = [dict(item, source=source_path(item['source'])) for item in plan.get('loose', [])]
        else:
            # Older downloads did not record a source manifest. Search only the
            # download cache and top-level archives, never installed subfolders.
            archives, loose = [], []
            roots = [worker.download_dir]
            cache = os.path.join(worker.download_dir, '.ascendara-downloads')
            if os.path.isdir(cache):
                roots.extend(root for root, dirs, files in os.walk(cache)
                             if '.ascendara-receipts' not in root.split(os.sep)
                             and not any(part.startswith('.ascendara-inplace-') for part in root.split(os.sep)))
            for root in roots:
                for name in os.listdir(root):
                    if name.lower().endswith(('.zip', '.rar', '.7z')):
                        archives.append(source_path(os.path.relpath(os.path.join(root, name), worker.download_dir)))
                receipts = os.path.join(root, '.ascendara-receipts')
                if os.path.isdir(receipts):
                    for name in os.listdir(receipts):
                        with open(os.path.join(receipts, name), encoding='utf-8') as stream:
                            item = json.load(stream)
                        filename = item['filename']
                        if not filename.lower().endswith(('.zip', '.rar', '.7z')) and not re.search(r'\.[r-z]\d{2}$', filename, re.I) and _wanted(filename):
                            loose.append(dict(filename=filename, size=item['size'], source=source_path(
                                os.path.relpath(os.path.join(root, filename), worker.download_dir))))
        if not archives and not loose:
            raise RuntimeError('No retained archives were found. Choose another download source.')
        info['downloadingData'] = dict(downloading=False, extracting=True, verifying=False,
                                      updating=worker.updateFlow, progressCompleted='100.00',
                                      progressDownloadSpeeds='0.00 KB/s', timeUntilComplete='Preparing extraction...')
        safe_write_json(metadata_path, info, reset_stop=True)
        worker._extract_files(archives, loose)
    except InterruptedError:
        logging.info('Local extraction stopped; source files retained')
    except VerificationFailure:
        logging.exception('Local extraction verification failed')
    except Exception as exc:
        logging.exception('Local extraction failed')
        handleerror(worker.game_info, metadata_path, str(exc))
    finally:
        allow_sleep()


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
    if len(sys.argv) == 3 and sys.argv[1] == '--retry-extraction':
        logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                            handlers=[logging.FileHandler(get_ascendara_log_path(), encoding='utf-8')])
        retry_local_extraction(sys.argv[2])
        return
    args = create_argument_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                        handlers=[logging.FileHandler(get_ascendara_log_path(), encoding='utf-8'),
                                  logging.StreamHandler(sys.stdout)])
    _schedule_downloader_update()
    try:
        downloader = AscendaraDownloader(args.game, args.online, args.dlc, args.isVr,
                                         args.updateFlow, args.version, args.size,
                                         args.download_dir, args.gameID)
        downloader.download(args.url, args.withNotification, args.provider, args.password)
    except InterruptedError:
        logging.info('Download paused during startup; retaining partial files')
    except Exception as exc:
        logging.exception('AscendaraDownloaderV4 fatal error')
        launch_crash_reporter(1, str(exc))
        raise


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()

