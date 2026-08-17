# ==============================================================================
# Ascendara Downloader
# ==============================================================================
# High-performance multi-threaded downloader for Ascendara.
# Handles game downloads, and extracting processes with support for
# resume and verification. Read more about the Download Manager Tool here:
# https://ascendara.app/docs/binary-tool/downloader










import os
import sys
import json
import time
import shutil
import string
import logging
import random
import re
import atexit
import subprocess
import zipfile
from tempfile import NamedTemporaryFile
from argparse import ArgumentParser
from typing import Optional, Dict, Any, Tuple
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# Sleep Prevention


_caffeinate_proc = None

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


# Logging Setup


def get_ascendara_log_path():
    if sys.platform == "win32":
        appdata = os.getenv("APPDATA")
    else:
        appdata = os.path.expanduser("~/.config")
    ascendara_dir = os.path.join(appdata, "Ascendara by tagoWorks")
    os.makedirs(ascendara_dir, exist_ok=True)
    return os.path.join(ascendara_dir, "downloadmanager.log")

LOG_PATH = get_ascendara_log_path()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logging.info(f"[AscendaraDownloaderV2] Logging to {LOG_PATH}")


# Crash Reporter


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


# Notification Helper


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


# Utility Functions


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

def safe_write_json(filepath: str, data: Dict[str, Any]):
    """Safely write JSON with atomic replace and retry logic."""
    temp_dir = os.path.dirname(filepath)
    temp_file_path = None
    retry_attempts = 5
    
    try:
        with NamedTemporaryFile('w', delete=False, dir=temp_dir, suffix='.tmp') as temp_file:
            json.dump(data, temp_file, indent=4)
            temp_file_path = temp_file.name
        
        for attempt in range(retry_attempts):
            try:
                os.replace(temp_file_path, filepath)
                return
            except PermissionError as e:
                wait_time = 0.5 * (2 ** attempt) + random.uniform(0, 0.2)
                time.sleep(wait_time)
                if attempt == retry_attempts - 1:
                    logging.error(f"safe_write_json: Could not write to {filepath}: {e}")
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

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
    game_info['version'] = ""
    game_info['executable'] = ""
    if 'downloadingData' in game_info:
        game_info['downloadingData'] = {
            "error": True,
            "message": str(error)
        }
    else:
        logging.error(f"[handleerror] downloadingData missing. Exception: {error}")
    safe_write_json(game_info_path, game_info)


# Robust HTTP Session with Connection Pooling


def create_robust_session() -> requests.Session:
    """Create a requests session with retry logic and connection pooling."""
    session = requests.Session()
    
    # Configure retry strategy
    retry_strategy = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS"]
    )
    
    # Mount adapters with connection pooling
    adapter = HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=10,
        pool_maxsize=10
    )
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    # Set default headers
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
    })
    
    return session


# Chunked Downloader Core


