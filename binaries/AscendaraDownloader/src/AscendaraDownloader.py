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
import hashlib
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
        crash_reporter_path = os.path.join('./AscendaraCrashReporter.exe')
        if os.path.exists(crash_reporter_path):
            subprocess.Popen(
                [crash_reporter_path, "maindownloader", str(error_code), error_message],
                creationflags=subprocess.CREATE_NO_WINDOW
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
            subprocess.Popen(
                [notification_helper_path, "--theme", theme, "--title", title, "--message", message],
                creationflags=subprocess.CREATE_NO_WINDOW
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
    if sys.platform == 'win32':
        appdata = os.environ.get('APPDATA')
        if appdata:
            candidate = os.path.join(appdata, 'Electron', 'ascendarasettings.json')
            if os.path.exists(candidate):
                return candidate
    elif sys.platform == 'darwin':
        user_data_dir = os.path.expanduser('~/Library/Application Support/ascendara')
        candidate = os.path.join(user_data_dir, 'ascendarasettings.json')
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
        self.start_time = time.time()
        self.last_progress_update = 0
        
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
                        # Some servers return full content-length even with range request
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
    
    def _update_progress(self, force: bool = False):
        """Update progress in game info file."""
        now = time.time()
        if not force and (now - self.last_progress_update) < self.PROGRESS_UPDATE_INTERVAL:
            return
        
        self.last_progress_update = now
        elapsed = now - self.start_time
        
        if elapsed > 0:
            speed = self.downloaded_bytes / elapsed
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
    
    def _stream_download(self, start_byte: int, file_handle) -> bool:
        """
        Stream download from start_byte, writing directly to file.
        Returns True if completed successfully, False if interrupted.
        """
        headers = {}
        if start_byte > 0 and self.supports_range:
            headers['Range'] = f'bytes={start_byte}-'
        
        try:
            response = self.session.get(
                self.url,
                headers=headers,
                stream=True,
                timeout=(30, 300)  # 30s connect, 5min read timeout
            )
            
            if response.status_code == 416:
                # Range not satisfiable - file is complete
                return True
            
            response.raise_for_status()
            
            # Try to get total size from Content-Range or Content-Length
            if self.total_size is None:
                if 'Content-Range' in response.headers:
                    content_range = response.headers['Content-Range']
                    if '/' in content_range:
                        total_str = content_range.split('/')[-1]
                        if total_str != '*':
                            self.total_size = int(total_str)
                            logging.info(f"[ChunkedDownloader] Got total size from Content-Range: {read_size(self.total_size)}")
                elif 'Content-Length' in response.headers:
                    content_length = int(response.headers['Content-Length'])
                    self.total_size = start_byte + content_length
                    logging.info(f"[ChunkedDownloader] Calculated total size: {read_size(self.total_size)}")
            
            # Stream the content
            for data in response.iter_content(chunk_size=self.STREAM_CHUNK_SIZE):
                if data:
                    file_handle.write(data)
                    file_handle.flush()  # Ensure data is written to disk
                    self.downloaded_bytes += len(data)
                    self._update_progress()
            
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
            # Probe server for capabilities
            self._probe_server()
            
            # Check for existing partial download
            existing_size = self._get_existing_size()
            
            if self.total_size and existing_size >= self.total_size:
                logging.info(f"[ChunkedDownloader] File already complete: {read_size(existing_size)}")
                return True
            
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
            
            # Retry loop - keeps trying until success or max retries
            while retry_count < self.MAX_RETRIES:
                # Open file for writing/appending
                mode = 'ab' if self.downloaded_bytes > 0 else 'wb'
                
                with open(self.dest_path, mode) as f:
                    success = self._stream_download(self.downloaded_bytes, f)
                
                if success:
                    # Check if download is complete
                    final_size = os.path.getsize(self.dest_path)
                    
                    if self.total_size is None or final_size >= self.total_size:
                        # Clear retry status
                        if 'retryAttempt' in self.game_info.get('downloadingData', {}):
                            del self.game_info['downloadingData']['retryAttempt']
                            safe_write_json(self.game_info_path, self.game_info)
                        
                        # Final progress update
                        self._update_progress(force=True)
                        
                        logging.info(f"[ChunkedDownloader] Download complete: {read_size(final_size)}")
                        return True
                    else:
                        # Partial download - continue
                        logging.info(f"[ChunkedDownloader] Partial: {read_size(final_size)}/{read_size(self.total_size)}, continuing...")
                        self.downloaded_bytes = final_size
                        continue
                
                # Stream was interrupted - retry if we have range support
                if not self.supports_range:
                    logging.error("[ChunkedDownloader] Download interrupted and server doesn't support resume")
                    return False
                
                retry_count += 1
                self.downloaded_bytes = os.path.getsize(self.dest_path) if os.path.exists(self.dest_path) else 0
                
                # Update game info with retry status
                self.game_info["downloadingData"]["retryAttempt"] = retry_count
                safe_write_json(self.game_info_path, self.game_info)
                
                logging.info(f"[ChunkedDownloader] Retry {retry_count}/{self.MAX_RETRIES} in {retry_delay}s, resuming from {read_size(self.downloaded_bytes)}")
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, self.RETRY_DELAY_MAX)
                
                # Recreate session
                self.session.close()
                self.session = create_robust_session()
            
            logging.error(f"[ChunkedDownloader] Max retries ({self.MAX_RETRIES}) exceeded")
            return False
            
        except Exception as e:
            logging.error(f"[ChunkedDownloader] Download failed: {e}")
            raise
        finally:
            self.session.close()


# Main Downloader Class


class RobustDownloader:
    """
    Main downloader class that orchestrates download, extraction, and verification.
    """
    
    VALID_BUZZHEAVIER_DOMAINS = [
        'buzzheavier.com',
        'bzzhr.co',
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
                logging.info(f"[RobustDownloader] Updating version from {self.game_info.get('version', 'unknown')} to {version}")
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
        
        try:
            # Check for Buzzheavier URLs
            if any(domain in url for domain in self.VALID_BUZZHEAVIER_DOMAINS):
                self._download_buzzheavier(url)
                return
            
            # Update state
            self.game_info["downloadingData"]["downloading"] = True
            safe_write_json(self.game_info_path, self.game_info)
            
            # Get filename
            base_name = self._get_filename_from_url(url)
            dest = os.path.join(self.download_dir, base_name)
            
            logging.info(f"[RobustDownloader] Starting download: {url}")
            logging.info(f"[RobustDownloader] Destination: {dest}")
            
            # Notification: Download Started
            if withNotification:
                _launch_notification(withNotification, "Download Started", f"Starting download for {self.game}")
            
            # Create chunked downloader and start download
            downloader = ChunkedDownloader(url, dest, self.game_info, self.game_info_path)
            success = downloader.download()
            
            if success:
                logging.info(f"[RobustDownloader] Download completed successfully")
                
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
                logging.error(f"[RobustDownloader] Provider blocked error: {e}")
                handleerror(self.game_info, self.game_info_path, 'provider_blocked_error')
            else:
                logging.error(f"[RobustDownloader] Download error: {e}")
                handleerror(self.game_info, self.game_info_path, e)
            
            if withNotification:
                _launch_notification(withNotification, "Download Error", f"Error downloading {self.game}: {e}")
    
    def _fix_file_extension(self, dest: str) -> str:
        """Fix file extension based on detected file type."""
        filetype, hexsig = self.detect_file_type(dest)
        logging.info(f"[RobustDownloader] Detected file type: {filetype}")
        
        ext_map = {'zip': '.zip', 'rar': '.rar', '7z': '.7z', 'exe': '.exe'}
        correct_ext = ext_map.get(filetype)
        
        if correct_ext and not dest.endswith(correct_ext):
            current_ext = os.path.splitext(dest)[1]
            if current_ext:
                new_dest = dest[:-len(current_ext)] + correct_ext
            else:
                new_dest = dest + correct_ext
            
            logging.info(f"[RobustDownloader] Renaming to: {new_dest}")
            os.rename(dest, new_dest)
            
            if os.path.exists(dest) and dest != new_dest:
                try:
                    os.remove(dest)
                except Exception:
                    pass
            
            return new_dest
        
        return dest
    
    def _download_buzzheavier(self, url: str):
        """Download from Buzzheavier with robust chunked download and resume support."""
        from bs4 import BeautifulSoup
        
        logging.info(f"[RobustDownloader] Buzzheavier download: {url}")
        
        # Get the actual download URL from Buzzheavier
        session = create_robust_session()
        response = session.get(url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        title = soup.title.string.strip() if soup.title else 'buzzheavier_download'
        logging.info(f"[Buzzheavier] Title: {title}")
        
        download_url = url + '/download'
        headers = {
            'hx-current-url': url,
            'hx-request': 'true',
            'referer': url
        }
        
        head_response = session.head(download_url, headers=headers, allow_redirects=False)
        hx_redirect = head_response.headers.get('hx-redirect')
        
        if not hx_redirect:
            raise Exception("Download link not found. Is this a directory?")
        
        logging.info(f"[Buzzheavier] Download link: {hx_redirect}")
        domain = url.split('/')[2]
        final_url = f'https://{domain}' + hx_redirect if hx_redirect.startswith('/dl/') else hx_redirect
        
        session.close()
        
        # Use the robust ChunkedDownloader for the actual file download
        dest_path = os.path.join(self.download_dir, title)
        
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
    
    def _extract_files(self, archive_path: Optional[str] = None):
        """Extract archive files and flatten nested directories."""
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
        
        watching_path = os.path.join(self.download_dir, "filemap.ascendara.json")
        watching_data = {}
        archive_exts = {'.rar', '.zip'}
        
        # Determine archives to process
        if archive_path and os.path.exists(archive_path):
            archives_to_process = [archive_path]
            logging.info(f"[RobustDownloader] Extracting: {archive_path}")
        else:
            logging.info(f"[RobustDownloader] Scanning for archives in: {self.download_dir}")
            archives_to_process = []
            for root, _, files in os.walk(self.download_dir):
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in archive_exts:
                        archives_to_process.append(os.path.join(root, file))
        
        # Count total files for progress tracking
        total_files_to_extract = 0
        for arch_path in archives_to_process:
            try:
                ext = os.path.splitext(arch_path)[1].lower()
                if ext == '.zip':
                    with zipfile.ZipFile(arch_path, 'r') as zip_ref:
                        for zip_info in zip_ref.infolist():
                            if not zip_info.filename.endswith('.url') and '_CommonRedist' not in zip_info.filename and not zip_info.is_dir():
                                total_files_to_extract += 1
                elif ext == '.rar':
                    from unrar import rarfile
                    with rarfile.RarFile(arch_path) as rar_ref:
                        for rar_info in rar_ref.infolist():
                            # Check if it's a directory by filename ending with / or \
                            is_dir = rar_info.filename.endswith('/') or rar_info.filename.endswith('\\')
                            if not rar_info.filename.endswith('.url') and '_CommonRedist' not in rar_info.filename and not is_dir:
                                total_files_to_extract += 1
            except Exception as e:
                logging.warning(f"[RobustDownloader] Could not count files in {arch_path}: {e}")
        
        logging.info(f"[RobustDownloader] Total files to extract: {total_files_to_extract}")
        self._total_files_to_extract = total_files_to_extract
        self._update_extraction_progress("Preparing...", 0, total_files_to_extract)
        
        processed_archives = set()
        
        while archives_to_process:
            current_archive = archives_to_process.pop(0)
            
            if current_archive in processed_archives:
                continue
            
            processed_archives.add(current_archive)
            ext = os.path.splitext(current_archive)[1].lower()
            logging.info(f"[RobustDownloader] Extracting: {current_archive}")
            
            try:
                if ext == '.zip':
                    self._extract_zip(current_archive, watching_data)
                elif ext == '.rar':
                    self._extract_rar(current_archive, watching_data)
                
                # Delete archive after extraction
                try:
                    os.remove(current_archive)
                    logging.info(f"[RobustDownloader] Deleted archive: {current_archive}")
                except Exception as e:
                    logging.warning(f"[RobustDownloader] Could not delete archive: {e}")
                
            except Exception as e:
                logging.error(f"[RobustDownloader] Extraction failed: {e}")
                continue
            
            # Scan for new archives
            for root, _, files in os.walk(self.download_dir):
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in archive_exts:
                        new_archive = os.path.join(root, file)
                        if new_archive not in processed_archives and new_archive not in archives_to_process:
                            archives_to_process.append(new_archive)
                            logging.info(f"[RobustDownloader] Found nested archive: {new_archive}")
        
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
        self._verify_extracted_files(watching_path)
    
    def _update_extraction_progress(self, current_file: str, files_extracted: int, total_files: int):
        """Update extraction progress in the game info JSON."""
        elapsed = time.time() - self._extraction_start_time
        speed = files_extracted / elapsed if elapsed > 0 else 0
        percent = (files_extracted / total_files * 100) if total_files > 0 else 0
        
        self.game_info["downloadingData"]["extractionProgress"] = {
            "currentFile": current_file[:50] + "..." if len(current_file) > 50 else current_file,
            "filesExtracted": files_extracted,
            "totalFiles": total_files,
            "percentComplete": f"{percent:.2f}",
            "extractionSpeed": f"{speed:.1f} files/s" if speed >= 1 else f"{speed:.2f} files/s"
        }
        safe_write_json(self.game_info_path, self.game_info)

    def _extract_zip(self, archive_path: str, watching_data: Dict):
        """Extract a ZIP file."""
        try:
            with zipfile.ZipFile(archive_path, 'r') as test_zip:
                test_zip.testzip()
            logging.info(f"[RobustDownloader] ZIP validation passed")
        except zipfile.BadZipFile as e:
            logging.error(f"[RobustDownloader] Invalid ZIP: {e}")
            raise
        
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            zip_contents = zip_ref.infolist()
            logging.info(f"[RobustDownloader] ZIP contains {len(zip_contents)} files")
            
            for zip_info in zip_contents:
                if not zip_info.filename.endswith('.url') and '_CommonRedist' not in zip_info.filename:
                    try:
                        zip_ref.extract(zip_info, self.download_dir)
                        extracted_path = os.path.join(self.download_dir, zip_info.filename)
                        key = os.path.relpath(extracted_path, self.download_dir)
                        watching_data[key] = {"size": zip_info.file_size}
                        # Update progress for non-directory entries
                        if not zip_info.is_dir():
                            self._files_extracted_count += 1
                            self._update_extraction_progress(zip_info.filename, self._files_extracted_count, self._total_files_to_extract)
                    except Exception as e:
                        logging.error(f"[RobustDownloader] Failed to extract {zip_info.filename}: {e}")
    
    def _extract_rar(self, archive_path: str, watching_data: Dict):
        """Extract a RAR file."""
        try:
            from unrar import rarfile
        except ImportError:
            logging.error("[RobustDownloader] unrar module not installed")
            raise ImportError("unrar module required for RAR extraction")
        
        with rarfile.RarFile(archive_path) as rar_ref:
            # Extract file by file for progress tracking
            rar_files = [info for info in rar_ref.infolist() 
                        if not info.filename.endswith('.url') and '_CommonRedist' not in info.filename]
            
            for rar_info in rar_files:
                try:
                    rar_ref.extract(rar_info, self.download_dir)
                    extracted_path = os.path.join(self.download_dir, rar_info.filename)
                    key = os.path.relpath(extracted_path, self.download_dir)
                    watching_data[key] = {"size": rar_info.file_size}
                    # Update progress for non-directory entries (check by filename ending)
                    is_dir = rar_info.filename.endswith('/') or rar_info.filename.endswith('\\')
                    if not is_dir:
                        self._files_extracted_count += 1
                        self._update_extraction_progress(rar_info.filename, self._files_extracted_count, self._total_files_to_extract)
                except Exception as e:
                    logging.error(f"[RobustDownloader] Failed to extract {rar_info.filename}: {e}")
    
    def _flatten_directories(self):
        """Flatten nested directories that should be at root level."""
        protected_files = {
            f"{sanitize_folder_name(self.game)}.ascendara.json",
            "filemap.ascendara.json",
            "game.ascendara.json",
            "header.jpg",
            "header.png",
            "header.webp"
        }
        
        nested_dirs_to_check = []
        
        # Check for game-named directory
        game_named_dir = os.path.join(self.download_dir, sanitize_folder_name(self.game))
        if os.path.isdir(game_named_dir):
            nested_dirs_to_check.append(game_named_dir)
            logging.info(f"[RobustDownloader] Found game-named dir to flatten: {game_named_dir}")
        
        # Check for single subdirectory
        subdirs = []
        for item in os.listdir(self.download_dir):
            item_path = os.path.join(self.download_dir, item)
            if os.path.isdir(item_path) and not item.endswith('.ascendara') and item != '_CommonRedist':
                subdirs.append(item_path)
        
        logging.info(f"[RobustDownloader] Found {len(subdirs)} subdirectories")
        
        # Also check for SteamRIP-style directories (game name with -SteamRIP.com suffix)
        for subdir in subdirs:
            subdir_name = os.path.basename(subdir).lower()
            game_lower = self.game.lower()
            # Get first meaningful word (strip punctuation)
            first_word = ''.join(c for c in game_lower.split()[0] if c.isalnum()) if game_lower else ""
            # Normalize subdir name for comparison
            subdir_normalized = subdir_name.replace('-', ' ').replace('_', ' ').replace('.', ' ')
            
            should_flatten = False
            reason = ""
            
            if 'steamrip' in subdir_name:
                should_flatten = True
                reason = "contains 'steamrip'"
            elif game_lower.replace(' ', '-').replace(':', '') in subdir_name.replace(' ', '-').replace(':', ''):
                should_flatten = True
                reason = "matches game name pattern"
            elif first_word and len(first_word) >= 3 and first_word in subdir_normalized:
                should_flatten = True
                reason = f"contains first word '{first_word}'"
            
            if should_flatten and subdir not in nested_dirs_to_check:
                nested_dirs_to_check.append(subdir)
                logging.info(f"[RobustDownloader] Found dir to flatten: {subdir} ({reason})")
        
        if len(subdirs) == 1 and subdirs[0] not in nested_dirs_to_check:
            root_files = [f for f in os.listdir(self.download_dir) 
                         if os.path.isfile(os.path.join(self.download_dir, f)) 
                         and f not in protected_files
                         and not f.endswith('.ascendara.json')]
            
            if len(root_files) == 0:
                subdir_contents = os.listdir(subdirs[0])
                if len(subdir_contents) > 0:
                    nested_dirs_to_check.append(subdirs[0])
                    logging.info(f"[RobustDownloader] Found single subdir to flatten: {subdirs[0]}")
        
        if not nested_dirs_to_check:
            logging.info(f"[RobustDownloader] No directories to flatten")
        
        for nested_dir in nested_dirs_to_check:
            if os.path.isdir(nested_dir):
                logging.info(f"[RobustDownloader] Flattening: {nested_dir}")
                items_to_move = os.listdir(nested_dir)
                
                for item in items_to_move:
                    src = os.path.join(nested_dir, item)
                    dst = os.path.join(self.download_dir, item)
                    
                    if os.path.normpath(dst) == os.path.normpath(nested_dir):
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
                        logging.error(f"[RobustDownloader] Failed to move {src}: {e}")
                
                # Delete empty nested directory
                try:
                    remaining = os.listdir(nested_dir)
                    if len(remaining) == 0:
                        shutil.rmtree(nested_dir, ignore_errors=True)
                        logging.info(f"[RobustDownloader] Deleted empty dir: {nested_dir}")
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
                        logging.info(f"[RobustDownloader] Deleted .url: {file_path}")
                    except Exception:
                        pass
            
            for d in dirs:
                if d.lower() == '_commonredist':
                    dir_path = os.path.join(root, d)
                    try:
                        shutil.rmtree(dir_path)
                        logging.info(f"[RobustDownloader] Deleted _CommonRedist: {dir_path}")
                    except Exception:
                        pass
    
    def _verify_extracted_files(self, watching_path: str):
        """Verify extracted files match expected sizes."""
        logging.info(f"[RobustDownloader] Starting verification of extracted files")
        verify_start_time = time.time()
        try:
            with open(watching_path, 'r') as f:
                watching_data = json.load(f)
            
            logging.info(f"[RobustDownloader] Verifying {len(watching_data)} files")
            verify_errors = []
            verified_count = 0
            for file_path, file_info in watching_data.items():
                if os.path.basename(file_path) == 'filemap.ascendara.json':
                    continue
                
                full_path = os.path.join(self.download_dir, file_path)
                if not os.path.exists(full_path):
                    verify_errors.append({"file": file_path, "error": "File not found"})
                    logging.warning(f"[RobustDownloader] Verification failed - file not found: {file_path}")
                elif os.path.getsize(full_path) != file_info['size']:
                    verify_errors.append({"file": file_path, "error": f"Size mismatch: expected {file_info['size']}, got {os.path.getsize(full_path)}"})
                    logging.warning(f"[RobustDownloader] Verification failed - size mismatch: {file_path}")
                else:
                    verified_count += 1
            
            logging.info(f"[RobustDownloader] Verification complete: {verified_count} files OK, {len(verify_errors)} errors")
            
            # Ensure verifying state shows for at least 1 second in the UI
            elapsed = time.time() - verify_start_time
            if elapsed < 1.0:
                time.sleep(1.0 - elapsed)
            
            self.game_info["downloadingData"]["verifying"] = False
            if verify_errors:
                self.game_info["downloadingData"]["verifyError"] = verify_errors
            safe_write_json(self.game_info_path, self.game_info)
            
            if not verify_errors:
                self._handle_post_download_behavior()
                if "downloadingData" in self.game_info:
                    del self.game_info["downloadingData"]
                    safe_write_json(self.game_info_path, self.game_info)
        except Exception as e:
            logging.error(f"[RobustDownloader] Verification error: {e}")
            handleerror(self.game_info, self.game_info_path, e)
    
    def _handle_post_download_behavior(self):
        """Handle post-download actions like lock, sleep, shutdown."""
        try:
            settings = load_settings()
            behavior = settings.get('behaviorAfterDownload', 'none')
            logging.info(f"[RobustDownloader] Post-download behavior: {behavior}")
            
            if behavior == 'lock':
                logging.info("[RobustDownloader] Locking computer")
                if sys.platform == 'win32':
                    os.system('rundll32.exe user32.dll,LockWorkStation')
                elif sys.platform == 'darwin':
                    os.system('/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend')
            elif behavior == 'sleep':
                logging.info("[RobustDownloader] Putting computer to sleep")
                if sys.platform == 'win32':
                    os.system('rundll32.exe powrprof.dll,SetSuspendState 0,1,0')
                elif sys.platform == 'darwin':
                    os.system('pmset sleepnow')
            elif behavior == 'shutdown':
                logging.info("[RobustDownloader] Shutting down computer")
                if sys.platform == 'win32':
                    os.system('shutdown /s /t 60 /c "Ascendara download complete - shutting down in 60 seconds"')
                elif sys.platform == 'darwin':
                    os.system('osascript -e "tell app \\"System Events\\" to shut down"')
            else:
                logging.info("[RobustDownloader] No post-download action required")
        except Exception as e:
            logging.error(f"[RobustDownloader] Post-download behavior error: {e}")


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
        downloader = RobustDownloader(
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
