# ==============================================================================
# Ascendara Torrent Handler
# ==============================================================================
# A command-line tool for handling Ascendara torrents
# Read more about the Torrent Handler Tool here:
# https://ascendara.app/docs/binary-tool/torrent-handler






import os
import json
import sys
import atexit
import time
import threading
import shutil
import zipfile
import string
import re
from tempfile import NamedTemporaryFile, gettempdir
from datetime import datetime
import logging
import qbittorrentapi
import argparse
import subprocess
from typing import Dict, Any, Optional, List, Tuple

def _launch_crash_reporter_on_exit(error_code, error_message):
    try:
        binary_name = 'AscendaraCrashReporter.exe' if sys.platform == 'win32' else 'AscendaraCrashReporter'
        crash_reporter_path = os.path.join('.', binary_name)
        if os.path.exists(crash_reporter_path):
            kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
            subprocess.Popen(
                [crash_reporter_path, "torrenthandler", str(error_code), error_message],
                **kwargs
            )
        else:
            logging.error(f"Crash reporter not found at: {crash_reporter_path}")
    except Exception as e:
        logging.error(f"Failed to launch crash reporter: {e}")

def launch_crash_reporter(error_code, error_message):
    """Register the crash reporter to launch on exit with the given error details"""
    if not hasattr(launch_crash_reporter, "_registered"):
        atexit.register(_launch_crash_reporter_on_exit, error_code, error_message)
        launch_crash_reporter._registered = True

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

def sanitize_folder_name(name: str) -> str:
    valid_chars = "-_.() %s%s" % (string.ascii_letters, string.digits)
    return ''.join(c for c in name if c in valid_chars)

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

    Returns True if sufficient space, False otherwise.
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

def safe_write_json(filepath, data):
    temp_dir = os.path.dirname(filepath)
    temp_file_path = None
    try:
        with NamedTemporaryFile('w', delete=False, dir=temp_dir) as temp_file:
            json.dump(data, temp_file, indent=4)
            temp_file_path = temp_file.name
        retry_attempts = 3
        for attempt in range(retry_attempts):
            try:
                os.replace(temp_file_path, filepath)
                break
            except PermissionError as e:
                if attempt < retry_attempts - 1:
                    time.sleep(1)
                else:
                    raise e
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

def load_settings():
    """Load Ascendara settings from the platform-specific path."""
    try:
        if sys.platform == 'win32':
            appdata = os.environ.get('APPDATA')
            if appdata:
                app_folder = 'Ascendara' if getattr(sys, 'frozen', False) else 'Electron'
                path = os.path.join(appdata, app_folder, 'ascendarasettings.json')
                if os.path.exists(path):
                    with open(path, 'r', encoding='utf-8') as f:
                        return json.load(f)
        elif sys.platform == 'darwin':
            path = os.path.join(os.path.expanduser('~/Library/Application Support/ascendara'), 'ascendarasettings.json')
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
        else:
            path = os.path.join(os.path.expanduser('~/.config/ascendara'), 'ascendarasettings.json')
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
    except Exception as e:
        logging.warning(f"[TorrentHandler] Could not read settings: {e}")
    return {}

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

def get_ascendara_log_path():
    if sys.platform == "win32":
        appdata = os.getenv("APPDATA")
    else:
        appdata = os.path.expanduser("~/.config")
    ascendara_dir = os.path.join(appdata, "Ascendara by tagoWorks")
    os.makedirs(ascendara_dir, exist_ok=True)
    return os.path.join(ascendara_dir, "downloadmanager.log")

def setup_logging():
    log_formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')

    # Shared Ascendara download manager log (matches AscendaraDownloader.py)
    shared_log_path = get_ascendara_log_path()
    shared_handler = logging.FileHandler(shared_log_path, encoding="utf-8")
    shared_handler.setFormatter(log_formatter)
    shared_handler.setLevel(logging.INFO)

    # Create temp log file with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_log_path = os.path.join(gettempdir(), f'ascendara_torrent_{timestamp}.log')

    # File handler for temp file
    file_handler = logging.FileHandler(temp_log_path)
    file_handler.setFormatter(log_formatter)
    file_handler.setLevel(logging.DEBUG)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(log_formatter)
    console_handler.setLevel(logging.INFO)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(shared_handler)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    logging.info(f"[AscendaraTorrentHandler] Logging to {shared_log_path}")
    logging.info(f"Detailed logs will be saved to: {temp_log_path}")
    return temp_log_path

# Initialize logging
temp_log_file = setup_logging()

def _launch_notification(theme, title, message):
    try:
        # Get the directory where the current executable is located
        exe_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
        notification_helper_path = os.path.join(exe_dir, 'AscendaraNotificationHelper.exe')
        logging.debug(f"Looking for notification helper at: {notification_helper_path}")
        
        if os.path.exists(notification_helper_path):
            logging.debug(f"Launching notification helper with theme={theme}, title='{title}', message='{message}'")
            kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
            subprocess.Popen(
                [notification_helper_path, "--theme", theme, "--title", title, "--message", message],
                **kwargs
            )
            logging.debug("Notification helper process started successfully")
        else:
            logging.error(f"Notification helper not found at: {notification_helper_path}")
    except Exception as e:
        logging.error(f"Failed to launch notification helper: {e}")