class ChunkedDownloader:
    """
    Robust chunked downloader that handles large files with proper resume support.
    Uses smaller chunk sizes and validates each chunk before proceeding.
    """
    
    STREAM_CHUNK_SIZE = 1024 * 1024  # 1MB read chunks for streaming
    PROGRESS_UPDATE_INTERVAL = 0.5  # Update progress every 0.5 seconds
    MAX_RETRIES = 10  # Max retries for the entire download
    RETRY_DELAY_BASE = 2
    RETRY_DELAY_MAX = 60
    
    def __init__(self, url: str, dest_path: str, game_info: Dict, game_info_path: str):
        self.url = url
        self.dest_path = dest_path
        self.game_info = game_info
        self.game_info_path = game_info_path
        self.session = create_robust_session()
        self.total_size: Optional[int] = None
        self.supports_range = False
        self.downloaded_bytes = 0
        self.session_downloaded_bytes = 0  # Track bytes downloaded in current session only
        self.start_time = time.time()
        self.last_progress_update = 0
        # Load speed limit from settings (KB/s -> bytes/s, 0 = unlimited)
        settings = load_settings()
        self._speed_limit_bytes = int(settings.get('downloadLimit', 0)) * 1024
        logging.info(f"[ChunkedDownloader] Speed limit: {self._speed_limit_bytes // 1024} KB/s" if self._speed_limit_bytes > 0 else "[ChunkedDownloader] Speed limit: unlimited")
        
    def _probe_server(self) -> bool:
        """Probe server for file size and range support."""
        try:
            # Try HEAD request first
            response = self.session.head(self.url, allow_redirects=True, timeout=30)
            
            # Check Accept-Ranges header
            self.supports_range = response.headers.get('Accept-Ranges', '').lower() == 'bytes'
            
            if 'Content-Length' in response.headers:
                self.total_size = int(response.headers['Content-Length'])
            
            # If HEAD didn't give us size or returned 405, try GET with Range header
            if response.status_code == 405 or self.total_size is None:
                try:
                    range_response = self.session.get(
                        self.url, 
                        stream=True, 
                        headers={"Range": "bytes=0-0"}, 
                        timeout=30
                    )
                    
                    if 'Content-Range' in range_response.headers:
                        # Parse total size from Content-Range: bytes 0-0/total
                        content_range = range_response.headers['Content-Range']
                        if '/' in content_range:
                            total_str = content_range.split('/')[-1]
                            if total_str != '*':
                                self.total_size = int(total_str)
                                self.supports_range = True
                    elif 'Content-Length' in range_response.headers and self.total_size is None:
                        if range_response.status_code == 200:
                            self.total_size = int(range_response.headers['Content-Length'])
                    
                    range_response.close()
                except Exception as e:
                    logging.warning(f"[ChunkedDownloader] Range probe failed: {e}")
            
            # Last resort: start a streaming GET and check content-length
            if self.total_size is None:
                try:
                    stream_response = self.session.get(self.url, stream=True, timeout=30)
                    if 'Content-Length' in stream_response.headers:
                        self.total_size = int(stream_response.headers['Content-Length'])
                    stream_response.close()
                except Exception as e:
                    logging.warning(f"[ChunkedDownloader] Stream probe failed: {e}")
            
            logging.info(f"[ChunkedDownloader] Server probe: size={read_size(self.total_size) if self.total_size else 'unknown'}, range_support={self.supports_range}")
            return True
            
        except Exception as e:
            logging.warning(f"[ChunkedDownloader] Server probe failed: {e}")
            return False
    
    def _get_existing_size(self) -> int:
        """Get size of existing partial download."""
        if os.path.exists(self.dest_path):
            return os.path.getsize(self.dest_path)
        return 0
    
    def _check_for_stop(self) -> bool:
        """Check if download has been stopped by reading the JSON file."""
        try:
            if os.path.exists(self.game_info_path):
                with open(self.game_info_path, 'r') as f:
                    current_game_info = json.load(f)
                    return current_game_info.get('downloadingData', {}).get('stopped', False)
        except Exception as e:
            logging.warning(f"[ChunkedDownloader] Error checking stop state: {e}")
        return False

    def _update_progress(self, force: bool = False):
        """Update progress in game info file."""
        # Check if download has been stopped
        if self._check_for_stop():
            logging.info("[ChunkedDownloader] Download stopped by user")
            raise InterruptedError("Download stopped by user")
        
        now = time.time()
        if not force and (now - self.last_progress_update) < self.PROGRESS_UPDATE_INTERVAL:
            return
        
        self.last_progress_update = now
        elapsed = now - self.start_time
        
        if elapsed > 0:
            speed = self.session_downloaded_bytes / elapsed
        else:
            speed = 0
        
        if self.total_size and self.total_size > 0:
            progress = (self.downloaded_bytes / self.total_size) * 100
            remaining = self.total_size - self.downloaded_bytes
            eta = remaining / speed if speed > 0 else 0
        else:
            # Unknown total size - show downloaded amount instead of percentage
            progress = 0  # Will show as "downloading..." in UI
            eta = 0
        
        # Format speed
        if speed >= 1024**2:
            speed_str = f"{speed/1024**2:.2f} MB/s"
        elif speed >= 1024:
            speed_str = f"{speed/1024:.2f} KB/s"
        else:
            speed_str = f"{speed:.2f} B/s"
        
        # Format ETA
        if self.total_size is None or self.total_size == 0:
            eta_str = f"Downloaded: {read_size(self.downloaded_bytes)}"
        else:
            eta_int = int(eta)
            if eta_int < 60:
                eta_str = f"{eta_int}s"
            elif eta_int < 3600:
                eta_str = f"{eta_int // 60}m {eta_int % 60}s"
            else:
                eta_str = f"{eta_int // 3600}h {(eta_int % 3600) // 60}m"
        
        self.game_info["downloadingData"]["progressCompleted"] = f"{progress:.2f}"
        self.game_info["downloadingData"]["progressDownloadSpeeds"] = speed_str
        self.game_info["downloadingData"]["timeUntilComplete"] = eta_str
        self.game_info["downloadingData"]["downloading"] = True
        safe_write_json(self.game_info_path, self.game_info)
    
    def _stream_download(self, start_byte: int, file_handle):
        """
        Stream download from start_byte, writing directly to file.
        Returns True if completed successfully, False if interrupted, or "restart"
        if the local partial file must be discarded.
        """
        headers = {}
        is_resume = start_byte > 0 and self.supports_range
        if is_resume:
            headers['Range'] = f'bytes={start_byte}-'

        try:
            response = self.session.get(
                self.url,
                headers=headers,
                stream=True,
                timeout=(30, 300)  # 30s connect, 5min read timeout
            )

            if response.status_code == 416:
                # Existing partial is invalid/too large/stale. Do not mark complete.
                logging.warning(
                    f"[ChunkedDownloader] Range not satisfiable at {read_size(start_byte)}; restarting download"
                )
                response.close()
                return "restart"

            if is_resume and response.status_code != 206:
                # Critical corruption fix: if the host ignores Range and sends the
                # entire file with 200 OK, appending it would corrupt the archive.
                logging.warning(
                    f"[ChunkedDownloader] Server ignored Range request. Expected 206, "
                    f"got {response.status_code}; restarting instead of appending."
                )
                response.close()
                return "restart"

            response.raise_for_status()

            # Prefer Content-Range for resumed responses. For fresh downloads, use Content-Length.
            if 'Content-Range' in response.headers:
                content_range = response.headers['Content-Range']
                if '/' in content_range:
                    total_str = content_range.split('/')[-1]
                    if total_str != '*':
                        self.total_size = int(total_str)
                        logging.info(f"[ChunkedDownloader] Got total size from Content-Range: {read_size(self.total_size)}")
            elif not is_resume and 'Content-Length' in response.headers:
                self.total_size = int(response.headers['Content-Length'])
                logging.info(f"[ChunkedDownloader] Got total size from Content-Length: {read_size(self.total_size)}")
            elif self.total_size is None and 'Content-Length' in response.headers:
                content_length = int(response.headers['Content-Length'])
                self.total_size = start_byte + content_length
                logging.info(f"[ChunkedDownloader] Calculated total size: {read_size(self.total_size)}")

            chunk_size = 4096 if self._speed_limit_bytes > 0 else self.STREAM_CHUNK_SIZE
            throttle_start = time.time()
            throttle_bytes = 0

            for data in response.iter_content(chunk_size=chunk_size):
                if data:
                    file_handle.write(data)
                    self.downloaded_bytes += len(data)
                    self.session_downloaded_bytes += len(data)
                    throttle_bytes += len(data)
                    self._update_progress()

                    if self._speed_limit_bytes > 0:
                        elapsed = time.time() - throttle_start
                        if elapsed > 0:
                            allowed_bytes = self._speed_limit_bytes * elapsed
                            if throttle_bytes > allowed_bytes:
                                sleep_time = (throttle_bytes - allowed_bytes) / self._speed_limit_bytes
                                if sleep_time > 0:
                                    time.sleep(sleep_time)

            file_handle.flush()
            try:
                os.fsync(file_handle.fileno())
            except Exception:
                pass
            return True

        except Exception as e:
            logging.warning(f"[ChunkedDownloader] Stream interrupted at {read_size(self.downloaded_bytes)}: {e}")
            return False

    def download(self) -> bool:
        """
        Download the file with streaming and automatic resume on failure.
        Returns True if successful, False otherwise.
        """
        try:
            self._probe_server()
            existing_size = self._get_existing_size()

            if self.total_size and existing_size == self.total_size:
                logging.info(f"[ChunkedDownloader] File already complete: {read_size(existing_size)}")
                self.downloaded_bytes = existing_size
                return True

            if self.total_size and existing_size > self.total_size:
                logging.warning(
                    f"[ChunkedDownloader] Existing file is larger than expected "
                    f"({read_size(existing_size)} > {read_size(self.total_size)}); deleting corrupt partial"
                )
                try:
                    os.remove(self.dest_path)
                except FileNotFoundError:
                    pass
                existing_size = 0

            if existing_size > 0 and self.supports_range:
                logging.info(f"[ChunkedDownloader] Resuming from {read_size(existing_size)}")
                self.downloaded_bytes = existing_size
            else:
                if existing_size > 0 and not self.supports_range:
                    logging.warning("[ChunkedDownloader] Server doesn't support range requests, starting fresh")
                    os.remove(self.dest_path)
                self.downloaded_bytes = 0

            self.start_time = time.time()
            retry_count = 0
            retry_delay = self.RETRY_DELAY_BASE

            while retry_count < self.MAX_RETRIES:
                mode = 'ab' if self.downloaded_bytes > 0 else 'wb'

                with open(self.dest_path, mode) as f:
                    stream_result = self._stream_download(self.downloaded_bytes, f)

                if stream_result == "restart":
                    try:
                        if os.path.exists(self.dest_path):
                            os.remove(self.dest_path)
                    except Exception as e:
                        logging.warning(f"[ChunkedDownloader] Could not delete invalid partial: {e}")
                    self.downloaded_bytes = 0
                    self.session_downloaded_bytes = 0
                    retry_count += 1
                    self.game_info["downloadingData"]["retryAttempt"] = retry_count
                    safe_write_json(self.game_info_path, self.game_info)
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 1.5, self.RETRY_DELAY_MAX)
                    self.session.close()
                    self.session = create_robust_session()
                    continue

                if stream_result is True:
                    final_size = os.path.getsize(self.dest_path)
                    logging.info(
                        f"[ChunkedDownloader] DEBUG: final_size={final_size}, total_size={self.total_size}, "
                        f"difference={abs(final_size - self.total_size) if self.total_size else 'N/A'}"
                    )

                    if self.total_size is None:
                        logging.warning("[ChunkedDownloader] Total size unknown; accepting completed stream")
                        return True

                    if final_size == self.total_size:
                        if 'retryAttempt' in self.game_info.get('downloadingData', {}):
                            del self.game_info['downloadingData']['retryAttempt']
                            safe_write_json(self.game_info_path, self.game_info)
                        self._update_progress(force=True)
                        logging.info(f"[ChunkedDownloader] Download complete: {read_size(final_size)}")
                        return True

                    if final_size > self.total_size:
                        logging.warning(
                            f"[ChunkedDownloader] Downloaded file larger than expected "
                            f"({read_size(final_size)} > {read_size(self.total_size)}); restarting"
                        )
                        try:
                            os.remove(self.dest_path)
                        except Exception as e:
                            logging.warning(f"[ChunkedDownloader] Could not delete oversized file: {e}")
                        self.downloaded_bytes = 0
                        retry_count += 1
                        continue

                    logging.info(
                        f"[ChunkedDownloader] Partial: {read_size(final_size)}/{read_size(self.total_size)}, continuing..."
                    )
                    self.downloaded_bytes = final_size
                    continue

                if not self.supports_range:
                    logging.error("[ChunkedDownloader] Download interrupted and server doesn't support resume")
                    return False

                retry_count += 1
                self.downloaded_bytes = os.path.getsize(self.dest_path) if os.path.exists(self.dest_path) else 0
                self.game_info["downloadingData"]["retryAttempt"] = retry_count
                safe_write_json(self.game_info_path, self.game_info)

                logging.info(f"[ChunkedDownloader] Retry {retry_count}/{self.MAX_RETRIES} in {retry_delay}s, resuming from {read_size(self.downloaded_bytes)}")
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, self.RETRY_DELAY_MAX)
                self.session.close()
                self.session = create_robust_session()

            logging.error(f"[ChunkedDownloader] Max retries ({self.MAX_RETRIES}) exceeded")
            return False

        except InterruptedError as e:
            logging.info(f"[ChunkedDownloader] Download interrupted: {e}")
            return False
        except Exception as e:
            logging.error(f"[ChunkedDownloader] Download failed: {e}")
            raise
        finally:
            self.session.close()


# Main Downloader Class


