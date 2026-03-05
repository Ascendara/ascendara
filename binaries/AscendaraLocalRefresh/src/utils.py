"""
Utility functions shared across all scrapers
"""

import os
import sys
import json
import logging
from typing import Set, Tuple


# Character set for encoding post IDs (mixed case for visual variety)
GAME_ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz"  # 46 chars (no I, L, O, i, l, o)
GAME_ID_LENGTH = 6

# Scramble multiplier - a prime number to spread out sequential IDs
SCRAMBLE_MULT = 2971
SCRAMBLE_MOD = 46 ** 6  # Max value for 6 chars in base 46


def encode_game_id(post_id):
    """Convert numeric post_id to a 6-character identifier.
    Always produces the same output for the same input.
    Uses scrambling to make sequential IDs look more varied."""
    try:
        num = int(post_id)
    except (ValueError, TypeError):
        return ""
    
    scrambled = (num * SCRAMBLE_MULT) % SCRAMBLE_MOD
    
    base = len(GAME_ID_CHARS)
    result = []
    
    temp = scrambled
    for _ in range(GAME_ID_LENGTH):
        result.append(GAME_ID_CHARS[temp % base])
        temp //= base
    
    return ''.join(reversed(result))


def decode_game_id(game_id):
    """Convert 6-character identifier back to numeric post_id."""
    if not game_id or len(game_id) != GAME_ID_LENGTH:
        return None
    
    try:
        base = len(GAME_ID_CHARS)
        num = 0
        
        for char in game_id:
            if char not in GAME_ID_CHARS:
                return None
            num = num * base + GAME_ID_CHARS.index(char)
        
        inv = pow(SCRAMBLE_MULT, -1, SCRAMBLE_MOD)
        original = (num * inv) % SCRAMBLE_MOD
        
        return str(original)
    except Exception:
        return None


def get_blacklist_ids() -> Set[int]:
    """Read blacklisted game IDs from settings file and decode them to numeric IDs."""
    try:
        settings_path = None
        if sys.platform == 'win32':
            appdata = os.environ.get('APPDATA')
            if appdata:
                candidate = os.path.join(appdata, 'Electron', 'ascendarasettings.json')
                if os.path.exists(candidate):
                    settings_path = candidate
        elif sys.platform == 'darwin':
            candidate = os.path.join(os.path.expanduser('~/Library/Application Support/ascendara'), 'ascendarasettings.json')
            if os.path.exists(candidate):
                settings_path = candidate
        else:
            candidate = os.path.join(os.path.expanduser('~/.config/ascendara'), 'ascendarasettings.json')
            if os.path.exists(candidate):
                settings_path = candidate

        if settings_path and os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                blacklist = settings.get('blacklistIDs', [])
                numeric_ids = set()
                for encoded_id in blacklist:
                    decoded = decode_game_id(str(encoded_id))
                    if decoded:
                        numeric_ids.add(int(decoded))
                logging.info(f"Loaded {len(numeric_ids)} blacklisted IDs from settings")
                return numeric_ids
    except Exception as e:
        logging.error(f"Failed to read blacklist from settings: {e}")
    return set()


def get_notification_settings() -> Tuple[bool, str]:
    """Read notification settings from settings file. Returns (enabled, theme) tuple."""
    try:
        settings_path = None
        if sys.platform == 'win32':
            appdata = os.environ.get('APPDATA')
            if appdata:
                candidate = os.path.join(appdata, 'Electron', 'ascendarasettings.json')
                if os.path.exists(candidate):
                    settings_path = candidate
        elif sys.platform == 'darwin':
            candidate = os.path.join(os.path.expanduser('~/Library/Application Support/ascendara'), 'ascendarasettings.json')
            if os.path.exists(candidate):
                settings_path = candidate
        else:
            candidate = os.path.join(os.path.expanduser('~/.config/ascendara'), 'ascendarasettings.json')
            if os.path.exists(candidate):
                settings_path = candidate

        if settings_path and os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                enabled = settings.get('localRefreshNotifications', False)
                theme = settings.get('theme', 'dark')
                return enabled, theme
    except Exception as e:
        logging.error(f"Failed to read notification settings: {e}")
    return False, 'dark'


def send_notification(title: str, message: str):
    """Send a desktop notification using platform-specific methods."""
    try:
        enabled, theme = get_notification_settings()
        if not enabled:
            return
        
        if sys.platform == 'win32':
            try:
                from win10toast import ToastNotifier
                toaster = ToastNotifier()
                icon_path = get_icon_path()
                toaster.show_toast(
                    title,
                    message,
                    icon_path=icon_path,
                    duration=5,
                    threaded=True
                )
            except ImportError:
                logging.warning("win10toast not available, skipping notification")
        elif sys.platform == 'darwin':
            import subprocess
            subprocess.run([
                'osascript', '-e',
                f'display notification "{message}" with title "{title}"'
            ])
    except Exception as e:
        logging.error(f"Failed to send notification: {e}")


def get_icon_path() -> str:
    """Get the path to the Ascendara icon file."""
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    icon_path = os.path.join(base_path, 'ascendara.ico')
    if os.path.exists(icon_path):
        return icon_path
    return None


def sanitize_filename(filename: str) -> str:
    """Remove or replace characters that are invalid in filenames."""
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '')
    filename = filename.strip('. ')
    return filename
