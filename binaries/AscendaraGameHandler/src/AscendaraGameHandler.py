# ==============================================================================
# Ascendara Game Handler
# ==============================================================================
# Game process manager for the Ascendara Game Launcher. Handles game execution,
# process monitoring, and Discord Rich Presence integration.
# Read more about the Game Handler here:
# https://ascendara.app/docs/binary-tool/game-handler










import os
import sys
import time
import json
import logging
import platform
import subprocess
from datetime import datetime
import ctypes
import atexit
from pypresence import Presence
import argparse
import psutil
import asyncio
from datetime import datetime

if sys.platform == 'darwin':
    ascendara_dir = os.path.join(os.path.expanduser('~/Library/Application Support'), 'ascendara')
else:
    ascendara_dir = os.path.join(os.environ.get('APPDATA', ''), 'ascendara')

log_file_path = os.path.join(ascendara_dir, 'gamehandler.log')

# Ensure the log directory exists
os.makedirs(ascendara_dir, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.FileHandler(log_file_path, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)

CLIENT_ID = '1277379302945718356'

def _launch_crash_reporter_on_exit(error_code, error_message):
    logging.info(f"[ENTRY] _launch_crash_reporter_on_exit(error_code={error_code}, error_message={error_message})")
    try:
        crash_reporter_path = os.path.join('./AscendaraCrashReporter.exe')
        logging.info(f"Attempting to launch crash reporter with error code {error_code}")
        if os.path.exists(crash_reporter_path):
            subprocess.Popen(
                [crash_reporter_path, "gamehandler", str(error_code), error_message],
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            logging.info("Crash reporter launched successfully")
            logging.info("[EXIT] _launch_crash_reporter_on_exit() - Success")
        else:
            logging.error(f"Crash reporter not found at: {crash_reporter_path}")
            logging.info("[EXIT] _launch_crash_reporter_on_exit() - NotFound")
    except Exception as e:
        logging.error(f"Failed to launch crash reporter: {e}", exc_info=True)
        logging.info("[EXIT] _launch_crash_reporter_on_exit() - Exception")

def launch_crash_reporter(error_code, error_message):
    """Register the crash reporter to launch on exit with the given error details"""
    logging.info(f"[ENTRY] launch_crash_reporter(error_code={error_code}, error_message={error_message})")
    if not hasattr(launch_crash_reporter, "_registered"):
        logging.info(f"Registering crash reporter with error code {error_code}: {error_message}")
        atexit.register(_launch_crash_reporter_on_exit, error_code, error_message)
        launch_crash_reporter._registered = True
        logging.debug("Crash reporter registered successfully")
        logging.info("[EXIT] launch_crash_reporter() - Registered")
    else:
        logging.info("[EXIT] launch_crash_reporter() - AlreadyRegistered")

def setup_discord_rpc():
    logging.info("[ENTRY] setup_discord_rpc()")
    try:
        logging.info("Initializing Discord Rich Presence")
        rpc = Presence(CLIENT_ID)
        rpc.connect()
        logging.info("Successfully connected to Discord RPC")
        logging.info("[EXIT] setup_discord_rpc() - Success")
        return rpc
    except Exception as e:
        logging.error(f"Failed to connect to Discord RPC: {e}", exc_info=True)
        logging.info("[EXIT] setup_discord_rpc() - Failure")
        return None

def update_discord_presence(rpc, game_name):
    logging.info(f"[ENTRY] update_discord_presence(game_name={game_name})")
    if rpc:
        try:
            logging.info(f"Updating Discord presence for game: {game_name}")
            rpc.update(
                details="Playing a Game",
                state=game_name,
                start=int(time.time()),
                large_image="ascendara",
                large_text="Ascendara",
                buttons=[{"label": "Play on Ascendara", "url": "https://ascendara.app/"}]
            )
            logging.debug("Discord presence updated successfully")
            logging.info("[EXIT] update_discord_presence() - Success")
        except Exception as e:
            logging.error(f"Failed to update Discord presence: {e}", exc_info=True)
            logging.info("[EXIT] update_discord_presence() - Failure")
    else:
        logging.warning("[EXIT] update_discord_presence() - No RPC client provided")

def clear_discord_presence(rpc):
    logging.info("[ENTRY] clear_discord_presence()")
    if rpc:
        try:
            logging.info("Clearing Discord presence")
            rpc.clear()
            rpc.close()
            logging.debug("Discord presence cleared and connection closed")
            logging.info("[EXIT] clear_discord_presence() - Success")
        except Exception as e:
            logging.error(f"Failed to clear Discord presence: {e}", exc_info=True)
            logging.info("[EXIT] clear_discord_presence() - Failure")
    else:
        logging.warning("[EXIT] clear_discord_presence() - No RPC client provided")

def is_process_running(exe_path):
    logging.info(f"[ENTRY] is_process_running(exe_path={exe_path})")
    exe_name = os.path.basename(exe_path)
    logging.debug(f"Checking if process is running: {exe_name}")
    try:
        for proc in psutil.process_iter(['name']):
            try:
                if proc.info['name'] == exe_name:
                    logging.info(f"Process found running: {exe_name}")
                    logging.info(f"[EXIT] is_process_running() - True")
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess) as e:
                logging.debug(f"Process check error for {exe_name}: {e}")
                pass
        logging.debug(f"Process not found: {exe_name}")
        logging.info(f"[EXIT] is_process_running() - False")
        return False
    except Exception as e:
        logging.error(f"Exception in is_process_running: {e}", exc_info=True)
        logging.info(f"[EXIT] is_process_running() - Exception")
        return False

def update_play_time(file_path, is_custom_game, game_entry=None):
    """Update the playTime field in either the game's JSON file or games.json for custom games"""
    logging.info(f"[ENTRY] update_play_time(file_path={file_path}, is_custom_game={is_custom_game})")
    try:
        logging.debug(f"Updating play time for {'custom' if is_custom_game else 'regular'} game at {file_path}")
        with open(file_path, "r") as f:
            data = json.load(f)
        if is_custom_game:
            for game in data["games"]:
                if game["executable"] == game_entry["executable"]:
                    if "playTime" not in game:
                        game["playTime"] = 0
                    game["playTime"] += 1
                    logging.info(f"Updated play time for custom game {game_entry.get('name', 'Unknown')}: {game['playTime']} minutes")
                    break
        else:
            if "playTime" not in data:
                data["playTime"] = 0
            data["playTime"] += 1
            logging.info(f"Updated play time for game: {data['playTime']} minutes")
        with open(file_path, "w") as f:
            json.dump(data, f, indent=4)
        logging.debug("Play time update saved successfully")
        logging.info(f"[EXIT] update_play_time() - Success")
    except Exception as e:
        logging.error(f"Failed to update play time: {e}", exc_info=True)
        logging.info(f"[EXIT] update_play_time() - Exception")

def get_ludusavi_settings():
    logging.info("[ENTRY] get_ludusavi_settings()")
    try:
        if sys.platform == 'darwin':
            settings_path = os.path.join(os.path.expanduser('~/Library/Application Support'), 'ascendara', 'ascendarasettings.json')
        else:
            settings_path = os.path.join(os.environ.get('APPDATA', ''), 'ascendara', 'ascendarasettings.json')
        logging.debug(f"Checking Ludusavi settings at: {settings_path}")
        if os.path.exists(settings_path):
            with open(settings_path, 'r') as f:
                settings = json.load(f)
                ludusavi_settings = settings.get('ludusavi')
                if ludusavi_settings and ludusavi_settings.get('enabled') is True:
                    logging.info("[EXIT] get_ludusavi_settings() - Ludusavi enabled and settings loaded")
                    return ludusavi_settings
                else:
                    logging.info("Ludusavi not enabled in settings")
        else:
            logging.warning(f"Ludusavi settings file does not exist: {settings_path}")
        logging.info("[EXIT] get_ludusavi_settings() - None")
        return None
    except Exception as e:
        logging.error(f"Failed to load Ludusavi settings: {e}", exc_info=True)
        logging.info("[EXIT] get_ludusavi_settings() - Exception")
        return None

def run_ludusavi_backup(game_name):
    """
    Run Ludusavi backup for a specific game
    """
    logging.info(f"[ENTRY] run_ludusavi_backup(game_name={game_name})")
    ludusavi_settings = get_ludusavi_settings()
    if not ludusavi_settings:
        logging.info("Ludusavi backup skipped: not enabled in settings")
        logging.info("[EXIT] run_ludusavi_backup() - Skipped")
        return False
    try:
        ludusavi_path = os.path.join("./ludusavi.exe")
        if not os.path.exists(ludusavi_path):
            logging.error(f"Ludusavi executable not found at: {ludusavi_path}")
            logging.info("[EXIT] run_ludusavi_backup() - No executable")
            return False
        backup_location = ludusavi_settings.get('backupLocation')
        backup_format = ludusavi_settings.get('backupFormat', 'zip')
        backups_to_keep = ludusavi_settings.get('backupOptions', {}).get('backupsToKeep', 5)
        compression_level = ludusavi_settings.get('backupOptions', {}).get('compressionLevel', 'default')
        if compression_level == 'default':
            compression_level = 'deflate'
        cmd = [
            ludusavi_path,
            "--path", backup_location,
            "--format", backup_format,
            "--full-limit", str(backups_to_keep),
            "--compression", compression_level,
            "--force"
        ]
        if ludusavi_settings.get('backupOptions', {}).get('skipManifestCheck', False):
            cmd.append("--no-manifest-update")
        cmd.extend(["backup", game_name])
        logging.info(f"Running Ludusavi backup for {game_name} with command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            logging.info(f"Ludusavi backup completed successfully for {game_name}")
            logging.info("[EXIT] run_ludusavi_backup() - Success")
            return True
        else:
            logging.error(f"Ludusavi backup failed: {result.stderr}")
            logging.info("[EXIT] run_ludusavi_backup() - Failure")
            return False
    except Exception as e:
        logging.error(f"Error running Ludusavi backup: {e}", exc_info=True)
        logging.info("[EXIT] run_ludusavi_backup() - Exception")
        return False

def execute(game_path, is_custom_game, admin, is_shortcut=False, use_ludusavi=False):
    logging.info(f"[ENTRY] execute(game_path={game_path}, is_custom_game={is_custom_game}, admin={admin}, is_shortcut={is_shortcut}, use_ludusavi={use_ludusavi})")
    rpc = None  # Discord RPC client
    logging.debug("Initialized rpc=None for Discord Rich Presence")
    if is_shortcut:
        logging.info("Shortcut mode enabled, setting up Discord RPC")
        rpc = setup_discord_rpc()

    json_file_path = None
    games_json_path = None
    game_entry = None
    game_name = None
    if sys.platform == 'darwin':
        settings_file = os.path.join(os.path.expanduser('~/Library/Application Support'), 'ascendara', 'ascendarasettings.json')
    else:
        settings_file = os.path.join(os.environ.get('APPDATA', ''), 'ascendara', 'ascendarasettings.json')
    logging.debug(f"Initial settings_file path: {settings_file}")

    if not is_custom_game:
        game_dir, exe_name = os.path.split(game_path)
        exe_path = os.path.join(game_dir, exe_name)
        
        # First, try to find the game's root directory by looking for the .ascendara.json file
        # Start from the executable's directory and move up until we find it
        current_dir = game_dir
        found_json = False
        
        while current_dir and os.path.dirname(current_dir) != current_dir:
            dir_name = os.path.basename(current_dir)
            potential_json = os.path.join(current_dir, f"{dir_name}.ascendara.json")
            
            if os.path.exists(potential_json):
                json_file_path = potential_json
                game_name = dir_name
                found_json = True
                break
                
            # Also check for a JSON file with the same name as the parent directory
            parent_dir = os.path.dirname(current_dir)
            parent_name = os.path.basename(parent_dir)
            potential_parent_json = os.path.join(parent_dir, f"{parent_name}.ascendara.json")
            
            if os.path.exists(potential_parent_json):
                json_file_path = potential_parent_json
                game_name = parent_name
                found_json = True
                break
                
            # Move up one directory
            current_dir = parent_dir
            
        # If we couldn't find the JSON file, fall back to the original behavior
        if not found_json:
            game_name = os.path.basename(game_dir)
            json_file_path = os.path.join(game_dir, f"{game_name}.ascendara.json")
            
            if not os.path.exists(json_file_path):
                parent_dir = os.path.dirname(game_dir)
                parent_name = os.path.basename(parent_dir)
                json_file_path = os.path.join(parent_dir, f"{parent_name}.ascendara.json")
    else:
        exe_path = game_path
        user_data_dir = os.path.join(os.environ['APPDATA'], 'ascendara')
        settings_file = os.path.join(user_data_dir, 'ascendarasettings.json')
        with open(settings_file, 'r') as f:
            settings = json.load(f)
        download_dir = settings.get('downloadDirectory')
        if not download_dir:
            logging.error('Download directory not found in ascendarasettings.json')
            logging.info("[EXIT] execute due to missing download_dir for custom game")
            return
        games_json_path = os.path.join(download_dir, 'games.json')
        with open(games_json_path, 'r') as f:
            games_data = json.load(f)
        game_entry = next((game for game in games_data['games'] if game['executable'] == exe_path), None)
        if game_entry is None:
            logging.error(f"Game not found in games.json for executable path: {exe_path}")
            logging.info("[EXIT] execute due to missing game_entry for custom game")
            return
        game_name = game_entry.get("name", os.path.basename(os.path.dirname(exe_path)))
    
    logging.info(f"Resolved game_dir: {os.path.dirname(exe_path)}, exe_path: {exe_path}")

    if not os.path.isfile(exe_path):
        logging.error(f"Executable file does not exist: {exe_path}")
        error = "The exe file does not exist"
        if not is_custom_game:
            with open(json_file_path, "r") as f:
                data = json.load(f)
            data["runError"] = error
            with open(json_file_path, "w") as f:
                json.dump(data, f, indent=4)
        else:
            logging.error(error)
        return

    def update_launch_count(file_path, increment=True):
        logging.debug(f"update_launch_count called for {file_path}, increment={increment}")
        try:
            with open(file_path, "r") as f:
                data = json.load(f)
            if "launchCount" not in data:
                data["launchCount"] = 0
            data["launchCount"] += 1 if increment else -1
            data["launchCount"] = max(0, data["launchCount"])
            with open(file_path, "w") as f:
                json.dump(data, f, indent=4)
        except Exception as e:
            logging.error(f"Error updating launch count for {file_path}: {e}", exc_info=True)

    if not is_custom_game:
        update_launch_count(json_file_path)
        logging.info(f"Incremented launch count and set isRunning for {json_file_path}")
        with open(json_file_path, "r") as f:
            game_data = json.load(f)
        game_data["isRunning"] = True
        with open(json_file_path, "w") as f:
            json.dump(game_data, f, indent=4)
    else:
        with open(games_json_path, "r") as f:
            games_data = json.load(f)
        for game in games_data["games"]:
            if game["executable"] == exe_path:
                if "launchCount" not in game:
                    game["launchCount"] = 0
                game["launchCount"] += 1
                game["isRunning"] = True
                logging.info(f"Incremented launch count and set isRunning for custom game: {exe_path}")
                break
        with open(games_json_path, "w") as f:
            json.dump(games_data, f, indent=4)

    try:
        with open(settings_file, "r") as f:
            settings_data = json.load(f)
        if "runningGames" not in settings_data:
            settings_data["runningGames"] = {}
        settings_data["runningGames"][game_name] = exe_path
        with open(settings_file, "w") as f:
            json.dump(settings_data, f, indent=4)
        logging.info(f"Updated runningGames in {settings_file} for {game_name}")
    except Exception as e:
        logging.error(f"Error updating settings.json: {e}", exc_info=True)

    try:
        # Determine if we need to use Wine
        is_windows_exe = exe_path.lower().endswith('.exe')
        is_mac = platform.system().lower() == 'darwin'
        use_wine = is_windows_exe and is_mac
        logging.debug(f"Executable type: {'Windows' if is_windows_exe else 'Other'}, running on macOS: {is_mac}, use_wine: {use_wine}")
        
        if os.path.dirname(exe_path):
            os.chdir(os.path.dirname(exe_path))
            logging.debug(f"Changed working directory to {os.path.dirname(exe_path)}")
        
        def launch_with_wine_dxvk(exe_path, wine_prefix=None, wine_bin="wine"): 
            env = os.environ.copy()
            # Set WINEPREFIX if provided
            if wine_prefix:
                env["WINEPREFIX"] = wine_prefix
            # DXVK environment variables
            env["DXVK_LOG_LEVEL"] = "info"
            # Add more DXVK or Vulkan/MoltenVK variables as needed
            # Example: env["DXVK_HUD"] = "1"
            logging.info(f"Launching with Wine binary: {wine_bin}, WINEPREFIX: {env.get('WINEPREFIX', 'default')}")
            return subprocess.Popen([wine_bin, exe_path], env=env)

        # Default Wine prefix (edit as needed)
        default_wine_prefix = os.path.expanduser("~/.wine")
        # Allow override via settings or env if desired in the future
        wine_bin = "wine"  # Could be replaced with a path to Crossover or custom Wine

        if use_wine:
            logging.info(f"Using Wine + DXVK to launch Windows executable: {exe_path}")
            process = launch_with_wine_dxvk(exe_path, wine_prefix=default_wine_prefix, wine_bin=wine_bin)
        else:
            # Regular game execution (no wrapping)
            logging.info(f"Launching executable directly: {exe_path}")
            
            # Check if admin launch is requested and we're on Windows
            if admin and platform.system().lower() == 'windows':
                logging.info(f"Launching with admin privileges: {exe_path}")
                try:
                    # Use ShellExecute with 'runas' verb to prompt for admin
                    exe_dir = os.path.dirname(exe_path)
                    exe_file = os.path.basename(exe_path)
                    ctypes.windll.shell32.ShellExecuteW(
                        None,  # hwnd
                        "runas",  # operation (runas = run as administrator)
                        exe_path,  # file
                        None,  # parameters
                        exe_dir,  # directory
                        1  # show command (1 = normal window)
                    )
                    # Create a dummy process that we can monitor
                    # This is needed because ShellExecute doesn't return a process handle
                    process = subprocess.Popen(["cmd", "/c", "echo Admin launch initiated"], 
                                            stdout=subprocess.PIPE, 
                                            stderr=subprocess.PIPE)
                    # Wait a moment for the admin process to start
                    time.sleep(1)
                    # Return early since we can't monitor the admin process
                    logging.info("Admin process launched, handler will exit after brief delay")
                    # Allow a short time for the game to start before exiting
                    time.sleep(3)
                    return
                except Exception as e:
                    logging.error(f"Failed to launch with admin privileges: {e}", exc_info=True)
                    # Fall back to regular launch
                    logging.info("Falling back to regular launch")
                    process = subprocess.Popen(exe_path)
            else:
                process = subprocess.Popen(exe_path)

        start_time = time.time()
        last_update = start_time
        last_play_time = 0

        logging.info("Entering game process monitoring loop")
        while process.poll() is None:
            current_time = time.time()
            elapsed = int(current_time - last_update)
            if elapsed >= 1:
                last_play_time = elapsed
                if is_custom_game and games_json_path:
                    logging.debug(f"Updating play time for custom game during run: {game_name}")
                    update_play_time(games_json_path, True, game_entry)
                elif json_file_path:
                    logging.debug(f"Updating play time for regular game during run: {game_name}")
                    update_play_time(json_file_path, False)
                last_update = current_time
            time.sleep(0.1)
        logging.info("Game process ended")

        process.wait()
        return_code = process.returncode
        logging.info(f"Game process exited with return code: {return_code}")

        try:
            with open(settings_file, 'r') as f:
                settings_data = json.load(f)
            if 'runningGames' in settings_data:
                if game_name in settings_data['runningGames']:
                    del settings_data['runningGames'][game_name]
                    logging.info(f"Removed {game_name} from runningGames in {settings_file}")
            with open(settings_file, 'w') as f:
                json.dump(settings_data, f, indent=4)
        except Exception as e:
            logging.error(f"Error updating settings.json on exit: {e}", exc_info=True)

        # Run Ludusavi backup after game closes if enabled
        if use_ludusavi and game_name:
            logging.info(f"Game closed, running Ludusavi backup for {game_name}")
            backup_success = run_ludusavi_backup(game_name)
            if backup_success:
                logging.info(f"Ludusavi backup succeeded for {game_name}")
            else:
                logging.error(f"Ludusavi backup failed for {game_name}")

        if is_custom_game and games_json_path:
            with open(games_json_path, "r") as f:
                data = json.load(f)
            for game in data["games"]:
                if game["executable"] == exe_path:
                    if last_play_time < 1 and "playTime" in game:
                        game["playTime"] = max(0, game["playTime"] - 1)
                        logging.info(f"Play time for custom game {game_name} was less than 1 minute; decremented playTime")
                    game["isRunning"] = False
                    logging.info(f"Set isRunning=False for custom game {game_name}")
                    break
            with open(games_json_path, "w") as f:
                json.dump(data, f, indent=4)
        elif json_file_path:
            with open(json_file_path, "r") as f:
                data = json.load(f)
            if last_play_time < 1:
                data["playTime"] = max(0, data["playTime"] - 1)
                logging.info(f"Play time for game {game_name} was less than 1 minute; decremented playTime")
            data["isRunning"] = False
            logging.info(f"Set isRunning=False for game {game_name}")
            with open(json_file_path, "w") as f:
                json.dump(data, f, indent=4)

        if is_shortcut and rpc:
            logging.info("Clearing Discord Rich Presence after game exit")
            clear_discord_presence(rpc)
        logging.info(f"[EXIT] execute for game: {game_name}")

    except Exception as e:
        logging.error(f"Exception occurred during game execution: {e}", exc_info=True)
        if is_custom_game and games_json_path:
            update_launch_count(games_json_path, False)
            with open(games_json_path, "r") as f:
                data = json.load(f)
            for game in data["games"]:
                if game["executable"] == exe_path:
                    game["isRunning"] = False
                    logging.info(f"Set isRunning=False for custom game {exe_path} due to exception")
                    break
            with open(games_json_path, "w") as f:
                json.dump(data, f, indent=4)
        elif json_file_path:
            update_launch_count(json_file_path, False)
            with open(json_file_path, "r") as f:
                data = json.load(f)
            data["isRunning"] = False
            logging.info(f"Set isRunning=False for game {exe_path} due to exception")
            with open(json_file_path, "w") as f:
                json.dump(data, f, indent=4)
        atexit.register(launch_crash_reporter, 1, str(e))
        logging.info(f"[EXIT] execute due to exception for game: {exe_path}")

if __name__ == "__main__":
    try:
        print("[DEBUG] Script started.")
        # The script is called with: [script] [game_path] [is_custom_game] [--shortcut] [--ludusavi]
        # Skip the first argument (script name)
        args = sys.argv[1:]
        print(f"[DEBUG] Arguments received: {args}")
        
        # Configure logging first
        log_file = os.path.join(os.path.dirname(__file__), 'gamehandler.log')
        print(f"[DEBUG] Logging to: {log_file}")
        logging.basicConfig(
            filename=log_file,
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        print("[DEBUG] Logging configured.")
        
        logging.info("=== Ascendara Game Handler Started ===")
        logging.info(f"Arguments received: {args}")
        
        if len(args) < 2:
            error_msg = "Error: Not enough arguments\nUsage: AscendaraGameHandler.exe [game_path] [is_custom_game] [admin] [--shortcut] [--ludusavi]"
            logging.error(error_msg)
            print(error_msg)
            sys.exit(1)
            
        game_path = args[0]
        is_custom_game = args[1] == '1' or args[1].lower() == 'true'
        admin = args[2] == '1' or args[2].lower() == 'true'
        is_shortcut = "--shortcut" in args
        use_ludusavi = "--ludusavi" in args
        
        logging.info(f"Initializing with: game_path={game_path}, is_custom_game={is_custom_game}, "  
                     f"is_shortcut={is_shortcut}, use_ludusavi={use_ludusavi}, admin={admin}")
        print(f"[DEBUG] Initializing with: game_path={game_path}, is_custom_game={is_custom_game}, is_shortcut={is_shortcut}, use_ludusavi={use_ludusavi}, admin={admin}")

        execute(game_path, is_custom_game, admin, is_shortcut, use_ludusavi)
        print("[DEBUG] execute() finished.")
    except Exception as e:
        logging.error(f"Failed to execute game: {e}")
        print(f"[ERROR] Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        atexit.register(launch_crash_reporter, 1, str(e))