class TorrentManager:
    def __init__(self, qbit_host='localhost', qbit_port=8080, qbit_username='admin', qbit_password='adminadmin'):
        self.qbt_client = None
        self.connect_thread = None
        self.current_torrent_hash = None
        self.notification_theme = None
        self.qbit_host = qbit_host
        self.qbit_port = qbit_port
        self.qbit_username = qbit_username
        self.qbit_password = qbit_password
        
    def cleanup(self):
        if self.qbt_client and self.current_torrent_hash:
            try:
                # Get torrent info to check if it's complete
                torrents = self.qbt_client.torrents_info(torrent_hashes=self.current_torrent_hash)
                if torrents and not torrents[0].state_enum.is_complete:
                    # Delete the torrent and its data if download is incomplete
                    self.qbt_client.torrents_delete(delete_files=True, torrent_hashes=self.current_torrent_hash)
            except:
                pass  # Ignore any errors during cleanup
    
    def _connect_qbittorrent(self):
        # Connect to the user-configured qBittorrent Web UI
        logging.info(
            f"Connecting to qBittorrent WebUI at {self.qbit_host}:{self.qbit_port} "
            f"as user '{self.qbit_username}'"
        )
        self.qbt_client = qbittorrentapi.Client(
            host=self.qbit_host,
            port=self.qbit_port,
            username=self.qbit_username,
            password=self.qbit_password
        )
        try:
            self.qbt_client.auth_log_in()
        except qbittorrentapi.LoginFailed as e:
            raise Exception(
                f"Failed to authenticate with qBittorrent at {self.qbit_host}:{self.qbit_port}. "
                "Check your credentials in Ascendara settings."
            ) from e
        except Exception as e:
            raise Exception(
                f"Failed to connect to qBittorrent at {self.qbit_host}:{self.qbit_port}. "
                "Make sure it's running with Web UI enabled and the host/port are correct."
            ) from e
    
    def ensure_connected(self):
        if self.qbt_client is None:
            self.connect_thread = threading.Thread(target=self._connect_qbittorrent)
            self.connect_thread.start()
        
    def download_torrent(self, magnet_link, game, online, dlc, isVr, updateFlow, version, size, download_dir, theme=None):
        self.notification_theme = theme
        logging.info(f"Starting torrent download for game: {game}")
        logging.debug(f"Download parameters: magnet={magnet_link}, online={online}, dlc={dlc}, "
                     f"isVr={isVr}, updateFlow={updateFlow}, version={version}, size={size}, "
                     f"download_dir={download_dir}, theme={theme}")

        if theme:
            _launch_notification(theme, "Download Started", f"Starting torrent download for {game}")

        # Start connection process immediately
        self.ensure_connected()
        
        # Create game-specific directory in a separate thread
        def setup_directories():
            game_dir = os.path.join(download_dir, game)
            os.makedirs(game_dir, exist_ok=True)
            return game_dir
            
        dir_thread = threading.Thread(target=setup_directories)
        dir_thread.start()
        
        # Wait for directory creation
        dir_thread.join()
        game_dir = os.path.join(download_dir, game)
        
        game_info_path = os.path.join(game_dir, f"{game}.ascendara.json")
        
        game_info: Dict[str, Any] = {
            "game": game,
            "online": online,
            "dlc": dlc,
            "isVr": isVr,
            "version": version if version else "",
            "size": size,
            "executable": os.path.join(game_dir, f"{game}.exe"),
            "isRunning": False,
            "downloadingData": {
                "downloading": True,
                "waiting": True,
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
        
        try:
            # Create the JSON file right before adding the torrent
            safe_write_json(game_info_path, game_info)

            # Check disk space before starting the torrent download
            if size:
                try:
                    size_parts = size.split()
                    if len(size_parts) == 2:
                        size_value = float(size_parts[0])
                        size_unit = size_parts[1].upper()
                        multipliers = {'B': 1, 'KB': 1024, 'MB': 1024**2, 'GB': 1024**3, 'TB': 1024**4}
                        estimated_download_size = int(size_value * multipliers.get(size_unit, 1024**3))
                        total_needed = estimated_download_size * 4 if updateFlow else estimated_download_size * 3
                        if not check_disk_space(download_dir, total_needed, "download and extraction"):
                            error_msg = f"Insufficient disk space. Need ~{read_size(total_needed)}"
                            logging.error(f"[TorrentHandler] {error_msg}")
                            handleerror(game_info, game_info_path, error_msg)
                            if theme:
                                _launch_notification(theme, "Download Failed", error_msg)
                            return
                except Exception as e:
                    logging.warning(f"[TorrentHandler] Could not parse size for disk check: {e}")

            # Wait for qBittorrent connection if not ready
            if self.connect_thread and self.connect_thread.is_alive():
                self.connect_thread.join()
            
            # Add the torrent to qBittorrent
            self.qbt_client.torrents_add(
                urls=magnet_link,
                save_path=game_dir,  # Save to game-specific directory
                use_auto_torrent_management=False,
                sequential_download=True
            )
            logging.info(f"Added torrent to qBittorrent for game: {game}")
            
            # Get the torrent hash from the magnet link (btih can be hex or base32, case-insensitive)
            btih_match = re.search(r'btih:([a-zA-Z0-9]+)', magnet_link)
            torrent_hash = btih_match.group(1).lower() if btih_match else magnet_link.split('&')[0].split(':')[-1].lower()
            self.current_torrent_hash = torrent_hash

            # Wait for qBittorrent to register the torrent before polling its info
            # (torrents_info can briefly return an empty list right after torrents_add)
            registered = False
            for _ in range(30):
                if self.qbt_client.torrents_info(torrent_hashes=torrent_hash):
                    registered = True
                    break
                time.sleep(0.5)
            if not registered:
                raise Exception(f"Torrent {torrent_hash} did not register in qBittorrent after adding")

            # Apply download speed limit from settings if configured
            try:
                settings = load_settings()
                download_limit_kbps = int(settings.get('downloadLimit', 0))
                if download_limit_kbps > 0:
                    limit_bytes = download_limit_kbps * 1024
                    self.qbt_client.torrents_set_download_limit(
                        limit=limit_bytes,
                        torrent_hashes=torrent_hash
                    )
                    logging.info(f"[TorrentHandler] Speed limit set: {download_limit_kbps} KB/s for {game}")
                else:
                    logging.info(f"[TorrentHandler] Speed limit: unlimited for {game}")
            except Exception as e:
                logging.warning(f"[TorrentHandler] Could not apply speed limit: {e}")
            
            # Register cleanup on exit
            atexit.register(self.cleanup)
            
            while True:
                # Get torrent info
                torrents = self.qbt_client.torrents_info(torrent_hashes=torrent_hash)
                if not torrents:
                    time.sleep(1)
                    continue
                torrent = torrents[0]
                
                if torrent.state_enum.is_complete:
                    break
                
                # Update progress
                progress = torrent.progress * 100
                speed = torrent.dlspeed  # bytes/s
                
                # Update waiting status based on download speed
                if speed > 0 and game_info["downloadingData"]["waiting"]:
                    game_info["downloadingData"]["waiting"] = False
                    safe_write_json(game_info_path, game_info)
                    if self.notification_theme:
                        _launch_notification(self.notification_theme, "Download Progress", f"Download started for {game}")
                
                if speed > 0:
                    eta_seconds = torrent.eta
                else:
                    eta_seconds = 0
                
                # Format speed (matches AscendaraDownloader.py formatting)
                if speed >= 1024**2:
                    speed_str = f"{speed/1024**2:.2f} MB/s"
                elif speed >= 1024:
                    speed_str = f"{speed/1024:.2f} KB/s"
                else:
                    speed_str = f"{speed:.2f} B/s"
                
                # Format ETA (matches AscendaraDownloader.py formatting)
                eta_int = int(eta_seconds)
                if eta_int < 60:
                    eta_str = f"{eta_int}s"
                elif eta_int < 3600:
                    eta_str = f"{eta_int // 60}m {eta_int % 60}s"
                else:
                    eta_str = f"{eta_int // 3600}h {(eta_int % 3600) // 60}m"
                
                game_info["downloadingData"].update({
                    "progressCompleted": f"{progress:.2f}",
                    "progressDownloadSpeeds": speed_str,
                    "timeUntilComplete": eta_str
                })
                
                safe_write_json(game_info_path, game_info)
                time.sleep(1)
            
            # Download complete, now extract/install
            game_info["downloadingData"]["downloading"] = False
            game_info["downloadingData"]["extracting"] = True
            safe_write_json(game_info_path, game_info)
            logging.info(f"Download complete for {game}, starting extraction")
            if self.notification_theme:
                _launch_notification(self.notification_theme, "Download Complete", f"Download complete for {game}, starting installation")
            
            # qBittorrent may still be checking/moving files right after reporting
            # completion, which holds OS-level file locks. Wait for it to settle
            # before touching any files, otherwise we hit WinError 32.
            self._wait_for_qbt_release(torrent_hash, game)
            
            # The torrent content lands inside a folder named after the torrent
            torrent_folder = os.path.join(game_dir, torrent.name)
            if not os.path.isdir(torrent_folder):
                # Single-file torrents may place content directly in game_dir
                torrent_folder = game_dir
            
            install_dir = os.path.join(game_dir, game)
            os.makedirs(install_dir, exist_ok=True)
            
            # Try fast archive extraction first; fall back to setup.exe installer if no archives are found
            archive_files = self._find_archives(torrent_folder)
            if archive_files:
                logging.info(f"[{game}] Found {len(archive_files)} archive(s), extracting directly")
                self._extract_archives(archive_files, install_dir, game_info, game_info_path)
                self._flatten_directories(install_dir, game)
            else:
                logging.info(f"[{game}] No archives found, falling back to setup.exe installer")
                setup_file = self._find_setup_installer(torrent_folder, game)
                logging.info(f"[{game}] Found setup installer, awaiting manual elevation from user: {setup_file}")
                game_info["downloadingData"] = {
                    "downloading": False,
                    "extracting": False,
                    "verifying": False,
                    "pendingManualInstall": True,
                    "manualInstallerPath": setup_file,
                    "manualInstallDir": game_dir,
                    "progressCompleted": "100.00",
                    "progressDownloadSpeeds": "0.00 KB/s",
                    "timeUntilComplete": "0s",
                }
                safe_write_json(game_info_path, game_info)
                if self.notification_theme:
                    _launch_notification(
                        self.notification_theme,
                        "Manual Installation Required",
                        f"{game} downloaded. Run the installer as Administrator to finish installing."
                    )
                logging.info(f"Torrent download finished for {game}; waiting for user to run installer as admin")
                return

            # Detect the actual executable instead of guessing {game}.exe
            detected_exe = self._detect_executable(install_dir, game)
            if detected_exe:
                game_info["executable"] = detected_exe
            else:
                # Fallback: try the legacy {game}.exe path if it exists
                legacy_exe = os.path.join(install_dir, f"{game}.exe")
                if os.path.exists(legacy_exe):
                    game_info["executable"] = legacy_exe
                else:
                    logging.warning(f"[{game}] Could not detect game executable")

            # Build filemap, clean junk, then verify
            watching_path = os.path.join(install_dir, "filemap.ascendara.json")
            self._create_filemap(install_dir, watching_path)
            self._cleanup_junk_files(install_dir)

            game_info["downloadingData"]["extracting"] = False
            game_info["downloadingData"]["verifying"] = True
            safe_write_json(game_info_path, game_info)
            self._verify_files(install_dir, watching_path, game_info, game_info_path)

            # Finalize - keep verifyError visible in the UI if verification failed
            verify_errors = game_info["downloadingData"].get("verifyError")
            if "downloadingData" in game_info and not verify_errors:
                del game_info["downloadingData"]
            safe_write_json(game_info_path, game_info)
            logging.info(f"Installation complete for game: {game}")
            if self.notification_theme:
                if verify_errors:
                    _launch_notification(self.notification_theme, "Installation Warning", f"{game} installed but {len(verify_errors)} file(s) failed verification")
                else:
                    _launch_notification(self.notification_theme, "Installation Complete", f"Successfully installed {game}")
            
        except Exception as e:
            error_msg = f"Error downloading/installing {game}: {str(e)}"
            logging.error(error_msg)
            if self.notification_theme:
                _launch_notification(self.notification_theme, "Download Failed", error_msg)
            handleerror(game_info, game_info_path, e)
            launch_crash_reporter(1, str(e))
            raise

    # --------------------------------------------------------------------------
    # Extraction / installation helpers
    # --------------------------------------------------------------------------

    def _update_extraction_progress(self, game_info, game_info_path, current_file, files_extracted, total_files):
        """Update the extractionProgress block in game_info."""
        if not hasattr(self, '_extraction_start_time'):
            self._extraction_start_time = time.time()
        elapsed = time.time() - self._extraction_start_time
        speed = files_extracted / elapsed if elapsed > 0 else 0
        percent = (files_extracted / total_files * 100) if total_files > 0 else 0
        game_info["downloadingData"]["extractionProgress"] = {
            "currentFile": current_file[:50] + "..." if len(current_file) > 50 else current_file,
            "filesExtracted": files_extracted,
            "totalFiles": total_files,
            "percentComplete": f"{min(percent, 100.0):.2f}",
            "extractionSpeed": f"{speed:.2f} files/s"
        }
        safe_write_json(game_info_path, game_info)

    def _wait_for_qbt_release(self, torrent_hash: str, game: str, max_wait_seconds: int = 30):
        """Wait until qBittorrent leaves transient checking/moving states that hold file locks."""
        unstable_states = {'checkingup', 'checkingdl', 'movingfiles', 'checkingresumedata', 'allocating'}
        waited = 0
        while waited < max_wait_seconds:
            try:
                torrents = self.qbt_client.torrents_info(torrent_hashes=torrent_hash)
                if not torrents:
                    break
                state = (torrents[0].state or '').lower()
                if state not in unstable_states:
                    break
                logging.info(f"[{game}] Waiting for qBittorrent to release files (state: {state})")
            except Exception:
                break
            time.sleep(1)
            waited += 1

    def _find_archives(self, folder: str) -> List[str]:
        """Find .zip/.rar/.7z archives inside folder, sorted by size descending."""
        archives = []
        archive_exts = {'.zip', '.rar', '.7z'}
        for root, _, files in os.walk(folder):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext not in archive_exts:
                    continue
                # Skip continuation parts of multi-volume RAR sets; the first part extracts them all
                if re.match(r'.+\.part\d+\.rar$', file, re.IGNORECASE):
                    match = re.match(r'.+\.part(\d+)\.rar$', file, re.IGNORECASE)
                    if match and int(match.group(1)) != 1:
                        continue
                if re.match(r'.+\.(r\d+|s\d\d)$', file, re.IGNORECASE):
                    continue
                archives.append(os.path.join(root, file))
        # Extract largest archives first (often the main data archive)
        archives.sort(key=lambda p: os.path.getsize(p), reverse=True)
        return archives

    def _extract_archives(self, archive_files: List[str], extract_to: str, game_info: Dict, game_info_path: str):
        """Extract a list of archives into extract_to with progress reporting."""
        # Count total files across archives for progress, and tally uncompressed
        # size (where determinable) so we can verify there is enough free disk space.
        total_files = 0
        total_uncompressed_size = 0
        archives_with_unknown_size = []
        for archive_path in archive_files:
            ext = os.path.splitext(archive_path)[1].lower()
            had_known_size = False
            try:
                if ext == '.zip':
                    with zipfile.ZipFile(archive_path, 'r') as zf:
                        for zi in zf.infolist():
                            if not zi.is_dir():
                                total_files += 1
                                total_uncompressed_size += zi.file_size
                        had_known_size = True
                elif ext == '.rar':
                    if sys.platform == 'win32':
                        try:
                            from unrar import rarfile
                            with rarfile.RarFile(archive_path, 'r') as rf:
                                for info in rf.infolist():
                                    if not info.filename.endswith('/'):
                                        total_files += 1
                                        total_uncompressed_size += getattr(info, 'file_size', 0) or 0
                            had_known_size = True
                        except Exception as e:
                            logging.warning(f"[TorrentHandler] Could not count RAR files: {e}")
                    else:
                        _unrar = shutil.which('unrar') or shutil.which('unrar-free')
                        if _unrar:
                            result = subprocess.run([_unrar, 'l', archive_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                            for line in result.stdout.decode(errors='replace').splitlines():
                                parts = line.split()
                                if len(parts) >= 5 and parts[0] not in ('-', 'Name', '---'):
                                    fname = parts[-1]
                                    if not fname.endswith('/'):
                                        total_files += 1
                elif ext == '.7z':
                    _7z = shutil.which('7z') or shutil.which('7za')
                    if _7z:
                        result = subprocess.run([_7z, 'l', archive_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                        # The last "files" count line from 7z output
                        for line in result.stdout.decode(errors='replace').splitlines():
                            if line.strip().lower().startswith('files'):
                                try:
                                    total_files += int(line.split()[-1])
                                except Exception:
                                    pass
            except Exception as e:
                logging.warning(f"[TorrentHandler] Could not count files in {archive_path}: {e}")
            if not had_known_size:
                archives_with_unknown_size.append(archive_path)

        # For archives where we couldn't determine the exact uncompressed size,
        # fall back to a conservative multiple of the archive's size on disk.
        for archive_path in archives_with_unknown_size:
            try:
                total_uncompressed_size += int(os.path.getsize(archive_path) * 2.5)
            except OSError:
                pass

        if total_uncompressed_size > 0 and not check_disk_space(extract_to, total_uncompressed_size, "extraction"):
            error_msg = f"Insufficient disk space to extract. Need ~{read_size(total_uncompressed_size)}"
            logging.error(f"[TorrentHandler] {error_msg}")
            raise RuntimeError(error_msg)

        game_info["downloadingData"]["extractionProgress"]["totalFiles"] = total_files
        safe_write_json(game_info_path, game_info)

        files_extracted = 0
        for archive_path in archive_files:
            ext = os.path.splitext(archive_path)[1].lower()
            archive_name = os.path.basename(archive_path)
            logging.info(f"[TorrentHandler] Extracting archive: {archive_path}")
            self._update_extraction_progress(game_info, game_info_path, f"Extracting {archive_name}...", files_extracted, total_files)

            # Prefer 7z/unrar CLI bulk extraction for speed; fall back to Python zipfile only when necessary
            has_7z = bool(shutil.which('7z') or shutil.which('7za'))
            if ext in ('.rar', '.7z') or (ext == '.zip' and has_7z):
                self._extract_with_cli(archive_path, extract_to)
                # Approximate progress bump: CLI tools don't give per-file callbacks
                files_extracted = min(files_extracted + max(1, total_files // len(archive_files)), total_files)
                self._update_extraction_progress(game_info, game_info_path, f"Extracted {archive_name}", files_extracted, total_files)
            elif ext == '.zip':
                files_extracted = self._extract_zip(archive_path, extract_to, game_info, game_info_path, files_extracted, total_files)

            # Delete archive after successful extraction to save disk space
            try:
                os.remove(archive_path)
                logging.info(f"[TorrentHandler] Deleted archive: {archive_path}")
            except Exception as e:
                logging.warning(f"[TorrentHandler] Could not delete archive {archive_path}: {e}")

        self._update_extraction_progress(game_info, game_info_path, "Extraction complete", files_extracted, total_files)

    def _extract_zip(self, archive_path: str, extract_to: str, game_info: Dict, game_info_path: str, files_extracted: int, total_files: int) -> int:
        """Extract a ZIP file file-by-file so the UI can see progress."""
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            members = [zi for zi in zip_ref.infolist() if not zi.is_dir()]
            for zip_info in members:
                fname = zip_info.filename
                if fname.endswith('.url') or '_CommonRedist' in fname:
                    continue
                try:
                    zip_ref.extract(zip_info, extract_to)
                except RuntimeError as e:
                    if 'password' in str(e).lower() or 'encrypted' in str(e).lower():
                        zip_ref.extract(zip_info, extract_to, pwd=b'steamrip.com')
                    else:
                        raise
                files_extracted += 1
                if files_extracted % 25 == 0 or files_extracted == total_files:
                    self._update_extraction_progress(game_info, game_info_path, os.path.basename(fname), files_extracted, total_files)
        return files_extracted

    def _extract_with_cli(self, archive_path: str, extract_to: str):
        """Extract archives using the fastest available CLI tool (7z preferred)."""
        archive_size = os.path.getsize(archive_path)
        timeout_seconds = 14400 if archive_size > 50 * 1024 * 1024 * 1024 else 7200
        _CREATE_NO_WINDOW = 0x08000000

        # Prefer 7z because it handles both RAR and 7z and is usually fastest
        _7z_paths = [
            shutil.which('7z'), shutil.which('7za'),
            r'C:\Program Files\7-Zip\7z.exe',
            r'C:\Program Files (x86)\7-Zip\7z.exe',
        ]
        _7z_bin = next((p for p in _7z_paths if p and os.path.isfile(p)), None)
        if _7z_bin:
            logging.info(f"[TorrentHandler] Extracting with 7z: {_7z_bin}")
            proc = subprocess.Popen(
                [_7z_bin, 'x', '-psteamrip.com', f'-o{extract_to}', '-y', '-aoa', '-bsp0', '-bb0', archive_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                creationflags=_CREATE_NO_WINDOW
            )
            try:
                _, stderr = proc.communicate(timeout=timeout_seconds)
                if proc.returncode not in (0, 1):
                    err_msg = stderr.decode(errors='replace').strip() if stderr else ''
                    raise RuntimeError(f"7z extraction failed (exit {proc.returncode}): {err_msg}")
                logging.info("[TorrentHandler] 7z extraction completed successfully")
                return
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()
                raise RuntimeError(f"7z extraction timed out after {timeout_seconds // 3600} hour(s)")

        # Fallback to unrar for RAR files
        ext = os.path.splitext(archive_path)[1].lower()
        if ext == '.rar':
            _unrar_paths = [
                shutil.which('unrar'), shutil.which('WinRAR'),
                r'C:\Program Files\WinRAR\UnRAR.exe',
                r'C:\Program Files (x86)\WinRAR\UnRAR.exe',
                r'C:\Program Files\WinRAR\WinRAR.exe',
                r'C:\Program Files (x86)\WinRAR\WinRAR.exe',
            ]
            _unrar_bin = next((p for p in _unrar_paths if p and os.path.isfile(p)), None)
            if _unrar_bin:
                logging.info(f"[TorrentHandler] Extracting with unrar: {_unrar_bin}")
                proc = subprocess.Popen(
                    [_unrar_bin, 'x', '-y', '-psteamrip.com', archive_path, os.path.join(extract_to, '')],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    creationflags=_CREATE_NO_WINDOW
                )
                try:
                    proc.wait(timeout=timeout_seconds)
                    if proc.returncode in (0, 1):
                        logging.info("[TorrentHandler] unrar extraction completed successfully")
                        return
                    raise RuntimeError(f"unrar extraction failed (exit {proc.returncode})")
                except subprocess.TimeoutExpired:
                    proc.kill()
                    raise RuntimeError(f"unrar extraction timed out after {timeout_seconds // 3600} hour(s)")

        raise RuntimeError(f"No suitable extraction tool found for {archive_path}. Please install 7-Zip from https://7-zip.org/")

    def _find_setup_installer(self, torrent_folder: str, game: str) -> str:
        """Search for a setup.exe-style installer inside torrent_folder.
        Does NOT launch it - most repack installers require elevation (UAC),
        which we cannot silently grant from this background process, so the
        caller must prompt the user to run it manually as Administrator."""
        setup_candidates = []
        for root, _, files in os.walk(torrent_folder):
            for file in files:
                if file.lower().startswith(('setup', game.lower())) and file.lower().endswith('.exe'):
                    setup_candidates.append(os.path.join(root, file))

        if not setup_candidates:
            raise Exception("Could not find setup executable and no archives were found")

        # Prefer the shallowest match (closest to torrent_folder root)
        setup_candidates.sort(key=lambda p: p.count(os.sep))
        return setup_candidates[0]

    def _flatten_directories(self, install_dir: str, game: str):
        """Move content out of a single nested wrapper directory (e.g. torrent name folder)."""
        protected_files = {
            f"{sanitize_folder_name(game)}.ascendara.json",
            "filemap.ascendara.json",
        }

        subdirs = []
        for item in os.listdir(install_dir):
            item_path = os.path.join(install_dir, item)
            if os.path.isdir(item_path) and item != '_CommonRedist':
                subdirs.append(item_path)

        if len(subdirs) != 1:
            return

        target_dir = subdirs[0]
        target_name = os.path.basename(target_dir)

        # Only flatten if the subdir looks like a wrapper
        game_clean = re.sub(r'[^a-z0-9]', '', game.lower())
        dir_clean = re.sub(r'[^a-z0-9]', '', target_name.lower())
        is_wrapper = (
            game_clean == dir_clean or
            (len(dir_clean) >= 4 and game_clean.startswith(dir_clean)) or
            (len(dir_clean) >= 4 and dir_clean in game_clean and len(dir_clean) >= len(game_clean) * 0.5)
        )

        if not is_wrapper:
            return

        logging.info(f"[TorrentHandler] Flattening wrapper directory: {target_name}")
        for item in list(os.listdir(target_dir)):
            src = os.path.join(target_dir, item)
            dst = os.path.join(install_dir, item)
            if os.path.normpath(dst) == os.path.normpath(target_dir):
                continue
            if item in protected_files:
                continue
            if os.path.exists(dst):
                if os.path.isdir(dst):
                    shutil.rmtree(dst, ignore_errors=True)
                else:
                    os.remove(dst)
            try:
                shutil.move(src, dst)
            except Exception as e:
                logging.error(f"[TorrentHandler] Failed to move {src}: {e}")

        try:
            if not os.listdir(target_dir):
                shutil.rmtree(target_dir, ignore_errors=True)
        except Exception:
            pass

    def _detect_executable(self, install_dir: str, game: str) -> Optional[str]:
        """Find the best game executable in install_dir, similar to AscendaraDownloader."""
        try:
            exe_files = []
            for root, _, files in os.walk(install_dir):
                for file in files:
                    if file.lower().endswith('.exe'):
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path, install_dir)
                        exe_files.append({
                            'path': full_path,
                            'rel_path': rel_path,
                            'name': file,
                            'size': os.path.getsize(full_path)
                        })

            if not exe_files:
                return None

            best_exe = None
            best_score = -1
            game_name_lower = game.lower()
            sanitized_game = sanitize_folder_name(game).lower()

            skip_keywords = ['unins', 'uninstall', 'setup', 'installer', 'redist', 'vcredist',
                            'directx', 'dotnet', 'prerequisite', 'launcher', 'updater',
                            'crash', 'report', 'config', 'settings', 'easyanticheat',
                            'battleye', 'steam_api']

            for exe in exe_files:
                score = 0
                exe_name_lower = exe['name'].lower()

                if any(keyword in exe_name_lower for keyword in skip_keywords):
                    continue

                if sanitized_game in exe_name_lower or exe_name_lower.replace('.exe', '') == sanitized_game:
                    score += 300

                game_words = set(re.findall(r'\w+', game_name_lower))
                exe_words = set(re.findall(r'\w+', exe_name_lower.replace('.exe', '')))
                common_words = game_words & exe_words
                if common_words:
                    score += len(common_words) * 50

                depth = exe['rel_path'].count(os.sep)
                if depth == 0:
                    score += 100
                elif depth == 1:
                    score += 50

                if exe['size'] > 10 * 1024 * 1024:
                    score += 30
                elif exe['size'] > 1 * 1024 * 1024:
                    score += 10

                if score > best_score:
                    best_score = score
                    best_exe = exe

            if best_exe:
                logging.info(f"[TorrentHandler] Detected executable: {best_exe['rel_path']} (score {best_score})")
                return best_exe['path']
            return None
        except Exception as e:
            logging.error(f"[TorrentHandler] Error detecting executable: {e}")
            return None

    def _create_filemap(self, install_dir: str, watching_path: str):
        """Create filemap.ascendara.json with relative paths and sizes."""
        watching_data = {}
        for dirpath, _, filenames in os.walk(install_dir):
            rel_dir = os.path.relpath(dirpath, install_dir)
            for fname in filenames:
                if fname.endswith('.url') or '_CommonRedist' in dirpath:
                    continue
                full_path = os.path.join(dirpath, fname)
                rel_path = os.path.normpath(os.path.join(rel_dir, fname)) if rel_dir != '.' else fname
                rel_path = rel_path.replace('\\', '/')
                watching_data[rel_path] = {"size": os.path.getsize(full_path)}
        safe_write_json(watching_path, watching_data)
        logging.info(f"[TorrentHandler] Filemap created with {len(watching_data)} files")

    def _cleanup_junk_files(self, install_dir: str):
        """Remove .url files and _CommonRedist folders."""
        for root, dirs, files in os.walk(install_dir, topdown=False):
            for fname in files:
                if fname.endswith('.url'):
                    try:
                        os.remove(os.path.join(root, fname))
                    except Exception:
                        pass
            for d in dirs:
                if d.lower() == '_commonredist':
                    try:
                        shutil.rmtree(os.path.join(root, d), ignore_errors=True)
                    except Exception:
                        pass

    def _verify_files(self, install_dir: str, watching_path: str, game_info: Dict, game_info_path: str):
        """Verify extracted files match the recorded sizes."""
        if not os.path.exists(watching_path):
            return
        try:
            with open(watching_path, 'r') as f:
                watching_data = json.load(f)

            errors = []
            verified = 0
            for rel_path, info in watching_data.items():
                full_path = os.path.join(install_dir, rel_path.replace('/', os.sep))
                if not os.path.exists(full_path):
                    errors.append({"file": rel_path, "error": "File not found"})
                elif os.path.getsize(full_path) != info['size']:
                    errors.append({"file": rel_path, "error": "Size mismatch"})
                else:
                    verified += 1

            if errors:
                logging.warning(f"[TorrentHandler] Verification found {len(errors)} errors")
                game_info["downloadingData"]["verifyError"] = errors
            else:
                logging.info(f"[TorrentHandler] Verification complete: {verified} files OK")
            game_info["downloadingData"]["verifying"] = False
            safe_write_json(game_info_path, game_info)

        except Exception as e:
            logging.error(f"[TorrentHandler] Verification error: {e}")

def parse_boolean(value):
    if isinstance(value, bool):
        return value
    if value.lower() in ('true', 't', 'yes', 'y', '1'):
        return True
    if value.lower() in ('false', 'f', 'no', 'n', '0'):
        return False
    raise argparse.ArgumentTypeError('Boolean value expected.')

def main():
    parser = argparse.ArgumentParser(description='Ascendara Torrent Handler')
    parser.add_argument("magnet", help="Magnet link to download")
    parser.add_argument("game", help="Game name")
    parser.add_argument("online", type=parse_boolean, help="Is online game")
    parser.add_argument("dlc", type=parse_boolean, help="Is DLC")
    parser.add_argument("isVr", type=parse_boolean, help="Is the game a VR game (true/false)?")
    parser.add_argument("updateFlow", type=parse_boolean, help="Is this an update (true/false)?")
    parser.add_argument("version", help="Game version")
    parser.add_argument("size", help="Download size")
    parser.add_argument("dir", help="Download directory")
    parser.add_argument("--withNotification", help="Theme name for notifications (e.g. light, dark, blue)", default=None)
    parser.add_argument("--qbitHost", help="qBittorrent WebUI host", default="localhost")
    parser.add_argument("--qbitPort", help="qBittorrent WebUI port", type=int, default=8080)
    parser.add_argument("--qbitUsername", help="qBittorrent WebUI username", default="admin")
    parser.add_argument("--qbitPassword", help="qBittorrent WebUI password", default="adminadmin")
    
    try:
        if len(sys.argv) == 1:  # No arguments provided
            error_msg = "No arguments provided. Please provide all required arguments."
            logging.error(error_msg)
            launch_crash_reporter(1, error_msg)
            parser.print_help()
            sys.exit(1)
            
        args = parser.parse_args()
        logging.info(f"Starting torrent process for game: {args.game}")
        logging.debug(f"Arguments: magnet={args.magnet}, online={args.online}, dlc={args.dlc}, "
                     f"version={args.version}, size={args.size}, dir={args.dir}, "
                     f"withNotification={args.withNotification}")
        
        torrent_manager = TorrentManager(
            qbit_host=args.qbitHost,
            qbit_port=args.qbitPort,
            qbit_username=args.qbitUsername,
            qbit_password=args.qbitPassword,
        )
        torrent_manager.download_torrent(
            args.magnet,
            args.game,
            args.online,
            args.dlc,
            args.isVr,
            args.updateFlow,
            args.version,
            args.size,
            args.dir,
            args.withNotification
        )
        
        logging.info(f"Torrent process completed successfully for game: {args.game}")
        logging.info(f"Detailed logs have been saved to: {temp_log_file}")
        
    except (argparse.ArgumentError, SystemExit) as e:
        error_msg = "Invalid or missing arguments. Please provide all required arguments."
        logging.error(f"{error_msg} Error: {str(e)}")
        launch_crash_reporter(1, error_msg)
        parser.print_help()
        sys.exit(1)
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Error: {error_msg}")
        launch_crash_reporter(1, error_msg)
        sys.exit(1)

if __name__ == "__main__":
    main()