class AscendaraDownloader:
    """
    Main downloader class that orchestrates download, extraction, and verification.
    """
    
    VALID_BUZZHEAVIER_DOMAINS = [
        'buzzheavier.com',
        'bzzhr.co',
        'bzzhr.to',
        'ts.bzzhr.to',
        'fafda.to',
        'fuckingfast.net',
        'fuckingfast.co'
    ]
    
    def __init__(self, game: str, online: bool, dlc: bool, isVr: bool, 
                 updateFlow: bool, version: str, size: str, download_dir: str, gameID: str = ""):
        self.game = game
        self.online = online
        self.dlc = dlc
        self.isVr = isVr
        self.updateFlow = updateFlow
        self.version = version
        self.size = size
        self.gameID = gameID
        self.download_dir = os.path.join(download_dir, sanitize_folder_name(game))
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
        safe_write_json(self.game_info_path, self.game_info)
    
    def _get_filename_from_url(self, url: str) -> str:
        """Extract filename from URL or Content-Disposition header."""
        base_name = os.path.basename(url.split('?')[0])
        
        try:
            session = create_robust_session()
            head = session.head(url, allow_redirects=True, timeout=10)
            cd = head.headers.get('content-disposition')
            if cd and 'filename=' in cd:
                fname = re.findall('filename="?([^";]+)', cd)
                if fname:
                    base_name = fname[0]
            session.close()
        except Exception:
            pass
        
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
    
    def download(self, url: str, withNotification: Optional[str] = None):
        """Main download entry point."""
        self.withNotification = withNotification
        prevent_sleep()
        try:
            # Check for Buzzheavier URLs
            if any(domain in url for domain in self.VALID_BUZZHEAVIER_DOMAINS):
                self._download_buzzheavier(url)
                return
            
            # Check disk space before starting download
            # Estimate: download size + extraction (typically 2-3x compressed size)
            # Use size from game_info if available
            if not self._pre_download_disk_check():
                return
            
            # Update state
            self.game_info["downloadingData"]["downloading"] = True
            safe_write_json(self.game_info_path, self.game_info)
            
            # Get filename
            base_name = self._get_filename_from_url(url)
            dest = os.path.join(self.download_dir, base_name)
            
            logging.info(f"[AscendaraDownloader] Starting download: {url}")
            logging.info(f"[AscendaraDownloader] Destination: {dest}")
            
            # Notification: Download Started
            if withNotification:
                _launch_notification(withNotification, "Download Started", f"Starting download for {self.game}")
            
            # Create chunked downloader and start download
            downloader = ChunkedDownloader(url, dest, self.game_info, self.game_info_path)
            success = downloader.download()
            
            if success:
                logging.info(f"[AscendaraDownloader] Download completed successfully")
                
                # Update state
                self.game_info["downloadingData"]["downloading"] = False
                self.game_info["downloadingData"]["progressCompleted"] = "100.00"
                self.game_info["downloadingData"]["progressDownloadSpeeds"] = "0.00 KB/s"
                self.game_info["downloadingData"]["timeUntilComplete"] = "0s"
                safe_write_json(self.game_info_path, self.game_info)
                
                # Detect and fix file extension
                dest = self._fix_file_extension(dest)
                
                # Extract files
                self._extract_files(dest)
                
                if withNotification:
                    _launch_notification(withNotification, "Download Complete", f"Successfully downloaded {self.game}")
            else:
                raise Exception("Download failed after all retries")
                
        except Exception as e:
            err_str = str(e)
            if any(x in err_str for x in ['SSL: WRONG_VERSION_NUMBER', 'ssl.SSLError', 'WinError 10054', 
                                           'forcibly closed', 'ConnectionResetError']):
                logging.error(f"[AscendaraDownloader] Provider blocked error: {e}")
                handleerror(self.game_info, self.game_info_path, 'provider_blocked_error')
            else:
                logging.error(f"[AscendaraDownloader] Download error: {e}")
                handleerror(self.game_info, self.game_info_path, e)
            
            if withNotification:
                _launch_notification(withNotification, "Download Error", f"Error downloading {self.game}: {e}")
        finally:
            allow_sleep()
    
    def _create_update_backup(self) -> Optional[str]:
        """Create a backup of existing game files before updating.
        Returns the backup directory path if successful, None otherwise.
        """
        if not self.updateFlow:
            return None
        
        backup_dir = os.path.join(self.download_dir, ".ascendara_backup")
        
        try:
            # Calculate size of existing game files
            existing_size = get_directory_size(self.download_dir)
            logging.info(f"[AscendaraDownloader] Existing game size: {read_size(existing_size)}")
            
            # Check if we have enough space for backup (need space for copy)
            if not check_disk_space(self.download_dir, existing_size, "backup creation"):
                logging.error(f"[AscendaraDownloader] Insufficient disk space to create backup")
                if self.withNotification:
                    _launch_notification(
                        self.withNotification,
                        "Update Failed",
                        "Insufficient disk space to create backup"
                    )
                return None
            
            # Remove old backup if it exists
            if os.path.exists(backup_dir):
                logging.info(f"[AscendaraDownloader] Removing old backup: {backup_dir}")
                shutil.rmtree(backup_dir, ignore_errors=True)
            
            # Create new backup directory
            os.makedirs(backup_dir, exist_ok=True)
            logging.info(f"[AscendaraDownloader] Creating backup for update: {backup_dir}")
            
            # Backup all files except archives, temp files, and the JSON file
            backup_count = 0
            skip_extensions = {'.rar', '.zip', '.7z', '.tmp', '.part', '.download'}
            skip_names = {'.ascendara_backup', 'filemap.ascendara.json'}
            
            for item in os.listdir(self.download_dir):
                item_path = os.path.join(self.download_dir, item)
                
                # Skip backup directory itself and JSON file
                if item in skip_names or item.endswith('.ascendara.json'):
                    continue
                
                # Skip archive files and temp files
                if os.path.isfile(item_path):
                    ext = os.path.splitext(item)[1].lower()
                    if ext in skip_extensions:
                        continue
                
                # Backup the item
                backup_item_path = os.path.join(backup_dir, item)
                try:
                    if os.path.isdir(item_path):
                        shutil.copytree(item_path, backup_item_path, dirs_exist_ok=True)
                        logging.info(f"[AscendaraDownloader] Backed up directory: {item}")
                    else:
                        shutil.copy2(item_path, backup_item_path)
                        logging.info(f"[AscendaraDownloader] Backed up file: {item}")
                    backup_count += 1
                except Exception as e:
                    logging.warning(f"[AscendaraDownloader] Could not backup {item}: {e}")
            
            logging.info(f"[AscendaraDownloader] Backup complete: {backup_count} items backed up")
            return backup_dir
            
        except Exception as e:
            logging.error(f"[AscendaraDownloader] Failed to create backup: {e}")
            return None
    
    def _restore_from_backup(self, backup_dir: str) -> bool:
        """Restore game files from backup.
        Returns True if successful, False otherwise.
        """
        if not backup_dir or not os.path.exists(backup_dir):
            logging.error(f"[AscendaraDownloader] Backup directory not found: {backup_dir}")
            return False
        
        try:
            logging.info(f"[AscendaraDownloader] Restoring from backup: {backup_dir}")
            
            # Remove failed update files (except JSON and backup)
            for item in os.listdir(self.download_dir):
                if item == '.ascendara_backup' or item.endswith('.ascendara.json'):
                    continue
                
                item_path = os.path.join(self.download_dir, item)
                try:
                    if os.path.isdir(item_path):
                        shutil.rmtree(item_path, ignore_errors=True)
                    else:
                        os.remove(item_path)
                except Exception as e:
                    logging.warning(f"[AscendaraDownloader] Could not remove {item}: {e}")
            
            # Restore backed up files
            restore_count = 0
            for item in os.listdir(backup_dir):
                backup_item_path = os.path.join(backup_dir, item)
                restore_item_path = os.path.join(self.download_dir, item)
                
                try:
                    if os.path.isdir(backup_item_path):
                        shutil.copytree(backup_item_path, restore_item_path, dirs_exist_ok=True)
                    else:
                        shutil.copy2(backup_item_path, restore_item_path)
                    restore_count += 1
                except Exception as e:
                    logging.error(f"[AscendaraDownloader] Could not restore {item}: {e}")
                    return False
            
            logging.info(f"[AscendaraDownloader] Restore complete: {restore_count} items restored")
            return True
            
        except Exception as e:
            logging.error(f"[AscendaraDownloader] Failed to restore from backup: {e}")
            return False
    
    def _cleanup_backup(self, backup_dir: str):
        """Remove backup directory after successful update."""
        if backup_dir and os.path.exists(backup_dir):
            try:
                shutil.rmtree(backup_dir, ignore_errors=True)
                logging.info(f"[AscendaraDownloader] Cleaned up backup: {backup_dir}")
            except Exception as e:
                logging.warning(f"[AscendaraDownloader] Could not cleanup backup: {e}")
    
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
            os.rename(dest, new_dest)
            
            if os.path.exists(dest) and dest != new_dest:
                try:
                    os.remove(dest)
                except Exception:
                    pass
            
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
                'Accept-Encoding': 'gzip, deflate, br',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
            }
            response = session.get(url, headers=page_headers)
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
            head_response = session.head(download_url_with_token, headers=hx_headers, allow_redirects=False)
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
        # Use the robust ChunkedDownloader for the actual file download
        dest_path = os.path.join(self.download_dir, filename)
        
        # Update state
        self.game_info["downloadingData"]["downloading"] = True
        safe_write_json(self.game_info_path, self.game_info)
        
        # Create chunked downloader and start download
        downloader = ChunkedDownloader(final_url, dest_path, self.game_info, self.game_info_path)
        success = downloader.download()
        
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
            
            # Extract files
            self._extract_files(dest_path)
            
            if self.withNotification:
                _launch_notification(self.withNotification, "Download Complete", f"Successfully downloaded {self.game}")
        else:
            raise Exception("Buzzheavier download failed after all retries")
    
    def _check_for_stop(self) -> bool:
        """Check if download has been stopped by reading the JSON file."""
        try:
            if os.path.exists(self.game_info_path):
                with open(self.game_info_path, 'r') as f:
                    current_game_info = json.load(f)
                    return current_game_info.get('downloadingData', {}).get('stopped', False)
        except Exception as e:
            logging.warning(f"[AscendaraDownloader] Error checking stop state: {e}")
        return False

    def _extract_files(self, archive_path: Optional[str] = None):
        """Extract archive files and flatten nested directories."""
        # Check if download has been stopped before starting extraction
        if self._check_for_stop():
            logging.info("[AscendaraDownloader] Extraction stopped by user")
            return
        
        # Create backup before extraction if this is an update
        backup_dir = self._create_update_backup()
        
        self.game_info["downloadingData"]["extracting"] = True
        # Initialize extraction progress tracking
        self.game_info["downloadingData"]["extractionProgress"] = {
            "currentFile": "",
            "filesExtracted": 0,
            "totalFiles": 0,
            "percentComplete": "0.00",
            "extractionSpeed": "0 files/s"
        }
        safe_write_json(self.game_info_path, self.game_info)
        
        # Track extraction timing
        self._extraction_start_time = time.time()
        self._files_extracted_count = 0
        self._last_progress_update = 0  # Track last JSON write time
        self._speed_window_time = self._extraction_start_time
        self._speed_window_count = 0
        
        watching_path = os.path.join(self.download_dir, "filemap.ascendara.json")
        watching_data = {}
        archive_exts = {'.rar', '.zip'}
        
        # Determine archives to process
        if archive_path and os.path.exists(archive_path):
            archives_to_process = [archive_path]
            logging.info(f"[AscendaraDownloader] Extracting: {archive_path}")
        else:
            logging.info(f"[AscendaraDownloader] Scanning for archives in: {self.download_dir}")
            archives_to_process = []
            for root, _, files in os.walk(self.download_dir):
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in archive_exts:
                        archives_to_process.append(os.path.join(root, file))
        
        # Count total files for progress tracking, and tally the uncompressed size
        # so we can verify there is enough free disk space before extracting.
        total_files_to_extract = 0
        total_uncompressed_size = 0
        for arch_path in archives_to_process:
            try:
                ext = os.path.splitext(arch_path)[1].lower()
                if ext == '.zip':
                    with zipfile.ZipFile(arch_path, 'r') as zip_ref:
                        for zip_info in zip_ref.infolist():
                            if not zip_info.is_dir():
                                total_uncompressed_size += zip_info.file_size
                            if not zip_info.filename.endswith('.url') and '_CommonRedist' not in zip_info.filename and not zip_info.is_dir():
                                total_files_to_extract += 1
                elif ext == '.rar':
                    # On Windows, use Python unrar library; on Linux/macOS, use system binary
                    if sys.platform == "win32":
                        try:
                            from unrar import rarfile
                            with rarfile.RarFile(arch_path, 'r') as rar_ref:
                                for info in rar_ref.infolist():
                                    # Check if it's a file (not directory) - directories end with /
                                    if not info.filename.endswith('/'):
                                        total_uncompressed_size += getattr(info, 'file_size', 0) or 0
                                    if not info.filename.endswith('.url') and '_CommonRedist' not in info.filename and not info.filename.endswith('/'):
                                        total_files_to_extract += 1
                        except Exception as e:
                            logging.warning(f"[AscendaraDownloader] Could not count RAR files with library: {e}")
                    else:
                        import shutil as _shutil
                        _unrar = _shutil.which('unrar') or _shutil.which('unrar-free')
                        if _unrar:
                            _result = subprocess.run([_unrar, 'l', arch_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                            for _line in _result.stdout.decode(errors='replace').splitlines():
                                _parts = _line.split()
                                if len(_parts) >= 5 and _parts[0] not in ('-', 'Name', '---'):
                                    _fname = _parts[-1]
                                    if not _fname.endswith('.url') and '_CommonRedist' not in _fname and not _fname.endswith('/'):
                                        total_files_to_extract += 1
            except Exception as e:
                logging.warning(f"[AscendaraDownloader] Could not count files in {arch_path}: {e}")
        
        logging.info(f"[AscendaraDownloader] Total files to extract: {total_files_to_extract}")

        # Verify there is enough free disk space for the actual extracted content.
        # Fall back to a conservative multiple of the archive size on disk if the
        # uncompressed size could not be determined (e.g. multi-volume RAR listing failed).
        if total_uncompressed_size <= 0:
            archive_sizes_on_disk = sum(
                os.path.getsize(p) for p in archives_to_process if os.path.exists(p)
            )
            total_uncompressed_size = int(archive_sizes_on_disk * 2.5)

        if total_uncompressed_size > 0 and not check_disk_space(
            self.download_dir, total_uncompressed_size, "extraction"
        ):
            error_msg = f"Insufficient disk space to extract. Need ~{read_size(total_uncompressed_size)}"
            logging.error(f"[AscendaraDownloader] {error_msg}")
            handleerror(self.game_info, self.game_info_path, error_msg)
            if self.withNotification:
                _launch_notification(self.withNotification, "Extraction Failed", error_msg)
            self.game_info["downloadingData"]["extracting"] = False
            safe_write_json(self.game_info_path, self.game_info)
            return
        self._total_files_to_extract = total_files_to_extract
        self._update_extraction_progress("Preparing...", 0, total_files_to_extract, force=True)
        
        processed_archives = set()
        any_extraction_succeeded = False
        extraction_errors = []
        
        while archives_to_process:
            # Check if download has been stopped
            if self._check_for_stop():
                logging.info("[AscendaraDownloader] Extraction stopped by user")
                return
            
            current_archive = archives_to_process.pop(0)
            
            if current_archive in processed_archives:
                continue
            
            processed_archives.add(current_archive)
            ext = os.path.splitext(current_archive)[1].lower()
            logging.info(f"[AscendaraDownloader] Extracting: {current_archive}")
            
            # Nested archives extract to their own parent dir to preserve
            # directory structure; top-level archives extract to download_dir
            _archive_parent = os.path.dirname(os.path.normpath(current_archive))
            if os.path.normpath(_archive_parent) == os.path.normpath(self.download_dir):
                _extract_to = self.download_dir
            else:
                _extract_to = _archive_parent
                os.makedirs(_extract_to, exist_ok=True)
            
            try:
                if ext == '.zip':
                    self._extract_zip(current_archive, watching_data, _extract_to)
                elif ext == '.rar':
                    self._extract_rar(current_archive, watching_data, _extract_to)
                
                any_extraction_succeeded = True
                
                # Delete archive after extraction
                try:
                    os.remove(current_archive)
                    logging.info(f"[AscendaraDownloader] Deleted archive: {current_archive}")
                except Exception as e:
                    logging.warning(f"[AscendaraDownloader] Could not delete archive: {e}")
                
            except Exception as e:
                logging.error(f"[AscendaraDownloader] Extraction failed: {e}")
                extraction_errors.append(str(e))
                continue
            
            self._flatten_directories()
            
            # Scan for new archives at the top level only - game asset zips are
            # nested deep inside subdirectories and must not be extracted/deleted.
            # Repack continuation archives (part2.zip, etc.) always land at root.
            for file in os.listdir(self.download_dir):
                ext = os.path.splitext(file)[1].lower()
                if ext in archive_exts:
                    new_archive = os.path.join(self.download_dir, file)
                    if new_archive not in processed_archives and new_archive not in archives_to_process:
                        # Non-first parts of multi-part RAR sets were already consumed
                        # by unrar when the first part was extracted. Delete them now
                        # instead of queuing a doomed extraction that leaves GBs on disk.
                        _mp = re.match(r'^.+\.part(\d+)\.rar$', file, re.IGNORECASE)
                        if _mp and int(_mp.group(1)) != 1:
                            logging.info(f"[AscendaraDownloader] Deleting non-first RAR part (content already extracted): {file}")
                            try:
                                os.remove(new_archive)
                            except Exception as _e:
                                logging.warning(f"[AscendaraDownloader] Could not delete non-first RAR part: {_e}")
                            continue
                        archives_to_process.append(new_archive)
                        logging.info(f"[AscendaraDownloader] Found nested archive: {new_archive}")
                        # Count files in nested archive and update total
                        try:
                            nested_file_count = 0
                            if ext == '.zip':
                                with zipfile.ZipFile(new_archive, 'r') as zip_ref:
                                    for zip_info in zip_ref.infolist():
                                        if not zip_info.filename.endswith('.url') and '_CommonRedist' not in zip_info.filename and not zip_info.is_dir():
                                            nested_file_count += 1
                            elif ext == '.rar':
                                import shutil as _shutil
                                _unrar = _shutil.which('unrar') or _shutil.which('unrar-free')
                                if _unrar:
                                    _result = subprocess.run([_unrar, 'l', new_archive], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                                    for _line in _result.stdout.decode(errors='replace').splitlines():
                                        _parts = _line.split()
                                        if len(_parts) >= 5 and _parts[0] not in ('-', 'Name', '---'):
                                            _fname = _parts[-1]
                                            if not _fname.endswith('.url') and '_CommonRedist' not in _fname and not _fname.endswith('/'):
                                                nested_file_count += 1
                            if nested_file_count > 0:
                                self._total_files_to_extract += nested_file_count
                                logging.info(f"[AscendaraDownloader] Added {nested_file_count} files from nested archive (new total: {self._total_files_to_extract})")
                        except Exception as e:
                            logging.warning(f"[AscendaraDownloader] Could not count files in nested archive {new_archive}: {e}")
        
        # If every archive failed to extract, raise so the caller can handle the error
        if not any_extraction_succeeded and extraction_errors:
            raise RuntimeError(f"Extraction failed: {extraction_errors[0]}")
        
        # Force final progress update before flattening
        self._update_extraction_progress("Finalizing...", self._files_extracted_count, self._total_files_to_extract, force=True)
        
        # Flatten nested directories
        self._flatten_directories()
        
        # Rebuild filemap
        watching_data = {}
        for dirpath, _, filenames in os.walk(self.download_dir):
            rel_dir = os.path.relpath(dirpath, self.download_dir)
            for fname in filenames:
                if fname.endswith('.url') or '_CommonRedist' in dirpath:
                    continue
                if os.path.splitext(fname)[1].lower() in archive_exts:
                    continue
                rel_path = os.path.normpath(os.path.join(rel_dir, fname)) if rel_dir != '.' else fname
                rel_path = rel_path.replace('\\', '/')
                watching_data[rel_path] = {"size": os.path.getsize(os.path.join(dirpath, fname))}
        
        safe_write_json(watching_path, watching_data)
        
        # Clean up .url files and _CommonRedist
        self._cleanup_junk_files()
        
        # Update state
        self.game_info["downloadingData"]["extracting"] = False
        self.game_info["downloadingData"]["verifying"] = True
        safe_write_json(self.game_info_path, self.game_info)
        
        if self.withNotification:
            _launch_notification(self.withNotification, "Extraction Complete", f"Extraction complete for {self.game}")
        
        # Verify
        self._verify_extracted_files(watching_path, backup_dir)
    
    def _update_extraction_progress(self, current_file: str, files_extracted: int, total_files: int, force: bool = False):
        """Update extraction progress in the game info JSON.
        
        Args:
            current_file: Name of the file being extracted
            files_extracted: Number of files extracted so far
            total_files: Total number of files to extract
            force: Force immediate JSON write (used for completion)
        """
        current_time = time.time()
        elapsed = current_time - self._extraction_start_time
        # Sliding-window speed: rate over the last 10 s instead of all-time average
        window_elapsed = current_time - self._speed_window_time
        window_files = files_extracted - self._speed_window_count
        if window_elapsed >= 10.0:
            speed = window_files / window_elapsed
            self._speed_window_time = current_time
            self._speed_window_count = files_extracted
        elif window_elapsed > 0:
            speed = window_files / window_elapsed
        else:
            speed = 0
        
        # Cap files_extracted to never exceed total_files
        files_extracted = min(files_extracted, total_files)
        percent = (files_extracted / total_files * 100) if total_files > 0 else 0
        # Ensure percent never exceeds 100
        percent = min(percent, 100.0)
        
        # Always update in-memory data
        self.game_info["downloadingData"]["extractionProgress"] = {
            "currentFile": current_file[:50] + "..." if len(current_file) > 50 else current_file,
            "filesExtracted": files_extracted,
            "totalFiles": total_files,
            "percentComplete": f"{percent:.2f}",
            "extractionSpeed": f"{speed:.1f} files/s" if speed >= 1 else f"{speed:.2f} files/s"
        }
        
        # Only write to disk every 1.5 seconds or when forced (completion/error)
        if force or (current_time - self._last_progress_update) >= 2:
            safe_write_json(self.game_info_path, self.game_info)
            self._last_progress_update = current_time

    def _extract_zip(self, archive_path: str, watching_data: Dict, extract_to: str = None):
        """Extract a ZIP file."""
        try:
            with zipfile.ZipFile(archive_path, 'r') as test_zip:
                test_zip.testzip()
            logging.info(f"[AscendaraDownloader] ZIP validation passed")
        except zipfile.BadZipFile as e:
            logging.error(f"[AscendaraDownloader] Invalid ZIP: {e}")
            raise
        
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            zip_contents = zip_ref.infolist()
            logging.info(f"[AscendaraDownloader] ZIP contains {len(zip_contents)} files")
            
            # Filter members to extract (exclude .url and _CommonRedist)
            members_to_extract = [
                zip_info for zip_info in zip_contents
                if not zip_info.filename.endswith('.url') and '_CommonRedist' not in zip_info.filename
            ]
            
            logging.info(f"[AscendaraDownloader] Extracting {len(members_to_extract)} files (filtered from {len(zip_contents)})")
            
            # Extract file-by-file instead of extractall().
            # Bulk extractall() is faster, but the UI sits on "Preparing..." until the archive is fully done.
            # File-by-file extraction restores live extraction progress for users.
            _et = extract_to or self.download_dir
            for zip_info in members_to_extract:
                if zip_info.is_dir():
                    continue

                try:
                    zip_ref.extract(zip_info, _et)
                except RuntimeError as e:
                    if 'password' in str(e).lower() or 'encrypted' in str(e).lower():
                        zip_ref.extract(zip_info, _et, pwd=b'steamrip.com')
                    else:
                        raise

                extracted_path = os.path.join(_et, zip_info.filename)
                key = os.path.relpath(extracted_path, self.download_dir).replace('\\', '/')
                watching_data[key] = {"size": zip_info.file_size}

                self._files_extracted_count += 1
                if self._files_extracted_count > self._total_files_to_extract:
                    logging.warning(f"[AscendaraDownloader] Extracted count ({self._files_extracted_count}) exceeds total ({self._total_files_to_extract}), capping")
                    self._files_extracted_count = self._total_files_to_extract

                # Only force the very first write so the UI leaves "Preparing..." right away;
                # after that, let the normal throttle (~2s) in _update_extraction_progress
                # handle disk writes. Forcing a JSON write (temp file + atomic replace) on
                # every single extracted file tanks extraction speed on archives with many
                # small files, since each write is its own disk I/O (and AV scan) operation.
                self._update_extraction_progress(
                    zip_info.filename,
                    self._files_extracted_count,
                    self._total_files_to_extract,
                    force=(self._files_extracted_count == 1),
                )
    
    def _extract_rar(self, archive_path: str, watching_data: Dict, extract_to: str = None):
        """Extract a RAR file using Python unrar library (Windows) or system unrar binary (Linux/macOS)."""
        import threading
        import shutil as _shutil

        # On Windows, use the Python unrar library with bundled DLL
        if sys.platform == "win32":
            try:
                from unrar import rarfile
            except ImportError:
                raise RuntimeError("UnRAR library not found. Please reinstall Ascendara.")

            # Always try the bundled Python unrar library first - it supports
            # password-protected and encrypted archives via setpassword().
            logging.info(f"[AscendaraDownloader] Extracting RAR with Python unrar library: {archive_path}")
            _lib_err_msg = None
            try:
                return self._extract_rar_with_library(archive_path, watching_data, extract_to)
            except Exception as _lib_err:
                _lib_err_msg = str(_lib_err)
                logging.warning(f"[AscendaraDownloader] Python library extraction failed ({_lib_err_msg}), falling back to CLI tools")

            # Use CLI extraction tools as fallback when Python library fails
            _CREATE_NO_WINDOW = 0x08000000
            # Look for UnRAR/7z: check bundled exe directory first, then system paths
            _exe_dir = os.path.dirname(sys.executable)
            _unrar_paths = [
                os.path.join(_exe_dir, 'UnRAR.exe'),
                _shutil.which('unrar'), _shutil.which('WinRAR'),
            ]
            try:
                import winreg as _winreg
                for _hive in (_winreg.HKEY_LOCAL_MACHINE, _winreg.HKEY_CURRENT_USER):
                    for _rk in (r'SOFTWARE\WinRAR', r'SOFTWARE\WOW6432Node\WinRAR'):
                        try:
                            with _winreg.OpenKey(_hive, _rk) as _k:
                                for _v in ('exe64', 'exe32'):
                                    try:
                                        _exe = _winreg.QueryValueEx(_k, _v)[0]
                                        _dir = os.path.dirname(_exe)
                                        _unrar_paths.append(os.path.join(_dir, 'UnRAR.exe'))
                                        _unrar_paths.append(_exe)
                                    except Exception:
                                        pass
                        except Exception:
                            pass
            except ImportError:
                pass
            _unrar_paths += [
                r'C:\Program Files\WinRAR\UnRAR.exe',
                r'C:\Program Files (x86)\WinRAR\UnRAR.exe',
                r'C:\Program Files\WinRAR\WinRAR.exe',
                r'C:\Program Files (x86)\WinRAR\WinRAR.exe',
            ]
            _unrar_bin = next((p for p in _unrar_paths if p and os.path.isfile(p)), None)
            _7z_paths = [
                _shutil.which('7z'), _shutil.which('7za'),
                r'C:\Program Files\7-Zip\7z.exe',
                r'C:\Program Files (x86)\7-Zip\7z.exe',
            ]
            _7z_bin = next((p for p in _7z_paths if p and os.path.isfile(p)), None)
            _extraction_success = False
            if _unrar_bin:
                logging.info(f"[AscendaraDownloader] Extracting with unrar CLI: {_unrar_bin}")
                _proc = subprocess.Popen(
                    [_unrar_bin, 'x', '-y', '-psteamrip.com', archive_path, (extract_to or self.download_dir) + '/'],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    creationflags=_CREATE_NO_WINDOW
                )
                try:
                    # Dynamic timeout: 4 hours for archives >50GB, otherwise 2 hours
                    archive_size = os.path.getsize(archive_path) if os.path.exists(archive_path) else 0
                    timeout_seconds = 14400 if archive_size > 50 * 1024 * 1024 * 1024 else 7200
                    _proc.wait(timeout=timeout_seconds)
                    if _proc.returncode in (0, 1):
                        _extraction_success = True
                        logging.info(f"[AscendaraDownloader] unrar extraction completed successfully")
                    else:
                        logging.warning(f"[AscendaraDownloader] unrar failed (exit {_proc.returncode}), trying 7z")
                except subprocess.TimeoutExpired:
                    _proc.kill()
                    logging.warning("[AscendaraDownloader] unrar timed out, trying 7z")
            if not _extraction_success:
                if _7z_bin:
                    logging.info(f"[AscendaraDownloader] Extracting with 7z: {_7z_bin}")
                    _proc = subprocess.Popen(
                        [_7z_bin, 'x', '-psteamrip.com', f'-o{extract_to or self.download_dir}', '-y', '-aoa', '-bsp0', '-bb0', archive_path],
                        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                        stdin=subprocess.DEVNULL,
                        creationflags=_CREATE_NO_WINDOW
                    )
                    try:
                        # Dynamic timeout: 4 hours for archives >50GB, otherwise 2 hours
                        archive_size = os.path.getsize(archive_path) if os.path.exists(archive_path) else 0
                        timeout_seconds = 14400 if archive_size > 50 * 1024 * 1024 * 1024 else 7200
                        _, _7z_stderr = _proc.communicate(timeout=timeout_seconds)
                        if _proc.returncode in (0, 1):
                            _extraction_success = True
                            logging.info(f"[AscendaraDownloader] 7z extraction completed successfully")
                        else:
                            _7z_err_msg = _7z_stderr.decode(errors='replace').strip() if _7z_stderr else ''
                            logging.error(f"[AscendaraDownloader] 7z stderr: {_7z_err_msg}")
                            raise RuntimeError(f"7z extraction failed (exit {_proc.returncode}): {_7z_err_msg}")
                    except subprocess.TimeoutExpired:
                        _proc.kill()
                        _proc.communicate()
                        raise RuntimeError(f"7z extraction timed out after {timeout_seconds // 3600} hour(s)")
                else:
                    raise RuntimeError(
                        f"RAR extraction failed: bundled unrar library error was: {_lib_err_msg}. "
                        "No CLI fallback (UnRAR.exe/7-Zip) found. Please reinstall Ascendara or install 7-Zip from https://7-zip.org/"
                    )
            logging.info(f"[AscendaraDownloader] RAR extraction with CLI tools complete")
            for dirpath, _, filenames in os.walk(self.download_dir):
                for fname in filenames:
                    if fname.endswith('.url') or fname.endswith('.rar') or fname.endswith('.zip') or '_CommonRedist' in dirpath:
                        continue
                    full_path = os.path.join(dirpath, fname)
                    key = os.path.relpath(full_path, self.download_dir).replace('\\', '/')
                    if key not in watching_data:
                        watching_data[key] = {"size": os.path.getsize(full_path)}
            self._update_extraction_progress("Complete", self._files_extracted_count, self._total_files_to_extract, force=True)
            return
        
        # On Linux/macOS, use system unrar binary
        unrar_bin = _shutil.which("unrar") or _shutil.which("unrar-free")
        if not unrar_bin:
            if sys.platform == "darwin":
                raise RuntimeError("System 'unrar' binary not found. Install it with: brew install unrar")
            else:
                raise RuntimeError("System 'unrar' binary not found. Install it with: sudo apt-get install unrar")

        logging.info(f"[AscendaraDownloader] Extracting RAR with system unrar: {archive_path}")

        # Count existing files before extraction for progress tracking
        initial_file_count = 0
        try:
            for root, dirs, files_in_dir in os.walk(self.download_dir):
                initial_file_count += len([f for f in files_in_dir if not f.endswith('.url') and not f.endswith('.rar') and not f.endswith('.zip')])
        except Exception:
            pass

        # Run unrar with Popen so we can read filenames line-by-line as they extract
        extraction_error = []
        files_extracted_count = [0]
        last_filename = [""]

        proc = subprocess.Popen(
            [unrar_bin, "x", "-y", "-psteamrip.com", archive_path, self.download_dir + "/"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        def read_stdout():
            try:
                last_seen = [""]
                for raw_line in proc.stdout:
                    # unrar uses \r for in-place progress; split on \r and \n
                    raw = raw_line.decode(errors='replace')
                    for segment in re.split(r'[\r\n]', raw):
                        line = segment.strip()
                        # Strip ANSI escape sequences
                        line = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', line)
                        # Strip non-printable characters (box-drawing, etc.)
                        line = re.sub(r'[^\x20-\x7E]', '', line)
                        if not (line.startswith('Extracting') or line.startswith('extracting')):
                            continue
                        # Remove trailing percentage/OK noise (unrar in-place progress)
                        rest = line.split(None, 1)[-1] if len(line.split(None, 1)) > 1 else ''
                        # Strip from first occurrence of padded percentage onward (handles "file   11% 12% 13%")
                        rest = re.sub(r'\s{2,}\d+\s*%.*$', '', rest)
                        rest = re.sub(r'\s+OK\s*$', '', rest)
                        rest = rest.strip()
                        fname = os.path.basename(rest)
                        # Only count/update when the filename actually changes
                        if fname and fname != last_seen[0] and not fname.endswith('.url') and '_CommonRedist' not in fname:
                            last_seen[0] = fname
                            files_extracted_count[0] += 1
                            last_filename[0] = fname
                            total = self._files_extracted_count + files_extracted_count[0]
                            self._update_extraction_progress(fname, total, self._total_files_to_extract)
            except Exception:
                pass

        stdout_thread = threading.Thread(target=read_stdout, daemon=True)
        stdout_thread.start()

        returncode = proc.wait()
        stdout_thread.join(timeout=5)

        if returncode not in (0, 1):
            stderr_out = proc.stderr.read().decode(errors='replace').strip()
            extraction_error.append(RuntimeError(
                f"unrar exited with code {returncode}: {stderr_out}"
            ))

        if extraction_error:
            logging.error(f"[AscendaraDownloader] RAR extraction failed: {extraction_error[0]}")
            raise extraction_error[0]

        logging.info(f"[AscendaraDownloader] RAR extraction complete")

        # Update extracted count from newly added files
        final_file_count = 0
        try:
            for root, dirs, files_in_dir in os.walk(self.download_dir):
                final_file_count += len([f for f in files_in_dir if not f.endswith('.url') and not f.endswith('.rar') and not f.endswith('.zip')])
        except Exception:
            pass
        newly_extracted = max(0, final_file_count - initial_file_count)
        self._files_extracted_count += newly_extracted
        
        # Cap the count to never exceed total
        if self._files_extracted_count > self._total_files_to_extract:
            logging.warning(f"[AscendaraDownloader] Extracted count ({self._files_extracted_count}) exceeds total ({self._total_files_to_extract}), capping")
            self._files_extracted_count = self._total_files_to_extract

        # Clean up unwanted files (.url and _CommonRedist)
        for root, dirs, files_in_dir in os.walk(self.download_dir):
            if '_CommonRedist' in root:
                try:
                    shutil.rmtree(root)
                    logging.info(f"[AscendaraDownloader] Removed _CommonRedist: {root}")
                except Exception as e:
                    logging.warning(f"[AscendaraDownloader] Could not remove _CommonRedist: {e}")
                continue

            for fname in files_in_dir:
                if fname.endswith('.url'):
                    try:
                        os.remove(os.path.join(root, fname))
                    except Exception:
                        pass

        # Build watching data from extracted files
        for dirpath, _, filenames in os.walk(self.download_dir):
            for fname in filenames:
                if fname.endswith('.url') or fname.endswith('.rar') or fname.endswith('.zip') or '_CommonRedist' in dirpath:
                    continue
                full_path = os.path.join(dirpath, fname)
                key = os.path.relpath(full_path, self.download_dir).replace('\\', '/')
                if key not in watching_data:
                    watching_data[key] = {"size": os.path.getsize(full_path)}

        self._update_extraction_progress("Complete", self._files_extracted_count, self._total_files_to_extract, force=True)
    
    def _extract_rar_with_library(self, archive_path: str, watching_data: Dict, extract_to: str = None):
        """Extract a RAR file using Python unrar library (Windows with bundled DLL)."""
        from unrar import rarfile
        import threading
        
        logging.info(f"[AscendaraDownloader] Extracting RAR with Python library: {archive_path}")
        
        # Snapshot files present before extraction starts — used as baseline
        def _snapshot_files():
            s = set()
            try:
                for _r, _d, _fs in os.walk(self.download_dir):
                    for _f in _fs:
                        if (not _f.endswith('.url') and not _f.endswith('.rar') and
                                not _f.endswith('.zip') and not _f.endswith('.ascendara.json') and
                                _f != 'filemap.ascendara.json'):
                            s.add(os.path.join(_r, _f))
            except Exception:
                pass
            return s
        _baseline_files = _snapshot_files()
        initial_file_count = len(_baseline_files)
        
        # Try opening with password first (handles encrypted-header archives),
        # fall back to opening without password for non-encrypted archives.
        try:
            rar_ref = rarfile.RarFile(archive_path, 'r', pwd='steamrip.com')
        except Exception:
            rar_ref = rarfile.RarFile(archive_path, 'r')
            try:
                rar_ref.setpassword('steamrip.com')
            except Exception:
                pass
        with rar_ref:
            # Filter members to extract (exclude .url and _CommonRedist)
            rar_files = [info for info in rar_ref.infolist() 
                        if not info.filename.endswith('.url') and '_CommonRedist' not in info.filename]
            
            logging.info(f"[AscendaraDownloader] Extracting {len(rar_files)} files from RAR")
            
            dest_dir = extract_to or self.download_dir
            
            # Bulk extraction is intentionally disabled because it prevents live UI progress updates.
            # File-by-file extraction is slower, but it keeps extractionProgress moving instead of staying on "Preparing...".
            USE_BULK_RAR_EXTRACTION = False
            if USE_BULK_RAR_EXTRACTION and len(rar_files) > 100:
                logging.info(f"[AscendaraDownloader] Using fast bulk extraction for {len(rar_files)} files")
                try:
                    # Extract all files at once (much faster)
                    rar_ref.extractall(dest_dir)
                    # Update progress to show completion
                    local_extracted = len(rar_files)
                    self._files_extracted_count += local_extracted
                    self._update_extraction_progress("Bulk extraction complete", self._files_extracted_count, self._total_files_to_extract, force=True)
                    logging.info(f"[AscendaraDownloader] Fast bulk extraction complete: {local_extracted} files")
                    return
                except Exception as bulk_err:
                    logging.warning(f"[AscendaraDownloader] Bulk extraction failed, falling back to file-by-file: {bulk_err}")
                    # Reset count and fall back to file-by-file
                    self._files_extracted_count = initial_file_count
            
            # Extract file-by-file for accurate per-file progress reporting (or as fallback)
            extraction_error = []
            local_extracted = 0
            heartbeat_count = 0
            last_heartbeat_time = time.time()

            for rar_info in rar_files:
                fname = os.path.basename(rar_info.filename.rstrip('/'))
                if not fname:
                    continue
                
                # Skip already-extracted files to allow resuming interrupted extractions
                dest_path = os.path.join(dest_dir, rar_info.filename)
                if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
                    local_extracted += 1
                    files_extracted_this_archive = self._files_extracted_count + local_extracted
                    percent = (files_extracted_this_archive / self._total_files_to_extract * 100) if self._total_files_to_extract > 0 else 0
                    self._update_extraction_progress(fname, files_extracted_this_archive, self._total_files_to_extract, force=False)
                    now = time.time()
                    if now - last_heartbeat_time >= 5.0:
                        heartbeat_count += 1
                        logging.info(f"[AscendaraDownloader] Skipping (exists) #{heartbeat_count}: {local_extracted} files so far ({percent:.1f}%) - {fname}")
                        last_heartbeat_time = now
                    continue

                EXTRACT_TIMEOUT = 1800  # 30 minutes per file before declaring a hang (for large files)
                extract_exc = []
                def _do_extract():
                    try:
                        rar_ref.extract(rar_info, dest_dir)
                    except Exception as e:
                        extract_exc.append(e)
                t = threading.Thread(target=_do_extract, daemon=True)
                t.start()
                t.join(timeout=EXTRACT_TIMEOUT)
                if t.is_alive():
                    # Hung — log it and reopen the archive to recover
                    logging.warning(f"[AscendaraDownloader] Extraction hung on {fname} after {EXTRACT_TIMEOUT}s, reopening RAR to resume")
                    try:
                        rar_ref.close()
                    except Exception:
                        pass
                    try:
                        rar_ref = rarfile.RarFile(archive_path, 'r')
                        try:
                            rar_ref.setpassword('steamrip.com')
                        except Exception:
                            pass
                    except Exception as reopen_e:
                        logging.error(f"[AscendaraDownloader] Could not reopen RAR after hang: {reopen_e}")
                        break
                    # The hung thread is abandoned (daemon); the file may be incomplete —
                    # delete it so the skip check re-extracts it on next pass
                    try:
                        if os.path.exists(dest_path):
                            os.remove(dest_path)
                    except Exception:
                        pass
                    # Re-extract the hung file with the fresh handle
                    try:
                        rar_ref.extract(rar_info, dest_dir)
                        local_extracted += 1
                        files_extracted_this_archive = self._files_extracted_count + local_extracted
                        percent = (files_extracted_this_archive / self._total_files_to_extract * 100) if self._total_files_to_extract > 0 else 0
                        logging.info(f"[AscendaraDownloader] Recovered extraction: {files_extracted_this_archive}/{self._total_files_to_extract} files ({percent:.1f}%) - {fname}")
                        self._update_extraction_progress(fname, files_extracted_this_archive, self._total_files_to_extract, force=True)
                    except Exception as e:
                        logging.warning(f"[AscendaraDownloader] Failed to re-extract {fname} after hang: {e}")
                        extraction_error.append(e)
                elif extract_exc:
                    logging.warning(f"[AscendaraDownloader] Failed to extract {fname}: {extract_exc[0]}")
                    extraction_error.append(extract_exc[0])
                else:
                    local_extracted += 1
                    files_extracted_this_archive = self._files_extracted_count + local_extracted
                    percent = (files_extracted_this_archive / self._total_files_to_extract * 100) if self._total_files_to_extract > 0 else 0
                    logging.info(f"[AscendaraDownloader] Extraction progress: {files_extracted_this_archive}/{self._total_files_to_extract} files ({percent:.1f}%) - {fname}")
                    self._update_extraction_progress(
                        fname,
                        files_extracted_this_archive,
                        self._total_files_to_extract,
                        force=(files_extracted_this_archive == 1),
                    )
                
                # Heartbeat every 5 seconds in case a file takes a long time
                now = time.time()
                if now - last_heartbeat_time >= 5.0:
                    heartbeat_count += 1
                    files_extracted_this_archive = self._files_extracted_count + local_extracted
                    percent = (files_extracted_this_archive / self._total_files_to_extract * 100) if self._total_files_to_extract > 0 else 0
                    logging.info(f"[AscendaraDownloader] Extraction heartbeat #{heartbeat_count}: {local_extracted} files extracted so far ({percent:.1f}%) - currently: {fname}")
                    last_heartbeat_time = now
            
            if extraction_error:
                logging.error(f"[AscendaraDownloader] RAR extraction failed: {extraction_error[0]}")
                raise extraction_error[0]
            
            logging.info(f"[AscendaraDownloader] RAR extraction complete")
            
            # Update extracted count using the precise per-file count
            self._files_extracted_count += local_extracted
            
            # Cap the count to never exceed total
            if self._files_extracted_count > self._total_files_to_extract:
                logging.warning(f"[AscendaraDownloader] Extracted count ({self._files_extracted_count}) exceeds total ({self._total_files_to_extract}), capping")
                self._files_extracted_count = self._total_files_to_extract
        
        # Clean up unwanted files (.url and _CommonRedist)
        for root, dirs, files_in_dir in os.walk(self.download_dir):
            if '_CommonRedist' in root:
                try:
                    shutil.rmtree(root)
                    logging.info(f"[AscendaraDownloader] Removed _CommonRedist: {root}")
                except Exception as e:
                    logging.warning(f"[AscendaraDownloader] Could not remove _CommonRedist: {e}")
                continue
            
            for fname in files_in_dir:
                if fname.endswith('.url'):
                    try:
                        os.remove(os.path.join(root, fname))
                    except Exception:
                        pass
        
        # Build watching data from extracted files
        for dirpath, _, filenames in os.walk(self.download_dir):
            for fname in filenames:
                if fname.endswith('.url') or fname.endswith('.rar') or fname.endswith('.zip') or '_CommonRedist' in dirpath:
                    continue
                full_path = os.path.join(dirpath, fname)
                key = os.path.relpath(full_path, self.download_dir).replace('\\', '/')
                if key not in watching_data:
                    watching_data[key] = {"size": os.path.getsize(full_path)}
        
        self._update_extraction_progress("Complete", self._files_extracted_count, self._total_files_to_extract, force=True)
    
    def _flatten_directories(self):
        """Move game files from the extraction subdirectory up to the root game dir, preserving all folder structure."""
        protected_files = {
            f"{sanitize_folder_name(self.game)}.ascendara.json",
            "filemap.ascendara.json",
        }
        
        # List immediate subdirs (skip system/metadata dirs)
        subdirs = []
        for item in os.listdir(self.download_dir):
            item_path = os.path.join(self.download_dir, item)
            if os.path.isdir(item_path) and item != '_CommonRedist' and not item.endswith('.ascendara'):
                subdirs.append(item_path)
        
        logging.info(f"[AscendaraDownloader] Found {len(subdirs)} subdirectories")
        
        if not subdirs:
            logging.info("[AscendaraDownloader] No directories to flatten")
            return
        
        # Only flatten if the subdirectory name resembles the game name.
        # Repack wrappers are typically named after the game (e.g. "Forza Horizon 6",
        # "ForzaHorizon6"). Legitimate game subdirectories use short internal names
        # (e.g. "FH6", "data", "bin") that don't match the game title.
        def _name_matches_game(dirname: str) -> bool:
            game_clean = re.sub(r'[^a-z0-9]', '', self.game.lower())
            dir_clean  = re.sub(r'[^a-z0-9]', '', dirname.lower())
            if not dir_clean:
                return False
            # Exact match after stripping punctuation/spaces
            if game_clean == dir_clean:
                return True
            # Dir name is a prefix of the game name (handles truncated titles)
            if len(dir_clean) >= 4 and game_clean.startswith(dir_clean):
                return True
            # Game name starts with the dir name (e.g. game="ForzaHorizon6", dir="Forza")
            if len(dir_clean) >= 4 and dir_clean in game_clean:
                # Only if the match covers a significant portion (≥50%) of the game name
                if len(dir_clean) >= len(game_clean) * 0.5:
                    return True
            return False

        def _has_exe(path: str) -> bool:
            for _root, _dirs, _files in os.walk(path):
                if any(f.lower().endswith('.exe') for f in _files):
                    return True
            return False

        def _count_files(path: str) -> int:
            count = 0
            for _root, _dirs, _files in os.walk(path):
                count += len(_files)
            return count

        # Root-level status
        root_items = os.listdir(self.download_dir)
        root_files = [f for f in root_items if os.path.isfile(os.path.join(self.download_dir, f))]
        root_exe = any(f.lower().endswith('.exe') for f in root_files)
        total_files = _count_files(self.download_dir)

        # Find the subdir that contains a .exe AND whose name resembles the game name
        target_dir = None
        for subdir in subdirs:
            subdir_name = os.path.basename(subdir)
            if not _name_matches_game(subdir_name):
                logging.info(f"[AscendaraDownloader] Skipping flatten candidate (name mismatch): {subdir_name}")
                continue
            if _has_exe(subdir):
                target_dir = subdir
                logging.info(f"[AscendaraDownloader] Name-matched subdir contains executable: {subdir_name}")
                break

        if not target_dir and not root_exe and len(subdirs) == 1:
            subdir = subdirs[0]
            subdir_name = os.path.basename(subdir)
            subdir_file_count = _count_files(subdir)
            if _has_exe(subdir):
                target_dir = subdir
                logging.info(f"[AscendaraDownloader] Single subdir '{subdir_name}' contains the only executable — flattening wrapper")
            elif total_files > 0 and subdir_file_count / total_files >= 0.8:
                target_dir = subdir
                logging.info(f"[AscendaraDownloader] Single subdir '{subdir_name}' contains {subdir_file_count}/{total_files} files — flattening wrapper")

        # Aggressive wrapper fallback: if the root only contains Ascendara metadata
        # files (JSON, header images, etc.) and a single subdir, assume the subdir
        # is a wrapper and flatten it. This catches TorBox/GOFile wrappers even when
        # the content ratio is low and Ascendara has already placed image files in
        # the game directory.
        if not target_dir and len(subdirs) == 1:
            subdir = subdirs[0]
            subdir_name = os.path.basename(subdir)
            root_metadata_files = [
                f for f in root_files
                if f.endswith('.ascendara.json')
                or f == 'filemap.ascendara.json'
                or f.endswith('.ascendara.png')
                or f.endswith('.ascendara.jpg')
            ]
            logging.info(
                f"[AscendaraDownloader] Flatten debug: root_files={root_files}, "
                f"root_exe={root_exe}, total_files={total_files}, "
                f"subdir_file_count={_count_files(subdir)}, "
                f"metadata_only={len(root_metadata_files) == len(root_files)}"
            )
            if len(root_metadata_files) == len(root_files):
                target_dir = subdir
                logging.info(f"[AscendaraDownloader] Single subdir '{subdir_name}' treated as wrapper (root only has metadata) — flattening")

        # Fall back: single subdir that matches the game name, even without a .exe
        if not target_dir and len(subdirs) == 1:
            subdir_name = os.path.basename(subdirs[0])
            if _name_matches_game(subdir_name):
                target_dir = subdirs[0]
            else:
                logging.info(f"[AscendaraDownloader] Single subdir '{subdir_name}' does not match game name — skipping flatten")
                return

        if not target_dir:
            logging.info("[AscendaraDownloader] No flatten-eligible subdirectory found — skipping flatten")
            return
        
        logging.info(f"[AscendaraDownloader] Flattening: {target_dir}")
        
        for item in list(os.listdir(target_dir)):
            src = os.path.join(target_dir, item)
            dst = os.path.join(self.download_dir, item)
            
            if os.path.normpath(dst) == os.path.normpath(target_dir):
                continue
            if item in protected_files:
                continue
            if not os.path.exists(src):
                continue
            
            if os.path.exists(dst):
                if os.path.isdir(dst):
                    shutil.rmtree(dst, ignore_errors=True)
                else:
                    os.remove(dst)
            
            try:
                shutil.move(src, dst)
            except Exception as e:
                logging.error(f"[AscendaraDownloader] Failed to move {src}: {e}")
        
        # Remove empty shell directory
        try:
            if not os.listdir(target_dir):
                shutil.rmtree(target_dir, ignore_errors=True)
                logging.info(f"[AscendaraDownloader] Deleted empty dir: {target_dir}")
        except Exception:
            pass
    
    def _cleanup_junk_files(self):
        """Remove .url files and _CommonRedist folders."""
        for root, dirs, files in os.walk(self.download_dir, topdown=False):
            for fname in files:
                if fname.endswith('.url'):
                    file_path = os.path.join(root, fname)
                    try:
                        os.remove(file_path)
                        logging.info(f"[AscendaraDownloader] Deleted .url: {file_path}")
                    except Exception:
                        pass
            
            for d in dirs:
                if d.lower() == '_commonredist':
                    dir_path = os.path.join(root, d)
                    try:
                        shutil.rmtree(dir_path)
                        logging.info(f"[AscendaraDownloader] Deleted _CommonRedist: {dir_path}")
                    except Exception:
                        pass
    
    def _verify_extracted_files(self, watching_path: str, backup_dir: Optional[str] = None):
        """Verify extracted files match expected sizes.
        
        Args:
            watching_path: Path to the filemap JSON
            backup_dir: Path to backup directory (for updates)
        """
        # Check if download has been stopped before starting verification
        if self._check_for_stop():
            logging.info("[AscendaraDownloader] Verification stopped by user")
            return
        
        logging.info(f"[AscendaraDownloader] Starting verification of extracted files")
        verify_start_time = time.time()
        try:
            with open(watching_path, 'r') as f:
                watching_data = json.load(f)
            
            logging.info(f"[AscendaraDownloader] Verifying {len(watching_data)} files")
            verify_errors = []
            
            # Log any remaining archives; game content may legitimately include archives.
            # Only warn for archives in root (likely failed cleanup), log others as debug (game content).
            _archive_warning_count = 0
            _max_archive_warnings = 10
            for root, dirs, files in os.walk(self.download_dir):
                for file in files:
                    if file.endswith('.rar') or file.endswith('.zip') or file.endswith('.7z'):
                        archive_path = os.path.join(root, file)
                        rel_path = os.path.relpath(archive_path, self.download_dir)
                        # Check if archive is in root directory (no path separator)
                        is_in_root = os.path.dirname(rel_path) == ''
                        if is_in_root:
                            if _archive_warning_count < _max_archive_warnings:
                                logging.warning(f"[AscendaraDownloader] Found archive in root after extraction (may need cleanup): {rel_path}")
                                _archive_warning_count += 1
                            elif _archive_warning_count == _max_archive_warnings:
                                logging.warning(f"[AscendaraDownloader] ... suppressing additional archive warnings")
                                _archive_warning_count += 1
                        else:
                            # Game content archives - log at debug level to reduce spam
                            logging.debug(f"[AscendaraDownloader] Found archive in subdirectory (game content): {rel_path}")
            
            verified_count = 0
            for file_path, file_info in watching_data.items():
                # Check if download has been stopped during verification
                if self._check_for_stop():
                    logging.info("[AscendaraDownloader] Verification stopped by user")
                    return
                
                if os.path.basename(file_path) == 'filemap.ascendara.json':
                    continue
                
                full_path = os.path.join(self.download_dir, file_path)
                if not os.path.exists(full_path):
                    verify_errors.append({"file": file_path, "error": "File not found"})
                    logging.warning(f"[AscendaraDownloader] Verification failed - file not found: {file_path}")
                elif os.path.getsize(full_path) != file_info['size']:
                    verify_errors.append({"file": file_path, "error": f"Size mismatch: expected {file_info['size']}, got {os.path.getsize(full_path)}"})
                    logging.warning(f"[AscendaraDownloader] Verification failed - size mismatch: {file_path}")
                else:
                    verified_count += 1
            
            logging.info(f"[AscendaraDownloader] Verification complete: {verified_count} files OK, {len(verify_errors)} errors")
            
            # Ensure verifying state shows for at least 1 second in the UI
            elapsed = time.time() - verify_start_time
            if elapsed < 1.0:
                time.sleep(1.0 - elapsed)
            
            self.game_info["downloadingData"]["verifying"] = False
            if verify_errors:
                self.game_info["downloadingData"]["verifyError"] = verify_errors
                
                # Restore from backup if this is an update
                if backup_dir:
                    logging.warning(f"[AscendaraDownloader] Update verification failed, restoring from backup")
                    if self._restore_from_backup(backup_dir):
                        logging.info(f"[AscendaraDownloader] Successfully restored original files")
                        if self.withNotification:
                            _launch_notification(
                                self.withNotification,
                                "Update Failed - Restored",
                                f"Update failed but original files were restored"
                            )
                    else:
                        logging.error(f"[AscendaraDownloader] Failed to restore from backup")
                        if self.withNotification:
                            _launch_notification(
                                self.withNotification,
                                "Update Failed",
                                f"Update failed and restore failed - backup at {backup_dir}"
                            )
            
            safe_write_json(self.game_info_path, self.game_info)
            
            if not verify_errors:
                self._detect_and_set_executable()
                self._handle_post_download_behavior()
                
                # Cleanup backup after successful update
                if backup_dir:
                    self._cleanup_backup(backup_dir)
                    logging.info(f"[AscendaraDownloader] Update completed successfully, backup cleaned up")
                
                if "downloadingData" in self.game_info:
                    del self.game_info["downloadingData"]
                    safe_write_json(self.game_info_path, self.game_info)
        except Exception as e:
            logging.error(f"[AscendaraDownloader] Verification error: {e}")
            
            # Restore from backup if this is an update
            if backup_dir:
                logging.warning(f"[AscendaraDownloader] Update error, restoring from backup")
                if self._restore_from_backup(backup_dir):
                    logging.info(f"[AscendaraDownloader] Successfully restored original files after error")
                    if self.withNotification:
                        _launch_notification(
                            self.withNotification,
                            "Update Failed - Restored",
                            f"Update failed but original files were restored"
                        )
                else:
                    logging.error(f"[AscendaraDownloader] Failed to restore from backup after error")
            
            handleerror(self.game_info, self.game_info_path, e)
    
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


# CLI Entrypoint


def parse_boolean(value):
    if isinstance(value, bool):
        return value
    if value.lower() in ['true', '1', 'yes']:
        return True
    elif value.lower() in ['false', '0', 'no']:
        return False
    else:
        raise ValueError(f"Invalid boolean value: {value}")

def main():
    parser = ArgumentParser(description="Ascendara Downloader V2 - Robust Chunked Downloader")
    parser.add_argument("url", help="Download URL")
    parser.add_argument("game", help="Name of the game")
    parser.add_argument("online", type=parse_boolean, help="Is the game online (true/false)?")
    parser.add_argument("dlc", type=parse_boolean, help="Is DLC included (true/false)?")
    parser.add_argument("isVr", type=parse_boolean, help="Is the game a VR game (true/false)?")
    parser.add_argument("updateFlow", type=parse_boolean, help="Is this an update (true/false)?")
    parser.add_argument("version", help="Version of the game")
    parser.add_argument("size", help="Size of the file (ex: 12 GB, 439 MB)")
    parser.add_argument("download_dir", help="Directory to save the downloaded files")
    parser.add_argument("gameID", nargs="?", default="", help="Game ID from SteamRIP")
    parser.add_argument("--withNotification", help="Theme name for notifications", default=None)
    args = parser.parse_args()
    
    try:
        downloader = AscendaraDownloader(
            args.game, args.online, args.dlc, args.isVr, 
            args.updateFlow, args.version, args.size, 
            args.download_dir, args.gameID
        )
        downloader.download(args.url, withNotification=args.withNotification)
    except Exception as e:
        logging.error(f"[AscendaraDownloaderV2] Fatal error: {e}", exc_info=True)
        launch_crash_reporter(1, str(e))
        raise

if __name__ == '__main__':
    main()
