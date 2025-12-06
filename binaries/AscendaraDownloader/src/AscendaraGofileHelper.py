# ==============================================================================
# Ascendara GoFile Helper
# ==============================================================================
# Specialized downloader component for handling GoFile.io downloads in Ascendara.
# Manages authentication, file downloads, and extraction.
# support. Read more about the GoFile Helper Tool here:
# https://ascendara.app/docs/binary-tool/gofile-helper









import os
import json
import sys
import time
import shutil
import string
from tempfile import NamedTemporaryFile, gettempdir
import requests
import atexit
from threading import Lock
from hashlib import sha256
from argparse import ArgumentParser, ArgumentTypeError, ArgumentError
import patoolib
import subprocess
import logging
from datetime import datetime
import zipfile

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
    format="%(asctime)s %(levelname)s [AscendaraGofileHelper] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logging.info("[AscendaraGofileHelper] Logging to %s", LOG_PATH)

def read_size(size, decimal_places=2):
    if size == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    i = 0
    while size >= 1024 and i < len(units) - 1:
        size /= 1024.0
        i += 1
    return f"{size:.{decimal_places}f} {units[i]}"


NEW_LINE = "\n" if sys.platform != "Windows" else "\r\n"
IS_DEV = False  # Development mode flag

def long_path(path):
    """Convert a path to extended-length format on Windows to support paths > 260 chars.
    Uses the \\\\?\\ prefix which allows paths up to ~32,767 characters."""
    if sys.platform == "win32" and path and not path.startswith("\\\\?\\"):
        # Convert to absolute path first, then add prefix
        abs_path = os.path.abspath(path)
        return "\\\\?\\" + abs_path
    return path

def _launch_crash_reporter_on_exit(error_code, error_message):
    try:
        crash_reporter_path = os.path.join('./AscendaraCrashReporter.exe')
        if os.path.exists(crash_reporter_path):
            # Use subprocess.Popen with CREATE_NO_WINDOW flag to hide console
            subprocess.Popen(
                [crash_reporter_path, "maindownloader", str(error_code), error_message],
                creationflags=subprocess.CREATE_NO_WINDOW
            )
        else:
            logging.error(f"Crash reporter not found at: {crash_reporter_path}")
    except Exception as e:
        logging.error(f"Failed to launch crash reporter: {e}")

def launch_crash_reporter(error_code, error_message):
    # Only register once
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

def safe_write_json(filepath, data):
    temp_dir = os.path.dirname(filepath)
    temp_file_path = None
    try:
        # Use a unique suffix to avoid conflicts with other temp files
        with NamedTemporaryFile('w', delete=False, dir=temp_dir, suffix='.json.tmp', prefix='ascendara_') as temp_file:
            json.dump(data, temp_file, indent=4)
            temp_file_path = temp_file.name
        retry_attempts = 5
        for attempt in range(retry_attempts):
            try:
                os.replace(temp_file_path, filepath)
                return  # Success
            except PermissionError as e:
                if attempt < retry_attempts - 1:
                    time.sleep(0.5)
                else:
                    # Last resort: try direct write if atomic replace keeps failing
                    logging.warning(f"[AscendaraGofileHelper] Atomic write failed, falling back to direct write: {e}")
                    try:
                        with open(filepath, 'w') as f:
                            json.dump(data, f, indent=4)
                        return
                    except Exception as fallback_e:
                        logging.error(f"[AscendaraGofileHelper] Direct write also failed: {fallback_e}")
                        raise e
            except OSError as e:
                if attempt < retry_attempts - 1:
                    time.sleep(0.5)
                else:
                    # Last resort: try direct write
                    logging.warning(f"[AscendaraGofileHelper] Atomic write failed with OSError, falling back to direct write: {e}")
                    try:
                        with open(filepath, 'w') as f:
                            json.dump(data, f, indent=4)
                        return
                    except Exception as fallback_e:
                        logging.error(f"[AscendaraGofileHelper] Direct write also failed: {fallback_e}")
                        raise e
    except Exception as e:
        logging.error(f"[AscendaraGofileHelper] Error in safe_write_json: {e}")
        raise
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except:
                pass  # Ignore cleanup errors

def sanitize_folder_name(name):
    valid_chars = "-_.() %s%s" % (string.ascii_letters, string.digits)
    sanitized_name = ''.join(c for c in name if c in valid_chars)
    return sanitized_name

def handleerror(game_info, game_info_path, e):
    game_info['online'] = ""
    game_info['dlc'] = ""
    game_info['isRunning'] = False
    game_info['version'] = ""
    game_info['executable'] = ""
    game_info['downloadingData'] = {
        "error": True,
        "message": str(e)
    }
    safe_write_json(game_info_path, game_info)

