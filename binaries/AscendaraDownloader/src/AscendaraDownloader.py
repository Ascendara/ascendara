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
from tempfile import NamedTemporaryFile
from argparse import ArgumentParser
from pySmartDL import SmartDL
import zipfile
import logging
import random
import requests
import os
import re
import zipfile
import atexit
import subprocess

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

def _launch_notification(theme, title, message):
    try:
        # Get the directory where the current executable is located
        exe_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
        notification_helper_path = os.path.join(exe_dir, 'AscendaraNotificationHelper.exe')
        logging.debug(f"Looking for notification helper at: {notification_helper_path}")
        
        if os.path.exists(notification_helper_path):
            logging.debug(f"Launching notification helper with theme={theme}, title='{title}', message='{message}'")
            # Use subprocess.Popen with CREATE_NO_WINDOW flag to hide console
            subprocess.Popen(
                [notification_helper_path, "--theme", theme, "--title", title, "--message", message],
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            logging.debug("Notification helper process started successfully")
        else:
            logging.error(f"Notification helper not found at: {notification_helper_path}")
    except Exception as e:
        logging.error(f"Failed to launch notification helper: {e}")

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
logging.info(f"[AscendaraDownloader] Logging to {LOG_PATH}")


def read_size(size, decimal_places=2):
    if size == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    i = 0
    while size >= 1024 and i < len(units) - 1:
        size /= 1024.0
        i += 1
    return f"{size:.{decimal_places}f} {units[i]}"

def sanitize_folder_name(name):
    valid_chars = "-_.() %s%s" % (string.ascii_letters, string.digits)
    sanitized_name = ''.join(c for c in name if c in valid_chars)
    return sanitized_name

def safe_write_json(filepath, data):
    temp_dir = os.path.dirname(filepath)
    temp_file_path = None
    retry_attempts = 5
    last_error = None
    try:
        with NamedTemporaryFile('w', delete=False, dir=temp_dir) as temp_file:
            json.dump(data, temp_file, indent=4)
            temp_file_path = temp_file.name
        for attempt in range(retry_attempts):
            try:
                os.replace(temp_file_path, filepath)
                return
            except PermissionError as e:
                last_error = e
                wait_time = 0.5 * (2 ** attempt) + random.uniform(0, 0.2)
                time.sleep(wait_time)
                if attempt == retry_attempts - 1:
                    backup_path = filepath + ".backup.json"
                    try:
                        with open(backup_path, 'w', encoding='utf-8') as backup:
                            json.dump(data, backup, indent=4)
                        logging.error(f"safe_write_json: Could not write to {filepath} due to PermissionError. Wrote backup to {backup_path}. Error: {e}")
                    except Exception as backup_err:
                        logging.error(f"safe_write_json: Could not write backup JSON either: {backup_err}")
                    try:
                        if os.path.exists(filepath):
                            with open(filepath, 'r+', encoding='utf-8') as f:
                                try:
                                    existing = json.load(f)
                                except Exception:
                                    existing = {}
                                existing['downloadingData'] = existing.get('downloadingData', {})
                                existing['downloadingData']['error'] = True
                                existing['downloadingData']['message'] = f"PermissionError: {e}"
                                f.seek(0)
                                json.dump(existing, f, indent=4)
                                f.truncate()
                    except Exception:
                        pass
                    break
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

def handleerror(game_info, game_info_path, e):
    game_info['online'] = ""
    game_info['dlc'] = ""
    game_info['isRunning'] = False
    game_info['version'] = ""
    game_info['executable'] = ""
    if 'downloadingData' in game_info:
        game_info['downloadingData'] = {
            "error": True,
            "message": str(e)
        }
    else:
        import logging
        logging.error(f"[handleerror] Called but 'downloadingData' is already missing. Exception: {e}")
    safe_write_json(game_info_path, game_info)

    safe_write_json(game_info_path, game_info)

# Downloader class for managing downloads and extraction
class SmartDLDownloader:
    def __init__(self, game, online, dlc, isVr, updateFlow, version, size, download_dir):
        self.game = game
        self.online = online
        self.dlc = dlc
        self.isVr = isVr
        self.updateFlow = updateFlow
        self.version = version
        self.size = size
        self.download_dir = os.path.join(download_dir, sanitize_folder_name(game))
        os.makedirs(self.download_dir, exist_ok=True)
        self.game_info_path = os.path.join(self.download_dir, f"{sanitize_folder_name(game)}.ascendara.json")
        # Initialize or update the game info JSON file for tracking download state
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

    VALID_BUZZHEAVIER_DOMAINS = [
        'buzzheavier.com',
        'bzzhr.co',
        'fuckingfast.net',
        'fuckingfast.co'
    ]

    def download(self, url, withNotification=None):
        try:
            # Buzzheavier detection
            if any(domain in url for domain in self.VALID_BUZZHEAVIER_DOMAINS):
                try:
                    self._download_buzzheavier(url)
                    if withNotification:
                        _launch_notification(
                            withNotification,
                            "Download Complete",
                            f"Successfully downloaded from buzzheavier: {self.game_info['game']}"
                        )
                    # Only update downloadingData if it still exists (i.e., download did not fully complete and trigger deletion)
                    if "downloadingData" in self.game_info:
                        self.game_info["downloadingData"]["downloading"] = False
                        self.game_info["downloadingData"]["progressCompleted"] = "100.00"
                        self.game_info["downloadingData"]["progressDownloadSpeeds"] = "0.00 KB/s"
                        self.game_info["downloadingData"]["timeUntilComplete"] = "0s"
                        safe_write_json(self.game_info_path, self.game_info)
                except Exception as e:
                    logging.error(f"[AscendaraDownloader] Buzzheavier download failed: {e}")
                    handleerror(self.game_info, self.game_info_path, e)
                    if withNotification:
                        _launch_notification(
                            withNotification,
                            "Download Error",
                            f"Error downloading {self.game_info['game']}: {e}"
                        )
                return

            self.game_info["downloadingData"]["downloading"] = True
            safe_write_json(self.game_info_path, self.game_info)
            base_name = os.path.basename(url.split('?')[0])
            dest = os.path.join(self.download_dir, base_name)
            # Notification: Download Started (GoFile style)
            if withNotification:
                _launch_notification(
                    withNotification,
                    "Download Started",
                    f"Starting download for {self.game_info['game']}"
                )
            try:
                head = requests.head(url, allow_redirects=True, timeout=10)
                cd = head.headers.get('content-disposition')
                if cd and 'filename=' in cd:
                    fname = re.findall('filename="?([^";]+)', cd)
                    if fname:
                        base_name = fname[0]
                        dest = os.path.join(self.download_dir, base_name)
            except Exception:
                pass  # If anything fails, fallback to base_name from URL
            logging.info(f"[AscendaraDownloader] Download destination: {dest}")

            try:
                resp = requests.head(url, allow_redirects=True)
                size_bytes = None
                if 'Content-Length' in resp.headers:
                    size_bytes = int(resp.headers['Content-Length'])
                elif resp.status_code == 405:  # HEAD not allowed, try GET with Range
                    resp = requests.get(url, stream=True, headers={"Range": "bytes=0-0"})
                    if 'Content-Range' in resp.headers:
                        size_bytes = int(resp.headers['Content-Range'].split('/')[-1])
                if size_bytes:
                    def _read_size(size, decimal_places=2):
                        if size == 0:
                            return "0 B"
                        units = ["B", "KB", "MB", "GB", "TB", "PB"]
                        i = 0
                        while size >= 1024 and i < len(units) - 1:
                            size /= 1024.0
                            i += 1
                        return f"{size:.{decimal_places}f} {units[i]}"
                    self.game_info['size'] = _read_size(size_bytes)
                    safe_write_json(self.game_info_path, self.game_info)
            except Exception as e:
                logging.warning(f"[AscendaraDownloader] Could not determine remote file size: {e}")

            max_speed = 0
            threads = None
            try:
                settings_path = None
                if sys.platform == 'win32':
                    appdata = os.environ.get('APPDATA')
                    if appdata:
                        candidate = os.path.join(appdata, 'Electron', 'ascendarasettings.json')
                        if os.path.exists(candidate):
                            settings_path = candidate
                elif sys.platform == 'darwin':
                    user_data_dir = os.path.expanduser('~/Library/Application Support/ascendara')
                    candidate = os.path.join(user_data_dir, 'ascendarasettings.json')
                    if os.path.exists(candidate):
                        settings_path = candidate
                if settings_path and os.path.exists(settings_path):
                    with open(settings_path, 'r', encoding='utf-8') as f:
                        settings = json.load(f)
                        try:
                            max_speed = int(settings.get('downloadLimit', 0))
                        except Exception:
                            max_speed = 0
                        try:
                            threads = int(settings.get('threadCount', 0)) or None
                        except Exception:
                            threads = None
                logging.info(f"[AscendaraDownloader] Download settings: max_speed={max_speed}, threads={threads}")
            except Exception as e:
                logging.error(f"[AscendaraDownloader] Could not read ascendara settings: {e}")
                max_speed = 0
                threads = None

            request_args = {
                'headers': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': '*/*',
                    'Accept-Encoding': 'identity',
                    'Connection': 'keep-alive',
                }
            }
            download_timeout = 600  # seconds - longer timeout for large files

            # Retry logic for handling IncompleteRead and connection errors
            max_retries = 10  # Increased retries for large files
            retry_delay = 5  # seconds between retries (start lower)
            download_successful = False
            last_error = None
            
            # Track consecutive failures to detect persistent issues
            consecutive_failures = 0
            max_consecutive_failures = 3
            
            # Track if we should use resumable fallback (after SmartDL fails)
            use_resumable_fallback = False
            smartdl_failures = 0

            for attempt in range(max_retries):
                try:
                    if attempt > 0:
                        logging.info(f"[AscendaraDownloader] Retry attempt {attempt}/{max_retries-1} after {retry_delay}s delay...")
                        time.sleep(retry_delay)
                        retry_delay = min(retry_delay * 1.5, 120)  # Exponential backoff, max 120s
                    
                    # After 2 SmartDL failures with IncompleteRead, switch to resumable fallback
                    if use_resumable_fallback or smartdl_failures >= 2:
                        logging.info(f"[AscendaraDownloader] Using resumable download fallback for better reliability")
                        download_successful = self._resumable_download(
                            url, dest, size_bytes, max_speed, 
                            request_args['headers'], max_retries - attempt
                        )
                        if download_successful:
                            break
                        else:
                            continue
                    
                    # Clean up any partial SmartDL temp files before retry (but keep partial dest file for resumable)
                    if attempt > 0:
                        try:
                            for f in os.listdir(self.download_dir):
                                if f.endswith('.000') or f.endswith('.001') or '.rar.0' in f or '.zip.0' in f:
                                    partial_path = os.path.join(self.download_dir, f)
                                    logging.info(f"[AscendaraDownloader] Cleaning up partial file: {partial_path}")
                                    os.remove(partial_path)
                        except Exception as cleanup_err:
                            logging.warning(f"[AscendaraDownloader] Could not clean up partial files: {cleanup_err}")

                    # Create SmartDL with thread count
                    # Reduce threads on retry to improve stability for large files
                    current_threads = threads if threads and threads > 0 else 5  # Default 5 threads
                    if attempt > 0:
                        current_threads = max(1, current_threads // (attempt + 1))  # Progressively reduce
                        logging.info(f"[AscendaraDownloader] Using {current_threads} thread(s) for retry stability")
                    
                    obj = SmartDL(url, dest, progress_bar=True, timeout=download_timeout, 
                                  request_args=request_args, threads=current_threads)
                    if max_speed and max_speed > 0:
                        obj.set_speed(max_speed)
                    
                    obj.start(blocking=False)
                    
                    # Track progress to detect stalls
                    last_progress = 0
                    stall_count = 0
                    max_stalls = 60  # 30 seconds of no progress (0.5s * 60)

                    while not obj.isFinished():
                        progress = obj.get_progress() * 100
                        speed = obj.get_speed(human=True)
                        eta = obj.get_eta(human=True)
                        
                        # Detect stalls
                        if progress == last_progress and progress < 99.9:
                            stall_count += 1
                            if stall_count >= max_stalls:
                                logging.warning(f"[AscendaraDownloader] Download stalled at {progress:.2f}%, forcing retry")
                                try:
                                    obj.stop()
                                except:
                                    pass
                                raise Exception("Download stalled - no progress for 30 seconds")
                        else:
                            stall_count = 0
                            last_progress = progress
                        
                        self.game_info["downloadingData"]["progressCompleted"] = f"{progress:.2f}"
                        self.game_info["downloadingData"]["progressDownloadSpeeds"] = speed
                        self.game_info["downloadingData"]["timeUntilComplete"] = eta
                        if attempt > 0:
                            self.game_info["downloadingData"]["retryAttempt"] = attempt
                        safe_write_json(self.game_info_path, self.game_info)
                        time.sleep(0.5)

                    if obj.isSuccessful():
                        download_successful = True
                        consecutive_failures = 0
                        break
                    else:
                        errors = obj.get_errors()
                        last_error = str(errors)
                        consecutive_failures += 1
                        
                        # Check if this is a retryable error
                        retryable_errors = ['IncompleteRead', 'Connection broken', 'ConnectionResetError', 
                                          'timeout', 'Timeout', 'ChunkedEncodingError', 'RemoteDisconnected',
                                          'ConnectionError', 'ReadTimeoutError', 'ProtocolError']
                        if any(err_type in last_error for err_type in retryable_errors):
                            logging.warning(f"[AscendaraDownloader] Retryable error on attempt {attempt+1}: {last_error}")
                            smartdl_failures += 1
                            
                            # Switch to resumable fallback after repeated IncompleteRead errors
                            if 'IncompleteRead' in last_error or 'Connection broken' in last_error:
                                if smartdl_failures >= 2:
                                    logging.info(f"[AscendaraDownloader] Switching to resumable fallback after {smartdl_failures} SmartDL failures")
                                    use_resumable_fallback = True
                            
                            # Log consecutive failures for debugging
                            if consecutive_failures >= max_consecutive_failures:
                                logging.warning(f"[AscendaraDownloader] {consecutive_failures} consecutive failures detected")
                            continue
                        else:
                            # Non-retryable error, fail immediately
                            logging.error(f"[AscendaraDownloader] Non-retryable error: {last_error}")
                            break

                except Exception as retry_exc:
                    last_error = str(retry_exc)
                    consecutive_failures += 1
                    retryable_errors = ['IncompleteRead', 'Connection broken', 'ConnectionResetError', 
                                      'timeout', 'Timeout', 'ChunkedEncodingError', 'RemoteDisconnected',
                                      'ConnectionError', 'ReadTimeoutError', 'ProtocolError', 'stalled']
                    if any(err_type in last_error for err_type in retryable_errors):
                        logging.warning(f"[AscendaraDownloader] Retryable exception on attempt {attempt+1}: {retry_exc}")
                        smartdl_failures += 1
                        
                        # Switch to resumable fallback after repeated failures
                        if 'IncompleteRead' in last_error or 'Connection broken' in last_error:
                            if smartdl_failures >= 2:
                                logging.info(f"[AscendaraDownloader] Switching to resumable fallback after {smartdl_failures} SmartDL failures")
                                use_resumable_fallback = True
                        
                        # Log consecutive failures for debugging
                        if consecutive_failures >= max_consecutive_failures:
                            logging.warning(f"[AscendaraDownloader] {consecutive_failures} consecutive failures detected")
                        continue
                    else:
                        raise  # Re-raise non-retryable exceptions

            # Clean up retry attempt from status
            if 'retryAttempt' in self.game_info.get('downloadingData', {}):
                del self.game_info['downloadingData']['retryAttempt']

            if download_successful:
                logging.info(f"[AscendaraDownloader] Download completed successfully.")
                if withNotification:
                    _launch_notification(
                        withNotification,
                        "Download Complete",
                        f"Successfully downloaded and extracted {self.game_info['game']}"
                    )
                self.game_info["downloadingData"]["downloading"] = False
                self.game_info["downloadingData"]["progressCompleted"] = "100.00"
                self.game_info["downloadingData"]["progressDownloadSpeeds"] = "0.00 KB/s"
                self.game_info["downloadingData"]["timeUntilComplete"] = "0s"
                safe_write_json(self.game_info_path, self.game_info)

                detected = self.detect_file_type(dest)
                if isinstance(detected, tuple):
                    filetype, hexsig = detected
                else:
                    filetype = detected
                    hexsig = None
                logging.info(f"[AscendaraDownloader] Detected file type: {filetype}{' (magic: '+hexsig+')' if hexsig else ''}")

                # Rename file if extension is wrong
                ext_map = {'zip': '.zip', 'rar': '.rar', '7z': '.7z', 'exe': '.exe'}
                correct_ext = ext_map.get(filetype)
                if correct_ext and not dest.endswith(correct_ext):
                    new_dest = dest + correct_ext if not os.path.splitext(dest)[1] else dest[:-len(os.path.splitext(dest)[1])] + correct_ext
                    logging.info(f"[AscendaraDownloader] Renaming file to: {new_dest}")
                    os.rename(dest, new_dest)
                    # Remove the old file if it still exists and is different
                    if os.path.exists(dest) and dest != new_dest:
                        try:
                            os.remove(dest)
                            logging.info(f"[AscendaraDownloader] Removed old file: {dest}")
                        except Exception as e:
                            logging.error(f"[AscendaraDownloader] Warning: Could not remove old file: {e}")
                    dest = new_dest
                elif filetype == 'unknown':
                    logging.info(f"[AscendaraDownloader] Unknown file type. Magic number: {hexsig}")

                self._extract_files(dest)
            else:
                logging.error(f"[AscendaraDownloader] Download failed after {max_retries} attempts: {last_error}")
                if withNotification:
                    _launch_notification(
                        withNotification,
                        "Download Error",
                        f"Error downloading {self.game_info['game']}: {last_error}"
                    )
                raise Exception(str(last_error))
        except Exception as e:
            # Detect SSL version error and set provider_blocked_error
            err_str = str(e)
            if (
                'SSL: WRONG_VERSION_NUMBER' in err_str or
                'ssl.SSLError' in err_str or
                'wrong version number' in err_str or
                'ssl.c:1000' in err_str or
                'WinError 10054' in err_str or
                'forcibly closed by the remote host' in err_str or
                'ConnectionResetError' in err_str
            ):
                logging.error(f"[AscendaraDownloader] Provider blocked, SSL, or connection reset error detected: {e}")
                handleerror(self.game_info, self.game_info_path, 'provider_blocked_error')
            else:
                logging.error(f"[AscendaraDownloader] Error in download method: {e}")
                handleerror(self.game_info, self.game_info_path, e)
            # Notification: Download Error (exception)
            if withNotification:
                _launch_notification(
                    withNotification,
                    "Download Error",
                    f"Error downloading {self.game_info['game']}: {e}"
                )
            # Do not re-raise to prevent crash
            return

    @staticmethod
    def _resolve_buzzheavier_url(input_str):
        input_str = input_str.strip()
        for domain in SmartDLDownloader.VALID_BUZZHEAVIER_DOMAINS:
            if domain in input_str:
                return input_str
        raise ValueError(f"URL domain not recognized: {input_str}")

    def _download_buzzheavier(self, input_str):
        import requests
        from bs4 import BeautifulSoup
        from tqdm import tqdm
        url = self._resolve_buzzheavier_url(input_str)
        response = requests.get(url)
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
        head_response = requests.head(download_url, headers=headers, allow_redirects=False)
        hx_redirect = head_response.headers.get('hx-redirect')
        if not hx_redirect:
            raise Exception("Download link not found. Is this a directory?")
        logging.info(f"[Buzzheavier] Download link: {hx_redirect}")
        domain = url.split('/')[2]
        final_url = f'https://{domain}' + hx_redirect if hx_redirect.startswith('/dl/') else hx_redirect
        file_response = requests.get(final_url, stream=True)
        file_response.raise_for_status()
        total_size = int(file_response.headers.get('content-length', 0))
        block_size = 1024
        dest_path = os.path.join(self.download_dir, title)
        start_time = time.time()
        downloaded = 0
        last_update_time = start_time
        speed = 0
        with open(dest_path, 'wb') as f, tqdm(
            total=total_size, unit='B', unit_scale=True, desc=title
        ) as progress_bar:
            for chunk in file_response.iter_content(chunk_size=block_size):
                if chunk:
                    f.write(chunk)
                    progress_bar.update(len(chunk))
                    downloaded += len(chunk)
                    now = time.time()
                    elapsed = now - start_time
                    # Update every 0.5s or on last chunk
                    if elapsed > 0 and (now - last_update_time > 0.5 or downloaded == total_size):
                        percent = (downloaded / total_size) * 100 if total_size else 0
                        speed = downloaded / elapsed if elapsed > 0 else 0
                        remaining = total_size - downloaded
                        eta = remaining / speed if speed > 0 else 0
                        def format_speed(bytes_per_sec):
                            if bytes_per_sec >= 1024**3:
                                return f"{bytes_per_sec/1024**3:.2f} GB/s"
                            elif bytes_per_sec >= 1024**2:
                                return f"{bytes_per_sec/1024**2:.2f} MB/s"
                            elif bytes_per_sec >= 1024:
                                return f"{bytes_per_sec/1024:.2f} KB/s"
                            else:
                                return f"{bytes_per_sec:.2f} B/s"
                        def format_eta(seconds):
                            seconds = int(seconds)
                            if seconds < 60:
                                return f"{seconds} seconds"
                            minutes = seconds // 60
                            sec = seconds % 60
                            if minutes < 60:
                                return f"{minutes} minute{'s' if minutes != 1 else ''}, {sec} second{'s' if sec != 1 else ''}"
                            hours = minutes // 60
                            min_left = minutes % 60
                            return f"{hours} hour{'s' if hours != 1 else ''}, {min_left} minute{'s' if min_left != 1 else ''}"
                        self.game_info["downloadingData"]["progressCompleted"] = f"{percent:.2f}"
                        self.game_info["downloadingData"]["progressDownloadSpeeds"] = format_speed(speed)
                        self.game_info["downloadingData"]["timeUntilComplete"] = format_eta(eta)
                        self.game_info["downloadingData"]["downloading"] = True
                        safe_write_json(self.game_info_path, self.game_info)
                        last_update_time = now

        logging.info(f"[Buzzheavier] Downloaded as: {dest_path}")
        self._extract_files(dest_path)

    def _resumable_download(self, url, dest, total_size, max_speed, headers, max_retries):
        """
        Resumable download fallback using requests with Range headers.
        This is more reliable for large files when SmartDL fails with IncompleteRead errors.
        """
        logging.info(f"[AscendaraDownloader] Starting resumable download to: {dest}")
        
        # Check if we have a partial file to resume from
        downloaded = 0
        if os.path.exists(dest):
            downloaded = os.path.getsize(dest)
            logging.info(f"[AscendaraDownloader] Resuming from {read_size(downloaded)} ({downloaded} bytes)")
        
        # If we don't know total size, try to get it
        if not total_size:
            try:
                resp = requests.head(url, allow_redirects=True, timeout=30)
                if 'Content-Length' in resp.headers:
                    total_size = int(resp.headers['Content-Length'])
                    logging.info(f"[AscendaraDownloader] Total file size: {read_size(total_size)}")
            except Exception as e:
                logging.warning(f"[AscendaraDownloader] Could not determine file size: {e}")
        
        # Check if server supports range requests
        supports_range = False
        try:
            test_resp = requests.head(url, allow_redirects=True, timeout=30)
            accept_ranges = test_resp.headers.get('Accept-Ranges', '')
            if accept_ranges == 'bytes' or 'Content-Range' in test_resp.headers:
                supports_range = True
            logging.info(f"[AscendaraDownloader] Server supports range requests: {supports_range}")
        except Exception as e:
            logging.warning(f"[AscendaraDownloader] Could not check range support: {e}")
        
        # If we have a partial file but server doesn't support range, start fresh
        if downloaded > 0 and not supports_range:
            logging.warning(f"[AscendaraDownloader] Server doesn't support range requests, starting fresh")
            downloaded = 0
            if os.path.exists(dest):
                os.remove(dest)
        
        # If file is already complete, return success
        if total_size and downloaded >= total_size:
            logging.info(f"[AscendaraDownloader] File already complete")
            return True
        
        chunk_size = 1024 * 1024  # 1 MB chunks for better progress tracking
        retry_count = 0
        max_chunk_retries = 5  # Retries per chunk
        
        while retry_count < max_retries:
            try:
                # Build request headers with range if resuming
                req_headers = headers.copy()
                if downloaded > 0 and supports_range:
                    req_headers['Range'] = f'bytes={downloaded}-'
                    logging.info(f"[AscendaraDownloader] Requesting range: bytes={downloaded}-")
                
                # Use a session for connection pooling
                session = requests.Session()
                session.headers.update(req_headers)
                
                # Stream the download with timeout
                response = session.get(url, stream=True, timeout=(30, 60))  # (connect, read) timeouts
                
                # Check response status
                if response.status_code == 416:  # Range not satisfiable - file complete
                    logging.info(f"[AscendaraDownloader] Server returned 416 - file appears complete")
                    return True
                elif response.status_code not in (200, 206):
                    logging.error(f"[AscendaraDownloader] Unexpected status code: {response.status_code}")
                    retry_count += 1
                    time.sleep(5)
                    continue
                
                # Get content length from response
                content_length = response.headers.get('Content-Length')
                if content_length:
                    remaining = int(content_length)
                    if response.status_code == 200:  # Full content, not partial
                        total_size = remaining
                        downloaded = 0  # Reset if server sent full content
                
                # Open file in append mode if resuming, write mode otherwise
                mode = 'ab' if downloaded > 0 and response.status_code == 206 else 'wb'
                if mode == 'wb':
                    downloaded = 0  # Reset counter if starting fresh
                
                start_time = time.time()
                last_update_time = start_time
                chunk_retry_count = 0
                
                with open(dest, mode) as f:
                    for chunk in response.iter_content(chunk_size=chunk_size):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            chunk_retry_count = 0  # Reset on successful chunk
                            
                            # Apply speed limit if set
                            if max_speed and max_speed > 0:
                                elapsed = time.time() - start_time
                                expected_time = downloaded / max_speed
                                if expected_time > elapsed:
                                    time.sleep(expected_time - elapsed)
                            
                            # Update progress every 0.5 seconds
                            now = time.time()
                            if now - last_update_time >= 0.5:
                                elapsed = now - start_time
                                speed = downloaded / elapsed if elapsed > 0 else 0
                                
                                if total_size and total_size > 0:
                                    progress = (downloaded / total_size) * 100
                                    remaining_bytes = total_size - downloaded
                                    eta = remaining_bytes / speed if speed > 0 else 0
                                else:
                                    progress = 0
                                    eta = 0
                                
                                # Format speed
                                if speed >= 1024**3:
                                    speed_str = f"{speed/1024**3:.2f} GB/s"
                                elif speed >= 1024**2:
                                    speed_str = f"{speed/1024**2:.2f} MB/s"
                                elif speed >= 1024:
                                    speed_str = f"{speed/1024:.2f} KB/s"
                                else:
                                    speed_str = f"{speed:.2f} B/s"
                                
                                # Format ETA
                                eta_int = int(eta)
                                if eta_int < 60:
                                    eta_str = f"{eta_int} seconds"
                                elif eta_int < 3600:
                                    eta_str = f"{eta_int // 60} minute(s), {eta_int % 60} second(s)"
                                else:
                                    eta_str = f"{eta_int // 3600} hour(s), {(eta_int % 3600) // 60} minute(s)"
                                
                                self.game_info["downloadingData"]["progressCompleted"] = f"{progress:.2f}"
                                self.game_info["downloadingData"]["progressDownloadSpeeds"] = speed_str
                                self.game_info["downloadingData"]["timeUntilComplete"] = eta_str
                                self.game_info["downloadingData"]["resumable"] = True
                                safe_write_json(self.game_info_path, self.game_info)
                                last_update_time = now
                                
                                logging.debug(f"[AscendaraDownloader] Progress: {progress:.2f}% at {speed_str}")
                
                # Check if download is complete
                if total_size and downloaded >= total_size:
                    logging.info(f"[AscendaraDownloader] Resumable download completed: {read_size(downloaded)}")
                    # Clean up resumable flag
                    if 'resumable' in self.game_info.get('downloadingData', {}):
                        del self.game_info['downloadingData']['resumable']
                    return True
                elif not total_size:
                    # If we don't know total size, assume success if we got data
                    logging.info(f"[AscendaraDownloader] Download completed (unknown total size): {read_size(downloaded)}")
                    return True
                else:
                    # Incomplete - will retry
                    logging.warning(f"[AscendaraDownloader] Download incomplete: {downloaded}/{total_size} bytes")
                    retry_count += 1
                    time.sleep(5)
                    
            except requests.exceptions.ChunkedEncodingError as e:
                logging.warning(f"[AscendaraDownloader] ChunkedEncodingError at {read_size(downloaded)}: {e}")
                retry_count += 1
                time.sleep(5)
            except requests.exceptions.ConnectionError as e:
                logging.warning(f"[AscendaraDownloader] ConnectionError at {read_size(downloaded)}: {e}")
                retry_count += 1
                time.sleep(10)
            except requests.exceptions.Timeout as e:
                logging.warning(f"[AscendaraDownloader] Timeout at {read_size(downloaded)}: {e}")
                retry_count += 1
                time.sleep(5)
            except Exception as e:
                error_str = str(e)
                if 'IncompleteRead' in error_str or 'Connection broken' in error_str:
                    logging.warning(f"[AscendaraDownloader] Connection issue at {read_size(downloaded)}: {e}")
                    retry_count += 1
                    time.sleep(5)
                else:
                    logging.error(f"[AscendaraDownloader] Unexpected error in resumable download: {e}")
                    retry_count += 1
                    time.sleep(5)
        
        logging.error(f"[AscendaraDownloader] Resumable download failed after {max_retries} retries")
        return False

    def _handle_post_download_behavior(self):
        try:
            # Get the settings path
            settings_path = None
            if sys.platform == 'win32':
                appdata = os.environ.get('APPDATA')
                if appdata:
                    candidate = os.path.join(appdata, 'Electron', 'ascendarasettings.json')
                    if os.path.exists(candidate):
                        settings_path = candidate
            elif sys.platform == 'darwin':
                user_data_dir = os.path.expanduser('~/Library/Application Support/ascendara')
                candidate = os.path.join(user_data_dir, 'ascendarasettings.json')
                if os.path.exists(candidate):
                    settings_path = candidate
            
            if settings_path and os.path.exists(settings_path):
                with open(settings_path, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                    behavior = settings.get('behaviorAfterDownload', 'none')
                    logging.info(f"[AscendaraDownloader] Post-download behavior: {behavior}")
                    
                    if behavior == 'lock':
                        logging.info("[AscendaraDownloader] Locking computer as requested in settings")
                        if sys.platform == 'win32':
                            os.system('rundll32.exe user32.dll,LockWorkStation')
                        elif sys.platform == 'darwin':
                            os.system('/System/Library/CoreServices/Menu\ Extras/User.menu/Contents/Resources/CGSession -suspend')
                    elif behavior == 'sleep':
                        logging.info("[AscendaraDownloader] Putting computer to sleep as requested in settings")
                        if sys.platform == 'win32':
                            os.system('rundll32.exe powrprof.dll,SetSuspendState 0,1,0')
                        elif sys.platform == 'darwin':
                            os.system('pmset sleepnow')
                    elif behavior == 'shutdown':
                        logging.info("[AscendaraDownloader] Shutting down computer as requested in settings")
                        if sys.platform == 'win32':
                            os.system('shutdown /s /t 60 /c "Ascendara download complete - shutting down in 60 seconds"')
                        elif sys.platform == 'darwin':
                            os.system('osascript -e "tell app \"System Events\" to shut down"')
                    else:  # 'none' or any other value
                        logging.info("[AscendaraDownloader] No post-download action required")
        except Exception as e:
            logging.error(f"[AscendaraDownloader] Error in post-download behavior handling: {e}")

    @staticmethod
    def detect_file_type(filepath):
        with open(filepath, 'rb') as f:
            sig = f.read(8)
        if sig.startswith(b'PK\x03\x04') or sig.startswith(b'PK\x05\x06') or sig.startswith(b'PK\x07\x08'):
            return 'zip'
        elif sig.startswith(b'Rar!\x1A\x07\x00') or sig.startswith(b'Rar!\x1A\x07\x01\x00'):
            return 'rar'
        elif sig.startswith(b'7z\xBC\xAF\x27\x1C'):
            return '7z'
        elif sig.startswith(b'MZ'):
            return 'exe'
        else:
            return 'unknown', sig.hex()

    def _extract_files(self, _archive_path=None):
        self.game_info["downloadingData"]["extracting"] = True
        safe_write_json(self.game_info_path, self.game_info)
        watching_path = os.path.join(self.download_dir, "filemap.ascendara.json")
        watching_data = {}
        archive_exts = {'.rar', '.zip'}
        extracted = False
        
        # If a specific archive path is provided, use it directly
        if _archive_path and os.path.exists(_archive_path):
            archives_to_process = [_archive_path]
            logging.info(f"[AscendaraDownloader] Extracting specific archive: {_archive_path}")
        else:
            # Otherwise, scan the directory for archives
            logging.info(f"[AscendaraDownloader] Scanning for archives to extract in: {self.download_dir}")
            archives_to_process = []
            for root, _, files in os.walk(self.download_dir):
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in archive_exts:
                        archives_to_process.append(os.path.join(root, file))
        
        # Keep processing archives until no more are found (handles nested archives)
        processed_archives = set()
        
        while archives_to_process:
            current_archive = archives_to_process.pop(0)
            
            # Skip if we've already processed this archive
            if current_archive in processed_archives:
                continue
                
            processed_archives.add(current_archive)
            ext = os.path.splitext(current_archive)[1].lower()
            logging.info(f"[AscendaraDownloader] Extracting {current_archive}")
            try:
                if ext == '.zip':
                    # First validate the ZIP file
                    try:
                        with zipfile.ZipFile(current_archive, 'r') as test_zip:
                            test_zip.testzip()
                        logging.info(f"[AscendaraDownloader] ZIP file validation passed: {current_archive}")
                    except zipfile.BadZipFile as e:
                        logging.error(f"[AscendaraDownloader] Invalid ZIP file: {current_archive} - {e}")
                        continue
                    except Exception as e:
                        logging.error(f"[AscendaraDownloader] ZIP validation error: {current_archive} - {e}")
                        continue
                    
                    with zipfile.ZipFile(current_archive, 'r') as zip_ref:
                        zip_contents = zip_ref.infolist()
                        logging.info(f"[AscendaraDownloader] ZIP contains {len(zip_contents)} files")
                        extracted_count = 0
                        for zip_info in zip_contents:
                            if not zip_info.filename.endswith('.url') and '_CommonRedist' not in zip_info.filename:
                                extracted_path = os.path.join(self.download_dir, zip_info.filename)
                                logging.info(f"[AscendaraDownloader] Extracting file: {zip_info.filename} -> {extracted_path}")
                                try:
                                    zip_ref.extract(zip_info, self.download_dir)
                                    if os.path.exists(extracted_path):
                                        actual_size = os.path.getsize(extracted_path)
                                        logging.info(f"[AscendaraDownloader] Successfully extracted: {zip_info.filename} (size: {actual_size} bytes)")
                                        extracted_count += 1
                                    else:
                                        logging.error(f"[AscendaraDownloader] File not found after extraction: {extracted_path}")
                                    key = f"{os.path.relpath(extracted_path, self.download_dir)}"
                                    watching_data[key] = {"size": zip_info.file_size}
                                except Exception as extract_error:
                                    logging.error(f"[AscendaraDownloader] Failed to extract {zip_info.filename}: {extract_error}")
                            else:
                                logging.info(f"[AscendaraDownloader] Skipping file: {zip_info.filename}")
                        logging.info(f"[AscendaraDownloader] Extraction complete: {extracted_count} files extracted")
                    # Delete the original .zip file after successful extraction
                    try:
                        os.remove(current_archive)
                        logging.info(f"[AscendaraDownloader] Deleted archive after extraction: {current_archive}")
                    except Exception as e:
                        logging.warning(f"[AscendaraDownloader] Could not delete archive {current_archive}: {e}")
                elif ext == '.rar':
                    try:
                        from unrar import rarfile
                    except ImportError:
                        logging.error("[AscendaraDownloader] Python module 'unrar' is not installed. Please install it with 'pip install unrar' to extract .rar files.")
                        continue
                    try:
                        with rarfile.RarFile(current_archive) as rar_ref:
                            rar_ref.extractall(self.download_dir)
                            for rar_info in rar_ref.infolist():
                                if not rar_info.filename.endswith('.url') and '_CommonRedist' not in rar_info.filename:
                                    extracted_path = os.path.join(self.download_dir, rar_info.filename)
                                    key = f"{os.path.relpath(extracted_path, self.download_dir)}"
                                    watching_data[key] = {"size": rar_info.file_size}
                        # Delete the original .rar file after successful extraction
                        try:
                            os.remove(current_archive)
                            logging.info(f"[AscendaraDownloader] Deleted archive after extraction: {current_archive}")
                        except Exception as e:
                            logging.warning(f"[AscendaraDownloader] Could not delete archive {current_archive}: {e}")
                    except Exception as e:
                        logging.error(f"[AscendaraDownloader] unrar extraction failed: {e}")
                        continue
                extracted = True
            except Exception as e:
                logging.error(f"[AscendaraDownloader] Extraction failed: {current_archive}. Error: {e}")
                continue
            
            # After extracting, scan for any new archives that were extracted
            for root, _, files in os.walk(self.download_dir):
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in archive_exts:
                        new_archive = os.path.join(root, file)
                        if new_archive not in processed_archives and new_archive not in archives_to_process:
                            archives_to_process.append(new_archive)
                            logging.info(f"[AscendaraDownloader] Found new archive to extract: {new_archive}")
        # Check for nested directories that should be flattened
        nested_dirs_to_check = []
        
        # First check for directory named after the game
        game_named_dir = os.path.join(self.download_dir, sanitize_folder_name(self.game))
        if os.path.isdir(game_named_dir):
            nested_dirs_to_check.append(game_named_dir)
        
        # Also check for any single subdirectory that might contain the main content
        # (excluding json files and other metadata)
        subdirs = []
        for item in os.listdir(self.download_dir):
            item_path = os.path.join(self.download_dir, item)
            if os.path.isdir(item_path) and not item.endswith('.ascendara') and item != '_CommonRedist':
                subdirs.append(item_path)
        
        # If there's only one subdirectory and it's not already in our list, add it
        if len(subdirs) == 1 and subdirs[0] not in nested_dirs_to_check:
            nested_dirs_to_check.append(subdirs[0])
            logging.info(f"[AscendaraDownloader] Found single subdirectory to potentially flatten: {subdirs[0]}")
        
        moved = False
        for nested_dir in nested_dirs_to_check:
            if os.path.isdir(nested_dir):
                for item in os.listdir(nested_dir):
                    src = os.path.join(nested_dir, item)
                    dst = os.path.join(self.download_dir, item)
                    if os.path.exists(dst):
                        if os.path.isdir(dst):
                            shutil.rmtree(dst, ignore_errors=True)
                        else:
                            os.remove(dst)
                    shutil.move(src, dst)
                shutil.rmtree(nested_dir, ignore_errors=True)
                logging.info(f"[AscendaraDownloader] Moved files from nested '{nested_dir}' to '{self.download_dir}'.")
                moved = True
            # Rebuild filemap after flattening
            watching_data = {}
            for dirpath, _, filenames in os.walk(self.download_dir):
                rel_dir = os.path.relpath(dirpath, self.download_dir)
                for fname in filenames:
                    if fname.endswith('.url') or '_CommonRedist' in dirpath:
                        continue
                    if os.path.splitext(fname)[1].lower() in archive_exts:
                        continue
                    rel_path = os.path.normpath(os.path.join(rel_dir, fname)) if rel_dir != '.' else fname
                    rel_path = rel_path.replace('\\', '/').replace('\\', '/')
                    watching_data[rel_path] = {"size": os.path.getsize(os.path.join(dirpath, fname))}
            safe_write_json(watching_path, watching_data)
            
        # Remove archive files from watching_data
        watching_data = {k: v for k, v in watching_data.items() if os.path.splitext(k)[1].lower() not in archive_exts}
        safe_write_json(watching_path, watching_data)
        # Remove all .url files after extraction
        for root, dirs, files in os.walk(self.download_dir, topdown=False):
            for fname in files:
                if fname.endswith('.url'):
                    file_path = os.path.join(root, fname)
                    try:
                        os.remove(file_path)
                        logging.info(f"[AscendaraDownloader] Deleted .url file: {file_path}")
                    except Exception as e:
                        logging.warning(f"[AscendaraDownloader] Could not delete .url file: {file_path}: {e}")
            # Remove _CommonRedist folders
            for d in dirs:
                if d.lower() == '_commonredist':
                    dir_path = os.path.join(root, d)
                    try:
                        shutil.rmtree(dir_path)
                        logging.info(f"[AscendaraDownloader] Deleted _CommonRedist folder: {dir_path}")
                    except Exception as e:
                        logging.warning(f"[AscendaraDownloader] Could not delete _CommonRedist folder: {dir_path}: {e}")

        # Set extraction to false and verifying to true
        self.game_info["downloadingData"]["extracting"] = False
        self.game_info["downloadingData"]["verifying"] = True
        safe_write_json(self.game_info_path, self.game_info)
        # Notify extraction complete if notification theme is available
        if hasattr(self, 'withNotification') and self.withNotification:
            _launch_notification(
                self.withNotification,
                "Extraction Complete",
                f"Extraction complete for {self.game_info['game']}"
            )
        # Start verification
        self._verify_extracted_files(watching_path)

    def _verify_extracted_files(self, watching_path):
        try:
            with open(watching_path, 'r') as f:
                watching_data = json.load(f)
            verify_errors = []
            for file_path, file_info in watching_data.items():
                # Skip filemap.ascendara.json from verification
                if os.path.basename(file_path) == 'filemap.ascendara.json':
                    continue
                full_path = os.path.join(self.download_dir, file_path)
                if not os.path.exists(full_path) or os.path.getsize(full_path) != file_info['size']:
                    verify_errors.append({"file": file_path, "error": "File missing or size mismatch"})
            self.game_info["downloadingData"]["verifying"] = False
            self.game_info["downloadingData"]["verifyError"] = verify_errors
            safe_write_json(self.game_info_path, self.game_info)
            # Only delete downloadingData after all processing is complete
            if not verify_errors:
                self._handle_post_download_behavior()
                if "downloadingData" in self.game_info:
                    del self.game_info["downloadingData"]
                    safe_write_json(self.game_info_path, self.game_info)
        except Exception as e:
            handleerror(self.game_info, self.game_info_path, e)

# CLI entrypoint for running the downloader as a script
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
    parser = ArgumentParser(description="Ascendara Downloader V2 using SmartDL")
    parser.add_argument("url", help="Download URL")
    parser.add_argument("game", help="Name of the game")
    parser.add_argument("online", type=parse_boolean, help="Is the game online (true/false)?")
    parser.add_argument("dlc", type=parse_boolean, help="Is DLC included (true/false)?")
    parser.add_argument("isVr", type=parse_boolean, help="Is the game a VR game (true/false)?")
    parser.add_argument("updateFlow", type=parse_boolean, help="Is this an update (true/false)?")
    parser.add_argument("version", help="Version of the game")
    parser.add_argument("size", help="Size of the file (ex: 12 GB, 439 MB)")
    parser.add_argument("download_dir", help="Directory to save the downloaded files")
    parser.add_argument("--withNotification", help="Theme name for notifications (e.g. light, dark, blue)", default=None)
    args = parser.parse_args()
    try:
        downloader = SmartDLDownloader(
            args.game, args.online, args.dlc, args.isVr, args.updateFlow, args.version, args.size, args.download_dir
        )
        # Store notification theme on downloader for extraction notification
        if args.withNotification:
            downloader.withNotification = args.withNotification
        downloader.download(args.url, withNotification=args.withNotification)
    except Exception as e:
        # Launch crash reporter on any unhandled exception
        logging.error(f"[AscendaraDownloader] Fatal error: {e}", exc_info=True)
        launch_crash_reporter(1, str(e))
        raise

if __name__ == '__main__':
    main()