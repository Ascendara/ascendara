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
    
    CHUNK_SIZE = 8 * 1024 * 1024  # 8MB chunks for better reliability
    PROGRESS_UPDATE_INTERVAL = 0.5  # Update progress every 0.5 seconds
    MAX_RETRIES_PER_CHUNK = 10
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
            
            if response.status_code == 405:
                # HEAD not allowed, try GET with Range header
                response = self.session.get(
                    self.url, 
                    stream=True, 
                    headers={"Range": "bytes=0-0"}, 
                    timeout=30
                )
                response.close()
                
                if 'Content-Range' in response.headers:
                    # Parse total size from Content-Range: bytes 0-0/total
                    content_range = response.headers['Content-Range']
                    if '/' in content_range:
                        self.total_size = int(content_range.split('/')[-1])
                        self.supports_range = True
            else:
                # Check Accept-Ranges header
                self.supports_range = response.headers.get('Accept-Ranges', '').lower() == 'bytes'
                
                if 'Content-Length' in response.headers:
                    self.total_size = int(response.headers['Content-Length'])
            
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
            progress = 0
            eta = 0
        
        # Format speed
        if speed >= 1024**2:
            speed_str = f"{speed/1024**2:.2f} MB/s"
        elif speed >= 1024:
            speed_str = f"{speed/1024:.2f} KB/s"
        else:
            speed_str = f"{speed:.2f} B/s"
        
        # Format ETA
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
        safe_write_json(self.game_info_path, self.game_info)
    
    def _download_chunk(self, start: int, end: Optional[int] = None) -> bytes:
        """Download a specific byte range with retries."""
        headers = {}
        if end:
            headers['Range'] = f'bytes={start}-{end}'
        else:
            headers['Range'] = f'bytes={start}-'
        
        retry_delay = self.RETRY_DELAY_BASE
        
        for attempt in range(self.MAX_RETRIES_PER_CHUNK):
            try:
                response = self.session.get(
                    self.url,
                    headers=headers,
                    stream=True,
                    timeout=(30, 120)
                )
                
                if response.status_code == 416:
                    # Range not satisfiable - file is complete
                    return b''
                
                response.raise_for_status()
                
                # Read the chunk
                chunk_data = b''
                for data in response.iter_content(chunk_size=1024 * 1024):
                    if data:
                        chunk_data += data
                
                return chunk_data
                
            except Exception as e:
                logging.warning(f"[ChunkedDownloader] Chunk download failed (attempt {attempt + 1}): {e}")
                
                if attempt < self.MAX_RETRIES_PER_CHUNK - 1:
                    # Update game info with retry status
                    self.game_info["downloadingData"]["retryAttempt"] = attempt + 1
                    safe_write_json(self.game_info_path, self.game_info)
                    
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 1.5, self.RETRY_DELAY_MAX)
                    
                    # Recreate session on connection errors
                    self.session.close()
                    self.session = create_robust_session()
                else:
                    raise
        
        raise Exception("Max retries exceeded for chunk download")
    
    def download(self) -> bool:
        """
        Download the file with chunked resume support.
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
            
            # Open file for writing/appending
            mode = 'ab' if self.downloaded_bytes > 0 else 'wb'
            
            with open(self.dest_path, mode) as f:
                while True:
                    # Calculate chunk range
                    start = self.downloaded_bytes
                    
                    if self.total_size:
                        end = min(start + self.CHUNK_SIZE - 1, self.total_size - 1)
                        
                        if start >= self.total_size:
                            break
                    else:
                        end = start + self.CHUNK_SIZE - 1
                    
                    # Download chunk
                    if self.supports_range:
                        chunk_data = self._download_chunk(start, end)
                    else:
                        # No range support - download entire file in one go
                        response = self.session.get(self.url, stream=True, timeout=(30, 300))
                        response.raise_for_status()
                        
                        for data in response.iter_content(chunk_size=1024 * 1024):
                            if data:
                                f.write(data)
                                self.downloaded_bytes += len(data)
                                self._update_progress()
                        break
                    
                    if not chunk_data:
                        # Empty response means we're done
                        break
                    
                    # Write chunk
                    f.write(chunk_data)
                    self.downloaded_bytes += len(chunk_data)
                    
                    # Update progress
                    self._update_progress()
                    
                    # Check if complete
                    if self.total_size and self.downloaded_bytes >= self.total_size:
                        break
            
            # Clear retry status
            if 'retryAttempt' in self.game_info.get('downloadingData', {}):
                del self.game_info['downloadingData']['retryAttempt']
                safe_write_json(self.game_info_path, self.game_info)
            
            # Final progress update
            self._update_progress(force=True)
            
            # Verify download
            final_size = os.path.getsize(self.dest_path)
            if self.total_size and final_size < self.total_size:
                logging.error(f"[ChunkedDownloader] Incomplete: {read_size(final_size)}/{read_size(self.total_size)}")
                return False
            
            logging.info(f"[ChunkedDownloader] Download complete: {read_size(final_size)}")
            return True
            
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
                    "timeUntilComplete": "0s"
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
        """Download from Buzzheavier with proper handling."""
        from bs4 import BeautifulSoup
        from tqdm import tqdm
        
        logging.info(f"[RobustDownloader] Buzzheavier download: {url}")
        
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
        
        file_response = session.get(final_url, stream=True)
        file_response.raise_for_status()
        
        total_size = int(file_response.headers.get('content-length', 0))
        dest_path = os.path.join(self.download_dir, title)
        
        start_time = time.time()
        downloaded = 0
        last_update_time = start_time
        
        with open(dest_path, 'wb') as f, tqdm(total=total_size, unit='B', unit_scale=True, desc=title) as progress_bar:
            for chunk in file_response.iter_content(chunk_size=1024):
                if chunk:
                    f.write(chunk)
                    progress_bar.update(len(chunk))
                    downloaded += len(chunk)
                    now = time.time()
                    elapsed = now - start_time
                    
                    if elapsed > 0 and (now - last_update_time > 0.5 or downloaded == total_size):
                        percent = (downloaded / total_size) * 100 if total_size else 0
                        speed = downloaded / elapsed if elapsed > 0 else 0
                        remaining = total_size - downloaded
                        eta = remaining / speed if speed > 0 else 0
                        
                        # Format speed
                        if speed >= 1024**2:
                            speed_str = f"{speed/1024**2:.2f} MB/s"
                        elif speed >= 1024:
                            speed_str = f"{speed/1024:.2f} KB/s"
                        else:
                            speed_str = f"{speed:.2f} B/s"
                        
                        # Format ETA
                        eta_int = int(eta)
                        if eta_int < 60:
                            eta_str = f"{eta_int}s"
                        elif eta_int < 3600:
                            eta_str = f"{eta_int // 60}m {eta_int % 60}s"
                        else:
                            eta_str = f"{eta_int // 3600}h {(eta_int % 3600) // 60}m"
                        
                        self.game_info["downloadingData"]["progressCompleted"] = f"{percent:.2f}"
                        self.game_info["downloadingData"]["progressDownloadSpeeds"] = speed_str
                        self.game_info["downloadingData"]["timeUntilComplete"] = eta_str
                        self.game_info["downloadingData"]["downloading"] = True
                        safe_write_json(self.game_info_path, self.game_info)
                        last_update_time = now
        
        session.close()
        logging.info(f"[Buzzheavier] Downloaded as: {dest_path}")
        
        # Update state and extract
        self.game_info["downloadingData"]["downloading"] = False
        self.game_info["downloadingData"]["progressCompleted"] = "100.00"
        safe_write_json(self.game_info_path, self.game_info)
        
        self._extract_files(dest_path)
        
        if self.withNotification:
            _launch_notification(self.withNotification, "Download Complete", f"Successfully downloaded {self.game}")
    
    def _extract_files(self, archive_path: Optional[str] = None):
        """Extract archive files and flatten nested directories."""
        self.game_info["downloadingData"]["extracting"] = True
        safe_write_json(self.game_info_path, self.game_info)
        
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
            rar_ref.extractall(self.download_dir)
            for rar_info in rar_ref.infolist():
                if not rar_info.filename.endswith('.url') and '_CommonRedist' not in rar_info.filename:
                    extracted_path = os.path.join(self.download_dir, rar_info.filename)
                    key = os.path.relpath(extracted_path, self.download_dir)
                    watching_data[key] = {"size": rar_info.file_size}
    
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
        try:
            with open(watching_path, 'r') as f:
                watching_data = json.load(f)
            
            verify_errors = []
            for file_path, file_info in watching_data.items():
                if os.path.basename(file_path) == 'filemap.ascendara.json':
                    continue
                
                full_path = os.path.join(self.download_dir, file_path)
                if not os.path.exists(full_path) or os.path.getsize(full_path) != file_info['size']:
                    verify_errors.append({"file": file_path, "error": "File missing or size mismatch"})
            
            self.game_info["downloadingData"]["verifying"] = False
            self.game_info["downloadingData"]["verifyError"] = verify_errors
            safe_write_json(self.game_info_path, self.game_info)
            
            if not verify_errors:
                self._handle_post_download_behavior()
                if "downloadingData" in self.game_info:
                    del self.game_info["downloadingData"]
                    safe_write_json(self.game_info_path, self.game_info)
        except Exception as e:
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