class GofileDownloader:
    def __init__(self, game, online, dlc, isVr, updateFlow, version, size, download_dir, gameID="", max_workers=5):
        self._max_retries = 3
        self._download_timeout = 30 
        self._token = self._getToken()
        self._lock = Lock()
        self._rate_window = []  # Store recent rate measurements
        self._rate_window_size = 20  # Number of measurements to average (10 seconds at 0.5s intervals)
        self._last_progress = 0  # Track highest progress
        self._download_start_time = 0  # Track when download started for overall speed calc
        self._current_file_progress = {}  # Track progress per file
        self._total_downloaded = 0  # Track total bytes downloaded
        self._total_size = 0  # Track total bytes to download
        self.updateFlow = updateFlow
        self.game = game
        self.online = online
        self.dlc = dlc
        self.isVr = isVr
        self.version = version
        self.size = size
        self.gameID = gameID
        self.download_dir = os.path.join(download_dir, sanitize_folder_name(game))
        os.makedirs(self.download_dir, exist_ok=True)
        self.game_info_path = os.path.join(self.download_dir, f"{sanitize_folder_name(game)}.ascendara.json")
        # Download speed limit (KB/s, 0 means unlimited)
        self._download_speed_limit = 0
        self._single_stream = True  # Default to single stream for stability
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
                    self._download_speed_limit = settings.get('downloadLimit', 0)  # KB/s
                    self._single_stream = settings.get('singleStream', True)
                logging.info(f"[AscendaraGofileHelper] Settings: speed_limit={self._download_speed_limit}, single_stream={self._single_stream}")
        except Exception as e:
            logging.warning(f"[AscendaraGofileHelper] Could not read settings: {e}")
            self._download_speed_limit = 0
            self._single_stream = True
        # If updateFlow is True, preserve the JSON file and set updating flag
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

    @staticmethod
    def _getToken():
        user_agent = os.getenv("GF_USERAGENT", "Mozilla/5.0")
        headers = {
            "User-Agent": user_agent,
            "Accept-Encoding": "gzip, deflate, br",
            "Accept": "*/*",
            "Connection": "keep-alive",
        }
        create_account_response = requests.post("https://api.gofile.io/accounts", headers=headers).json()
        if create_account_response["status"] != "ok":
            raise Exception("Account creation failed!")
        return create_account_response["data"]["token"]

    def download_from_gofile(self, url, password=None, withNotification=None):
        # Fix URL if it starts with //
        if url.startswith("//"):
            url = "https:" + url
        
        content_id = url.split("/")[-1]
        _password = sha256(password.encode()).hexdigest() if password else None

        files_info = self._parseLinksRecursively(content_id, _password)
        
        if not files_info:
            logging.error(f"[AscendaraGofileHelper] No files found for download from {url}. Skipping...")
            handleerror(self.game_info, self.game_info_path, "no_files_error")
            return

        # Calculate total size first
        self._total_size = 0
        for file_info in files_info.values():
            try:
                response = requests.head(
                    file_info["link"],
                    headers={"Cookie": f"accountToken={self._token}"},
                    timeout=self._download_timeout
                )
                if response.status_code == 200:
                    file_size = int(response.headers.get('content-length', 0))
                    self._total_size += file_size
            except:
                continue

        total_files = len(files_info)
        current_file = 0
        
        try:
            for item in files_info.values():
                current_file += 1
                try:
                    logging.info(f"[AscendaraGofileHelper] Downloading file {current_file}/{total_files}: {item.get('name', 'Unknown')}")
                    self._downloadContent(item)
                except Exception as e:
                    logging.error(f"[AscendaraGofileHelper] Error downloading {item.get('name', 'Unknown')}: {str(e)}")
                    # Wait a bit before trying the next file
                    time.sleep(2)
                    continue

            logging.info("[AscendaraGofileHelper] All files downloaded successfully, starting extraction...")
            self._extract_files()
            
            # Handle post-download cleanup and updates
            logging.info("[AscendaraGofileHelper] Download and extraction completed, finalizing...")
            self.game_info["downloadingData"]["downloading"] = False
            self.game_info["downloadingData"]["extracting"] = False
            self.game_info["downloadingData"]["verifying"] = False
            self.game_info["downloadingData"]["updating"] = False
            self.game_info["downloadingData"]["progressCompleted"] = "100.00"
            self.game_info["downloadingData"]["progressDownloadSpeeds"] = "0.00 KB/s"
            self.game_info["downloadingData"]["timeUntilComplete"] = "0s"
            
            # Update version in JSON if this is an update flow
            if self.updateFlow and self.version:
                logging.info(f"[AscendaraGofileHelper] Updating version to: {self.version}")
                self.game_info["version"] = self.version

            # Update the size in game_info to the actual downloaded size (human-readable)
            self.game_info["size"] = read_size(self._total_size)

            safe_write_json(self.game_info_path, self.game_info)
            logging.info("[AscendaraGofileHelper] Process completed successfully")
            
            if withNotification:
                _launch_notification(
                    withNotification,
                    "Download Complete",
                    f"Successfully {'updated' if self.updateFlow else 'downloaded'} {self.game_info['game']}"
                )
                
        except Exception as e:
            logging.error(f"[AscendaraGofileHelper] Error during download process: {str(e)}")
            logging.error(f"Error during download process: {str(e)}")
            handleerror(self.game_info, self.game_info_path, str(e))
            if withNotification:
                _launch_notification(
                    withNotification,
                    "Download Error",
                    f"Error {'updating' if self.updateFlow else 'downloading'} {self.game_info['game']}: {str(e)}"
                )
            raise

    def _parseLinksRecursively(self, content_id, password, current_path=""):
        url = f"https://api.gofile.io/contents/{content_id}?wt=4fd6sg89d7s6&cache=true"
        if password:
            url = f"{url}&password={password}"

        headers = {
            "User-Agent": os.getenv("GF_USERAGENT", "Mozilla/5.0"),
            "Accept-Encoding": "gzip, deflate, br",
            "Accept": "*/*",
            "Connection": "keep-alive",
            "Authorization": f"Bearer {self._token}",
        }

        response = requests.get(url, headers=headers).json()

        if response["status"] != "ok":
            logging.error(f"[AscendaraGofileHelper] Failed to get a link as response from the {url}.")
            return {}

        data = response["data"]
        files_info = {}

        if data["type"] == "folder":
            # Don't add the folder name to the path, keep files at the game root level
            folder_path = current_path
            os.makedirs(os.path.join(self.download_dir, folder_path), exist_ok=True)

            for child_id in data["children"]:
                child = data["children"][child_id]
                if child["type"] == "folder":
                    files_info.update(self._parseLinksRecursively(child["id"], password, folder_path))
                else:
                    files_info[child["id"]] = {
                        "path": folder_path,
                        "filename": child["name"],
                        "link": child["link"]
                    }
        else:
            files_info[data["id"]] = {
                "path": current_path,
                "filename": data["name"],
                "link": data["link"]
            }

        return files_info

    def _downloadContent(self, file_info, chunk_size=None):  # chunk_size determined by limit

        filepath = os.path.join(self.download_dir, file_info["path"], file_info["filename"])
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            logging.info(f"{filepath} already exists, skipping.")
            return

        tmp_file = f"{filepath}.part"
        url = file_info["link"]
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        for retry in range(self._max_retries):
            try:
                headers = {
                    "Cookie": f"accountToken={self._token}",
                    "Accept-Encoding": "gzip, deflate, br",
                    "User-Agent": os.getenv("GF_USERAGENT", "Mozilla/5.0"),
                    "Accept": "*/*",
                    "Referer": f"{url}{('/' if not url.endswith('/') else '')}",
                    "Origin": url,
                    "Connection": "keep-alive",
                    "Sec-Fetch-Dest": "empty",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-site",
                    "Pragma": "no-cache",
                    "Cache-Control": "no-cache"
                }

                part_size = 0
                if os.path.isfile(tmp_file):
                    part_size = int(os.path.getsize(tmp_file))
                    headers["Range"] = f"bytes={part_size}-"

                with requests.get(url, headers=headers, stream=True, timeout=(9, self._download_timeout)) as response:
                    if ((response.status_code in (403, 404, 405, 500)) or
                        (part_size == 0 and response.status_code != 200) or
                        (part_size > 0 and response.status_code != 206)):
                        logging.warning(f"[AscendaraGofileHelper] Couldn't download the file from {url}. Status code: {response.status_code}")
                        if retry < self._max_retries - 1:
                            logging.info(f"[AscendaraGofileHelper] Retrying download ({retry + 2}/{self._max_retries})...")
                            time.sleep(2 ** retry)  # Exponential backoff
                            continue
                        return

                    total_size = int(response.headers.get("Content-Length", 0)) + part_size
                    if not total_size:
                        logging.warning(f"[AscendaraGofileHelper] Couldn't find the file size from {url}.")
                        return

                    mode = 'ab' if part_size > 0 else 'wb'
                    with open(tmp_file, mode) as f:
                        downloaded = part_size
                        start_time = time.time()
                        last_update = start_time
                        bytes_since_last_update = 0
                        self._rate_window = []  # Reset rate window for new download
                        file_key = f"{file_info['path']}/{file_info['filename']}"
                        self._current_file_progress[file_key] = part_size

                        # Use small chunk size and strict limiter if limiting, otherwise large chunk size and no limiter
                        if self._download_speed_limit and self._download_speed_limit > 0:
                            chunk_size = 4096
                        else:
                            chunk_size = 32768
                        start_time = time.time()
                        bytes_downloaded = 0
                        for chunk in response.iter_content(chunk_size=chunk_size):
                            if not chunk:
                                continue
                            
                            f.write(chunk)
                            downloaded += len(chunk)
                            bytes_since_last_update += len(chunk)
                            bytes_downloaded += len(chunk)
                            current_time = time.time()
                            
                            # Only run limiter if limiting
                            if self._download_speed_limit and self._download_speed_limit > 0:
                                elapsed = current_time - start_time
                                if elapsed > 0:
                                    allowed_bytes = self._download_speed_limit * 1024 * elapsed
                                    if bytes_downloaded > allowed_bytes:
                                        sleep_time = (bytes_downloaded - allowed_bytes) / (self._download_speed_limit * 1024)
                                        if sleep_time > 0:
                                            time.sleep(sleep_time)
                            # If no limit is set, run at full speed (do nothing)
                            
                            # Update progress every 0.5 seconds
                            if current_time - last_update >= 0.5:
                                # Update both file and total progress
                                self._current_file_progress[file_key] = downloaded
                                self._total_downloaded = sum(self._current_file_progress.values())
                                
                                # Calculate overall progress percentage
                                if self._total_size > 0:
                                    progress = (self._total_downloaded / self._total_size) * 100
                                    # Ensure progress never decreases
                                    progress = max(progress, self._last_progress)
                                    self._last_progress = progress
                                else:
                                    progress = 0
                                 
                                # Calculate current rate from this interval
                                interval_rate = bytes_since_last_update / (current_time - last_update)
                                
                                # Update rate window with interval rate
                                self._rate_window.append(interval_rate)
                                if len(self._rate_window) > self._rate_window_size:
                                    self._rate_window.pop(0)
                                
                                # Calculate overall average speed from session start for stability
                                session_elapsed = current_time - start_time
                                overall_rate = bytes_downloaded / session_elapsed if session_elapsed > 0 else 0
                                
                                # Blend: 70% overall rate + 30% recent window average for smooth but responsive display
                                window_avg = sum(self._rate_window) / len(self._rate_window) if self._rate_window else 0
                                display_rate = (overall_rate * 0.7) + (window_avg * 0.3)
                                
                                remaining_bytes = self._total_size - self._total_downloaded
                                eta = int(remaining_bytes / display_rate) if display_rate > 0 else 0
                                
                                self._update_progress(
                                    file_info["filename"], 
                                    progress,
                                    display_rate,
                                    eta
                                )
                                
                                last_update = current_time
                                bytes_since_last_update = 0

                    # Download completed successfully
                    try:
                        # First try to remove the destination file if it exists
                        if os.path.exists(filepath):
                            try:
                                os.remove(filepath)
                            except (PermissionError, OSError):
                                # If we can't remove it, try to make it writable first
                                os.chmod(filepath, 0o666)
                                os.remove(filepath)
                        
                        # Now try to move the temp file
                        try:
                            os.replace(tmp_file, filepath)
                        except (PermissionError, OSError):
                            # If replace fails, try a copy+delete approach
                            import shutil
                            shutil.copy2(tmp_file, filepath)
                            os.remove(tmp_file)
                    except Exception as e:
                        if os.path.exists(tmp_file):
                            os.remove(tmp_file)
                        raise Exception(f"Failed to move file to destination: {str(e)}")
                        
                    # Update final progress
                    self._current_file_progress[file_key] = total_size
                    self._total_downloaded = sum(self._current_file_progress.values())
                    if self._total_size > 0:
                        final_progress = (self._total_downloaded / self._total_size) * 100
                    else:
                        final_progress = 100
                    self._update_progress(file_info["filename"], final_progress, 0, 0, done=True)
                    return
            except (requests.exceptions.RequestException, IOError) as e:
                logging.error(f"[AscendaraGofileHelper] Error downloading {url}: {str(e)}")
                if retry < self._max_retries - 1:
                    logging.info(f"[AscendaraGofileHelper] Retrying download ({retry + 2}/{self._max_retries})...")
                    time.sleep(2 ** retry)  # Exponential backoff
                    continue
                if os.path.exists(tmp_file):
                    os.remove(tmp_file)
                raise

        raise Exception(f"Failed to download {url} after {self._max_retries} retries")

    def _update_progress(self, filename, progress, rate, eta_seconds=0, done=False):
        with self._lock:
            self.game_info["downloadingData"]["downloading"] = not done
            self.game_info["downloadingData"]["progressCompleted"] = f"{progress:.2f}"
            
            # Format speed with consistent decimal places and thresholds
            def format_speed(rate):
                if rate < 0.1:  # Very slow speeds
                    return "0.00 B/s"
                elif rate < 1024:
                    return f"{rate:.2f} B/s"
                elif rate < 1024 * 1024:
                    return f"{(rate / 1024):.2f} KB/s"
                elif rate < 1024 * 1024 * 1024:
                    return f"{(rate / (1024 * 1024)):.2f} MB/s"
                else:
                    return f"{(rate / (1024 * 1024 * 1024)):.2f} GB/s"
            
            self.game_info["downloadingData"]["progressDownloadSpeeds"] = format_speed(rate)
            
            # Format ETA with improved granularity
            if done:
                eta = "0s"
            elif eta_seconds <= 0:
                eta = "calculating..."
            elif eta_seconds < 60:
                eta = f"{int(eta_seconds)}s"
            elif eta_seconds < 3600:
                minutes = int(eta_seconds / 60)
                seconds = int(eta_seconds % 60)
                eta = f"{minutes}m {seconds}s"
            elif eta_seconds < 86400:
                hours = int(eta_seconds / 3600)
                minutes = int((eta_seconds % 3600) / 60)
                eta = f"{hours}h {minutes}m"
            else:
                days = int(eta_seconds / 86400)
                hours = int((eta_seconds % 86400) / 3600)
                eta = f"{days}d {hours}h"
            
            self.game_info["downloadingData"]["timeUntilComplete"] = eta
            
            if done:
                print(f"\rDownloading {filename}: 100% Complete!{NEW_LINE}")
            else:
                print(f"\rDownloading {filename}: {progress:.1f}% {format_speed(rate)} ETA: {eta}", end="")
            
            safe_write_json(self.game_info_path, self.game_info)

    def _update_extraction_progress(self, current_file: str, files_extracted: int, total_files: int):
        """Update extraction progress in the game info JSON."""
        with self._lock:
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

    def _check_extraction_tools(self):
        """Check if required extraction tools are available and try to install if missing."""
        if sys.platform != "win32":
            try:
                import shutil
                if sys.platform == "darwin":  # macOS
                    # Check for unar first
                    unar_path = shutil.which('unar')
                    if not unar_path:
                        logging.info("Attempting to install unar via Homebrew...")
                        try:
                            # Check if Homebrew is installed
                            if not shutil.which('brew'):
                                logging.error("Homebrew is not installed. Please install Homebrew first.")
                                return False
                            subprocess.run(['brew', 'install', 'unar'], check=True)
                            logging.info("Successfully installed unar")
                            return True
                        except subprocess.CalledProcessError as e:
                            logging.error(f"Failed to install unar: {str(e)}")
                            return False
                    return True
                else:  # Linux
                    # Try to find unrar first
                    unrar_path = shutil.which('unrar')
                    if not unrar_path:
                        logging.info("Attempting to install unrar...")
                        try:
                            # Try apt-get first (Debian/Ubuntu)
                            subprocess.run(['sudo', 'apt-get', 'update'], check=True)
                            subprocess.run(['sudo', 'apt-get', 'install', '-y', 'unrar'], check=True)
                            logging.info("Successfully installed unrar")
                            return True
                        except subprocess.CalledProcessError:
                            try:
                                # Try yum (RHEL/CentOS)
                                subprocess.run(['sudo', 'yum', 'install', '-y', 'unrar'], check=True)
                                logging.info("Successfully installed unrar")
                                return True
                            except subprocess.CalledProcessError as e:
                                logging.error(f"Failed to install unrar: {str(e)}")
                                return False
                    return True
            except Exception as e:
                logging.error(f"Error checking/installing extraction tools: {str(e)}")
                return False
        return True  # Windows doesn't need additional tools

    def _extract_files(self):
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

        # Check if extraction tools are available
        if not self._check_extraction_tools():
            error_msg = "Required extraction tools are not available. Please install 'unrar' manually."
            logging.error(error_msg)
            self.game_info["downloadingData"]["extracting"] = False
            self.game_info["downloadingData"]["verifyError"] = [{
                "file": "extraction_process",
                "error": error_msg
            }]
            safe_write_json(self.game_info_path, self.game_info)
            return

        # Create watching file for tracking extracted files
        watching_path = os.path.join(self.download_dir, "filemap.ascendara.json")
        watching_data = {}
        self.archive_paths = []  # Store archive paths as instance variable
        
        # First, count total files across all archives for progress tracking
        total_files_to_extract = 0
        archives_to_process = []
        for root, _, files in os.walk(self.download_dir):
            for file in files:
                if file.endswith(('.zip', '.rar')):
                    archive_path = os.path.join(root, file)
                    archives_to_process.append((archive_path, file))
                    self.archive_paths.append(archive_path)
                    try:
                        if file.endswith('.zip'):
                            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                                for zip_info in zip_ref.infolist():
                                    if not zip_info.filename.endswith('.url') and '_CommonRedist' not in zip_info.filename and not zip_info.is_dir():
                                        total_files_to_extract += 1
                        elif file.endswith('.rar'):
                            from unrar import rarfile
                            with rarfile.RarFile(archive_path, 'r') as rar_ref:
                                for rar_info in rar_ref.infolist():
                                    # Check if it's a directory by filename ending with / or \
                                    is_dir = rar_info.filename.endswith('/') or rar_info.filename.endswith('\\')
                                    if not rar_info.filename.endswith('.url') and '_CommonRedist' not in rar_info.filename and not is_dir:
                                        total_files_to_extract += 1
                    except Exception as e:
                        logging.warning(f"[AscendaraGofileHelper] Could not count files in {archive_path}: {e}")
        
        logging.info(f"[AscendaraGofileHelper] Total files to extract: {total_files_to_extract}")
        self._files_extracted_count = 0
        self._update_extraction_progress("Preparing...", 0, total_files_to_extract)
        
        # Extract all archives with progress tracking
        for archive_path, file in archives_to_process:
            extract_dir = self.download_dir
            logging.info(f"[AscendaraGofileHelper] Extracting {archive_path}")
            
            try:
                # check os
                if sys.platform == "win32":
                    if file.endswith('.zip'):
                        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                            for zip_info in zip_ref.infolist():
                                if not zip_info.filename.endswith('.url') and '_CommonRedist' not in zip_info.filename:
                                    extracted_path = os.path.join(extract_dir, zip_info.filename)
                                    zip_ref.extract(zip_info, extract_dir)
                                    # Add to watching data
                                    key = f"{os.path.relpath(extracted_path, self.download_dir)}"
                                    watching_data[key] = {"size": zip_info.file_size}
                                    # Update progress for non-directory entries
                                    if not zip_info.is_dir():
                                        self._files_extracted_count += 1
                                        self._update_extraction_progress(zip_info.filename, self._files_extracted_count, total_files_to_extract)
                    elif file.endswith('.rar'):
                        from unrar import rarfile
                        # Use long path prefix for extraction to support paths > 260 chars
                        long_extract_dir = long_path(extract_dir)
                        with rarfile.RarFile(archive_path, 'r') as rar_ref:
                            # Get file list for progress tracking
                            rar_files = [info for info in rar_ref.infolist() 
                                        if not info.filename.endswith('.url') and '_CommonRedist' not in info.filename]
                            
                            # Extract file by file for progress tracking
                            for rar_info in rar_files:
                                try:
                                    # Try with long path first, fall back to regular path
                                    try:
                                        rar_ref.extract(rar_info, long_extract_dir)
                                    except Exception:
                                        rar_ref.extract(rar_info, extract_dir)
                                    extracted_path = os.path.join(extract_dir, rar_info.filename)
                                    # Check existence with long path support
                                    if os.path.exists(long_path(extracted_path)) or os.path.exists(extracted_path):
                                        key = f"{os.path.relpath(extracted_path, self.download_dir)}"
                                        watching_data[key] = {"size": rar_info.file_size}
                                    # Update progress for non-directory entries (check by filename ending)
                                    is_dir = rar_info.filename.endswith('/') or rar_info.filename.endswith('\\')
                                    if not is_dir:
                                        self._files_extracted_count += 1
                                        self._update_extraction_progress(rar_info.filename, self._files_extracted_count, total_files_to_extract)
                                except OSError as file_error:
                                    logging.warning(f"[AscendaraGofileHelper] Could not extract {rar_info.filename}: {file_error}")
                                    continue
                else:
                    # For non-Windows, use appropriate extraction tool
                    try:
                        # Create a temporary directory for extraction
                        import tempfile
                        with tempfile.TemporaryDirectory() as temp_dir:
                            if file.endswith('.rar'):
                                if sys.platform == "darwin":
                                    # Use unar on macOS
                                    unar_cmd = ['unar', '-force-overwrite', '-o', temp_dir, archive_path]
                                    try:
                                        result = subprocess.run(unar_cmd, check=True, capture_output=True, text=True)
                                        logging.info(f"unar extraction output: {result.stdout}")
                                    except subprocess.CalledProcessError as e:
                                        logging.error(f"unar extraction failed: {e.stderr}")
                                        raise
                                else:
                                    # Use unrar on Linux
                                    unrar_cmd = ['unrar', 'x', '-y', archive_path, temp_dir]
                                    try:
                                        result = subprocess.run(unrar_cmd, check=True, capture_output=True, text=True)
                                        logging.info(f"unrar extraction output: {result.stdout}")
                                    except subprocess.CalledProcessError as e:
                                        logging.error(f"unrar extraction failed: {e.stderr}")
                                        raise
                            else:
                                # Use patoolib for other formats
                                patoolib.extract_archive(archive_path, outdir=temp_dir)
                            
                            # Find the SteamRIP folder if it exists
                            steamrip_folder = None
                            for item in os.listdir(temp_dir):
                                if 'steamrip' in item.lower() and os.path.isdir(os.path.join(temp_dir, item)):
                                    steamrip_folder = os.path.join(temp_dir, item)
                                    break
                            
                            # Set the source directory to either SteamRIP folder or temp_dir
                            src_root = steamrip_folder if steamrip_folder else temp_dir
                            
                            # Move files from source to final location and track them
                            for dirpath, _, filenames in os.walk(src_root):
                                for fname in filenames:
                                    if not fname.endswith('.url') and '_CommonRedist' not in fname:
                                        src_path = os.path.join(dirpath, fname)
                                        # Calculate relative path from source root
                                        rel_path = os.path.relpath(src_path, src_root)
                                        dst_path = os.path.join(extract_dir, rel_path)
                                        
                                        # Create destination directory if needed
                                        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
                                        
                                        # Move file and track it
                                        try:
                                            shutil.move(src_path, dst_path)
                                            key = os.path.relpath(dst_path, self.download_dir)
                                            watching_data[key] = {"size": os.path.getsize(dst_path)}
                                            self._files_extracted_count += 1
                                            self._update_extraction_progress(fname, self._files_extracted_count, total_files_to_extract)
                                            logging.info(f"[AscendaraGofileHelper] Extracted: {key}")
                                        except (OSError, IOError) as e:
                                            logging.error(f"Error moving file {src_path}: {str(e)}")
                    except Exception as e:
                        logging.error(f"Error during extraction on non-Windows system: {str(e)}")
                        raise
                # Delete archive after successful extraction
                try:
                    os.remove(archive_path)
                    logging.info(f"[AscendaraGofileHelper] Deleted archive: {archive_path}")
                except Exception as del_e:
                    logging.warning(f"[AscendaraGofileHelper] Could not delete archive {archive_path}: {del_e}")
            except Exception as e:
                logging.error(f"[AscendaraGofileHelper] Error extracting {archive_path}: {str(e)}")
                continue

        # Flatten nested directories - but be careful not to delete the game directory itself
        nested_dir = os.path.join(self.download_dir, sanitize_folder_name(self.game))
        moved = False
        
        # Only flatten if the nested dir exists AND is different from download_dir
        if os.path.isdir(nested_dir) and os.path.normpath(nested_dir) != os.path.normpath(self.download_dir):
            logging.info(f"[AscendaraGofileHelper] Found nested directory to flatten: {nested_dir}")
            try:
                # Get list of items first to avoid issues during iteration
                items_to_move = list(os.listdir(nested_dir))
                logging.info(f"[AscendaraGofileHelper] Items to move: {len(items_to_move)}")
                
                for item in items_to_move:
                    src = os.path.join(nested_dir, item)
                    dst = os.path.join(self.download_dir, item)
                    
                    # Don't overwrite the game info file
                    if item.endswith('.ascendara.json'):
                        continue
                    
                    # Skip if source doesn't exist anymore
                    if not os.path.exists(src):
                        logging.warning(f"[AscendaraGofileHelper] Source no longer exists: {src}")
                        continue
                    
                    try:
                        if os.path.exists(dst):
                            if os.path.isdir(dst):
                                # Merge directories instead of replacing
                                for sub_item in os.listdir(src):
                                    sub_src = os.path.join(src, sub_item)
                                    sub_dst = os.path.join(dst, sub_item)
                                    if os.path.exists(sub_dst):
                                        if os.path.isdir(sub_dst):
                                            shutil.rmtree(sub_dst, ignore_errors=True)
                                        else:
                                            os.remove(sub_dst)
                                    shutil.move(sub_src, sub_dst)
                                shutil.rmtree(src, ignore_errors=True)
                            else:
                                os.remove(dst)
                                shutil.move(src, dst)
                        else:
                            shutil.move(src, dst)
                    except Exception as move_error:
                        logging.warning(f"[AscendaraGofileHelper] Could not move {item}: {move_error}")
                        continue
                
                # Only remove nested dir if it's empty or nearly empty
                if os.path.exists(nested_dir):
                    remaining = os.listdir(nested_dir)
                    if len(remaining) == 0:
                        shutil.rmtree(nested_dir, ignore_errors=True)
                        logging.info(f"[AscendaraGofileHelper] Removed empty nested directory: {nested_dir}")
                    else:
                        logging.info(f"[AscendaraGofileHelper] Nested directory still has {len(remaining)} items, not removing")
                
                logging.info(f"[AscendaraGofileHelper] Moved files from nested '{nested_dir}' to '{self.download_dir}'.")
                moved = True
            except Exception as e:
                logging.error(f"[AscendaraGofileHelper] Error during flattening: {e}")
        
        # Rebuild filemap after any changes
        watching_data = {}
        archive_exts = {'.rar', '.zip', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso'}
        if os.path.exists(self.download_dir):
            for dirpath, _, filenames in os.walk(self.download_dir):
                rel_dir = os.path.relpath(dirpath, self.download_dir)
                for fname in filenames:
                    if fname.endswith('.url') or '_CommonRedist' in dirpath:
                        continue
                    if os.path.splitext(fname)[1].lower() in archive_exts:
                        continue
                    if fname.endswith('.ascendara.json'):
                        continue
                    full_path = os.path.join(dirpath, fname)
                    if os.path.exists(full_path):
                        rel_path = os.path.normpath(os.path.join(rel_dir, fname)) if rel_dir != '.' else fname
                        rel_path = rel_path.replace('\\', '/')
                        watching_data[rel_path] = {"size": os.path.getsize(full_path)}
            safe_write_json(watching_path, watching_data)

        # Remove all .url files after extraction
        for dirpath, _, filenames in os.walk(self.download_dir):
            for fname in filenames:
                if fname.endswith('.url'):
                    file_path = os.path.join(dirpath, fname)
                    try:
                        os.remove(file_path)
                        logging.info(f"[AscendaraGofileHelper] Deleted .url file: {file_path}")
                    except Exception as e:
                        logging.warning(f"[AscendaraGofileHelper] Could not delete .url file: {file_path}: {e}")
        # If not found, try to match by first word of game name
        if not moved and os.path.exists(self.download_dir):
            first_word = self.game.strip().split()[0].lower()
            try:
                for entry in os.listdir(self.download_dir):
                    entry_path = os.path.join(self.download_dir, entry)
                    # Skip if it's the same as download_dir or if it's a file
                    if not os.path.isdir(entry_path):
                        continue
                    if os.path.normpath(entry_path) == os.path.normpath(self.download_dir):
                        continue
                    if entry.lower().startswith(first_word):
                        logging.info(f"[AscendaraGofileHelper] Found nested directory by first word match: {entry_path}")
                        for item in os.listdir(entry_path):
                            src = os.path.join(entry_path, item)
                            dst = os.path.join(self.download_dir, item)
                            # Don't overwrite the game info file
                            if item.endswith('.ascendara.json'):
                                continue
                            if os.path.exists(dst):
                                if os.path.isdir(dst):
                                    shutil.rmtree(dst, ignore_errors=True)
                                else:
                                    os.remove(dst)
                            shutil.move(src, dst)
                        shutil.rmtree(entry_path, ignore_errors=True)
                        logging.info(f"[AscendaraGofileHelper] Moved files from nested '{entry_path}' (matched by first word) to '{self.download_dir}'.")
                        break
            except Exception as e:
                logging.error(f"[AscendaraGofileHelper] Error during first-word flattening: {e}")
        # Remove archive files from watching_data (if not already rebuilt)
        archive_exts = {'.rar', '.zip', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso'}
        watching_data = {k: v for k, v in watching_data.items() if os.path.splitext(k)[1].lower() not in archive_exts}
        safe_write_json(watching_path, watching_data)

        # Set extraction to false and verifying to true (after flattening and filemap rebuild)
        self.game_info["downloadingData"]["extracting"] = False
        self.game_info["downloadingData"]["verifying"] = True
        safe_write_json(self.game_info_path, self.game_info)

        # Start verification
        self._verify_extracted_files(watching_path)

    def _verify_extracted_files(self, watching_path):
        verify_errors = []  # Initialize early to avoid reference errors
        verify_start_time = time.time()
        try:
            # Check if watching_path exists
            if not os.path.exists(watching_path):
                logging.warning(f"[AscendaraGofileHelper] Watching path not found: {watching_path}, skipping verification")
                # Still mark as complete even if we can't verify
                self.game_info["downloadingData"]["verifying"] = False
                safe_write_json(self.game_info_path, self.game_info)
                return
                
            with open(watching_path, 'r') as f:
                watching_data = json.load(f)

            # Find and delete _CommonRedist directories
            for root, dirs, files in os.walk(self.download_dir):
                if "_CommonRedist" in dirs:
                    common_redist_path = os.path.join(root, "_CommonRedist")
                    logging.info(f"[AscendaraGofileHelper] Found _CommonRedist directory at {common_redist_path}, deleting...")
                    try:
                        import shutil
                        shutil.rmtree(common_redist_path)
                        logging.info(f"[AscendaraGofileHelper] Successfully deleted {common_redist_path}")
                    except Exception as e:
                        logging.error(f"[AscendaraGofileHelper] Error deleting _CommonRedist directory: {str(e)}")

            filtered_watching_data = {}
            for file_path, file_info in watching_data.items():
                if "_CommonRedist" not in file_path:
                    filtered_watching_data[file_path] = file_info
                    
            for file_path, file_info in filtered_watching_data.items():
                full_path = os.path.join(self.download_dir, file_path)
                # Skip verification for directories
                if os.path.isdir(full_path):
                    continue
                    
                if not os.path.exists(full_path):
                    verify_errors.append({
                        "file": file_path,
                        "error": "File not found",
                        "expected_size": file_info["size"]
                    })
                    continue

                # Verify file size
                actual_size = os.path.getsize(full_path)
                if actual_size != file_info["size"]:
                    verify_errors.append({
                        "file": file_path,
                        "error": f"Size mismatch: expected {file_info['size']}, got {actual_size}",
                        "expected_size": file_info["size"],
                        "actual_size": actual_size
                    })

            if verify_errors:
                logging.warning(f"[AscendaraGofileHelper] Found {len(verify_errors)} verification errors")
                self.game_info["downloadingData"]["verifyError"] = verify_errors
                error_count = len(verify_errors)
                _launch_notification(
                    "dark",  # Use dark theme by default for GofileHelper
                    "Verification Failed",
                    f"{error_count} {'file' if error_count == 1 else 'files'} failed to verify"
                )
            else:
                logging.info("[AscendaraGofileHelper] All extracted files verified successfully")
                # Try to remove all archive files that were extracted
                for archive_path in getattr(self, 'archive_paths', []):
                    try:
                        if os.path.exists(archive_path):
                            os.remove(archive_path)
                            logging.info(f"[AscendaraGofileHelper] Removed archive file: {archive_path}")
                    except Exception as e:
                        logging.error(f"[AscendaraGofileHelper] Error removing archive file {archive_path}: {str(e)}")
                if "verifyError" in self.game_info["downloadingData"]:
                    del self.game_info["downloadingData"]["verifyError"]
                
                # Execute post-download behavior when verification is successful
                logging.info("[AscendaraGofileHelper] Verification successful, proceeding with post-download behavior")
                self._handle_post_download_behavior()

        except Exception as e:
            error_msg = f"Error during verification: {str(e)}"
            logging.error(error_msg)
            self.game_info["downloadingData"]["verifyError"] = [{
                "file": "verification_process",
                "error": str(e)
            }]
            _launch_notification(
                "dark",  # Use dark theme by default for GofileHelper
                "Verification Error",
                error_msg
            )
            # Reset all states to false on verification error
            self.game_info["downloadingData"]["downloading"] = False
            self.game_info["downloadingData"]["extracting"] = False
            self.game_info["downloadingData"]["verifying"] = False

        # Ensure verifying state shows for at least 1 second in the UI
        elapsed = time.time() - verify_start_time
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)

        # Set verifying to false when done
        self.game_info["downloadingData"]["verifying"] = False

        # Only remove verifyError if verification succeeded and wasn't already handled
        if "verifyError" in self.game_info["downloadingData"] and not verify_errors:
            del self.game_info["downloadingData"]["verifyError"]

        safe_write_json(self.game_info_path, self.game_info)

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
                    logging.info(f"[AscendaraGofileHelper] Post-download behavior: {behavior}")
                    
                    if behavior == 'lock':
                        logging.info("[AscendaraGofileHelper] Locking computer as requested in settings")
                        if sys.platform == 'win32':
                            os.system('rundll32.exe user32.dll,LockWorkStation')
                        elif sys.platform == 'darwin':
                            os.system('/System/Library/CoreServices/Menu\ Extras/User.menu/Contents/Resources/CGSession -suspend')
                    elif behavior == 'sleep':
                        logging.info("[AscendaraGofileHelper] Putting computer to sleep as requested in settings")
                        if sys.platform == 'win32':
                            os.system('rundll32.exe powrprof.dll,SetSuspendState 0,1,0')
                        elif sys.platform == 'darwin':
                            os.system('pmset sleepnow')
                    elif behavior == 'shutdown':
                        logging.info("[AscendaraGofileHelper] Shutting down computer as requested in settings")
                        if sys.platform == 'win32':
                            os.system('shutdown /s /t 60 /c "Ascendara download complete - shutting down in 60 seconds"')
                        elif sys.platform == 'darwin':
                            os.system('osascript -e "tell app \"System Events\" to shut down"')
                    else:  # 'none' or any other value
                        logging.info("[AscendaraGofileHelper] No post-download action required")
        except Exception as e:
            logging.error(f"[AscendaraGofileHelper] Error in post-download behavior handling: {e}")

def open_console():
    if IS_DEV and sys.platform == "win32":
        import ctypes
        kernel32 = ctypes.WinDLL('kernel32')
        kernel32.AllocConsole()

def parse_boolean(value):
    if value.lower() in ['true', '1', 'yes']:
        return True
    elif value.lower() in ['false', '0', 'no']:
        return False
    else:
        raise ArgumentTypeError(f"Invalid boolean value: {value}")

def main():
    parser = ArgumentParser(description="Download files from Gofile, extract them, and manage game info.")
    parser.add_argument("url", help="Gofile URL to download from")
    parser.add_argument("game", help="Name of the game")
    parser.add_argument("online", type=parse_boolean, help="Is the game online (true/false)?")
    parser.add_argument("dlc", type=parse_boolean, help="Is DLC included (true/false)?")
    parser.add_argument("isVr", type=parse_boolean, help="Is the game a VR game (true/false)?")
    parser.add_argument("updateFlow", type=parse_boolean, help="Is this an update (true/false)?")
    parser.add_argument("version", help="Version of the game")
    parser.add_argument("size", help="Size of the file in (ex: 12 GB, 439 MB)")
    parser.add_argument("download_dir", help="Directory to save the downloaded files")
    parser.add_argument("gameID", nargs="?", default="", help="Game ID from SteamRIP")
    parser.add_argument("--password", help="Password for protected content", default=None)
    parser.add_argument("--withNotification", help="Theme name for notifications (e.g. light, dark, blue)", default=None)

    try:
        if len(sys.argv) == 1:  # No arguments provided
            error_msg = "No arguments provided. Please provide all required arguments."
            logging.error(error_msg)
            launch_crash_reporter(1, error_msg)
            parser.print_help()
            sys.exit(1)
            
        args = parser.parse_args()
        logging.info(f"Starting download process for game: {args.game}")
        logging.debug(f"Arguments: url={args.url}, online={args.online}, dlc={args.dlc}, "
                     f"isVr={args.isVr}, update={args.updateFlow}, version={args.version}, size={args.size}, "
                     f"download_dir={args.download_dir}, withNotification={args.withNotification}")
        
        downloader = GofileDownloader(args.game, args.online, args.dlc, args.isVr, args.updateFlow, args.version, args.size, args.download_dir, args.gameID)
        if args.withNotification:
            _launch_notification(args.withNotification, "Download Started", f"Starting download for {args.game}")
        downloader.download_from_gofile(args.url, args.password, args.withNotification)
        if args.withNotification:
            _launch_notification(args.withNotification, "Download Complete", f"Successfully downloaded and extracted {args.game}")
        
        logging.info(f"Download process completed successfully for game: {args.game}")
        logging.info("Detailed logs have been saved to the application log directory")
        
    except (ArgumentError, SystemExit) as e:
        error_msg = "Invalid or missing arguments. Please provide all required arguments."
        logging.error(f"{error_msg} Error: {str(e)}")
        launch_crash_reporter(1, error_msg)
        parser.print_help()
        sys.exit(1)
    except Exception as e:
        print(f"Error: {str(e)}")
        logging.error(f"Error: {str(e)}")
        launch_crash_reporter(1, str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()