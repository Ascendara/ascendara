# ==============================================================================
# Ascendara Language Translation
# ==============================================================================
# A command-line tool for translating Ascendara language files
# Read more about the Language Translator Tool here:
# https://ascendara.app/docs/binary-tool/language-translator






import json
import os
import sys
import time
import logging
import argparse
import requests
from collections import deque
from threading import Lock
import subprocess
import atexit
from typing import Dict, Any

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Rate limiting setup - 8 requests per second
class RateLimiter:
    def __init__(self, max_per_second):
        self.delay = 1.0 / float(max_per_second)
        self.last_requests = deque(maxlen=max_per_second)
        self.lock = Lock()

    def wait(self):
        with self.lock:
            now = time.time()
            # Remove requests older than 1 second
            while self.last_requests and now - self.last_requests[0] >= 1.0:
                self.last_requests.popleft()
            
            # If we haven't hit the limit, proceed immediately
            if len(self.last_requests) < self.last_requests.maxlen:
                self.last_requests.append(now)
                return
            
            # Otherwise, wait until we can make another request
            sleep_time = 1.0 - (now - self.last_requests[0])
            if sleep_time > 0:
                time.sleep(sleep_time)
            self.last_requests.append(time.time())

# Global rate limiter
rate_limiter = RateLimiter(8)

def _launch_crash_reporter_on_exit(error_code, error_message):
    try:
        binary_name = 'AscendaraCrashReporter.exe' if sys.platform == 'win32' else 'AscendaraCrashReporter'
        crash_reporter_path = os.path.join('.', binary_name)
        if os.path.exists(crash_reporter_path):
            kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
            subprocess.Popen(
                [crash_reporter_path, "languagetranslation", str(error_code), error_message],
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

def get_window_tkk():
    """Get the TKK value from Google Translate"""
    try:
        rate_limiter.wait()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        response = requests.get('https://translate.google.com', headers=headers, timeout=10)
        response.raise_for_status()
        # Extract TKK from response
        code = response.text
        tkk_start = code.find("tkk:'") + 5
        if tkk_start == 4:  # Not found
            logging.warning("TKK not found in response, using default")
            return "0"
        tkk_end = code.find("',", tkk_start)
        if tkk_end == -1:
            logging.warning("TKK end not found in response, using default")
            return "0"
        tkk_expr = code[tkk_start:tkk_end]
        logging.debug(f"Found TKK: {tkk_expr}")
        return tkk_expr
    except Exception as e:
        logging.error(f"Error getting TKK: {str(e)}")
        return "0"

def generate_token(text):
    """Generate Google Translate token for the text"""
    def xr(a, b):
        for c in range(0, len(b) - 2, 3):
            d = b[c + 2]
            d = ord(d[0]) - 87 if d >= 'a' else int(d)
            d = (a >> d) if b[c + 1] == '+' else (a << d)
            a = (a + d) & 4294967295 if b[c] == '+' else a ^ d
        return a

    tkk = get_window_tkk()
    try:
        b = int(tkk.split('.')[0])
    except (ValueError, IndexError):
        logging.warning("Invalid TKK format, using default")
        b = 0
    
    # Convert text to UTF-8 bytes then to list of char codes
    e = []
    g = 0
    while g < len(text):
        l = ord(text[g])
        if l < 128:
            e.append(l)
        else:
            if l < 2048:
                e.append(l >> 6 | 192)
            else:
                if (l & 64512) == 55296 and g + 1 < len(text) and (ord(text[g + 1]) & 64512) == 56320:
                    g += 1
                    l = 65536 + ((l & 1023) << 10) + (ord(text[g]) & 1023)
                    e.append(l >> 18 | 240)
                    e.append(l >> 12 & 63 | 128)
                else:
                    e.append(l >> 12 | 224)
                    e.append(l >> 6 & 63 | 128)
                e.append(l & 63 | 128)
        g += 1

    a = b
    for f in e:
        a = xr(a + f, "+-a^+6")
    a = xr(a, "+-3^+b+-f")
    
    if '.' in tkk:
        try:
            a ^= int(tkk.split('.')[1])
        except (ValueError, IndexError):
            pass
    
    if a < 0:
        a = (a & 2147483647) + 2147483648
    a %= 1000000

    return f"{a}.{a ^ b}"

class TranslationProgress:
    def __init__(self, language_code):
        self.progress_file = os.path.join(os.path.expanduser("~"), "translation_progress.ascendara.json")
        self.language_code = language_code
        self.lock = Lock()
        self.total_strings = 0
        self.translated_strings = 0
        self.current_phase = "initializing"
        self._update_progress()
    
    def _update_progress(self):
        """Write progress to file with thread safety"""
        with self.lock:
            progress = {
                "languageCode": self.language_code,
                "phase": self.current_phase,
                "progress": round(self.translated_strings / max(1, self.total_strings), 2),
                "timestamp": time.time()
            }
            try:
                with open(self.progress_file, 'w', encoding='utf-8') as f:
                    json.dump(progress, f)
            except Exception as e:
                logging.error(f"Error writing progress: {str(e)}")

    def set_phase(self, phase):
        """Update the current translation phase"""
        self.current_phase = phase
        self._update_progress()

    def count_string(self):
        """Increment total string count"""
        self.total_strings += 1
        self._update_progress()

    def mark_translated(self):
        """Mark a string as translated"""
        self.translated_strings += 1
        self._update_progress()

def count_strings(d, progress):
    """Count total number of strings in a nested dictionary"""
    for value in d.values():
        if isinstance(value, dict):
            count_strings(value, progress)
        elif isinstance(value, str):
            progress.count_string()

def translate_text(text, target_lang):
    """Translate text using Google Translate web API"""
    if not text.strip():
        return text

    url = 'https://translate.google.com/translate_a/single'
    params = {
        'client': 'gtx',
        'sl': 'en',
        'tl': target_lang,
        'hl': target_lang,
        'dt': ['at', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't'],
        'ie': 'UTF-8',
        'oe': 'UTF-8',
        'otf': 1,
        'ssel': 0,
        'tsel': 0,
        'kc': 7,
        'q': text
    }
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': 'https://translate.google.com/'
    }

    try:
        # Apply rate limiting
        rate_limiter.wait()
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        result = response.json()
        
        if isinstance(result, list) and result and isinstance(result[0], list):
            translation = ''
            for item in result[0]:
                if item and isinstance(item, list) and item[0]:
                    translation += item[0]
            return translation
        else:
            logging.warning(f"Unexpected response format: {result}")
            return text  # Return original text if translation fails
            
    except Exception as e:
        logging.error(f"Translation error for text '{text[:50]}...': {str(e)}")
        return text  # Return original text if translation fails

def translate_dict(d, target_lang, progress):
    """Recursively translate all string values in a dictionary"""
    result = {}
    
    # Use a queue for breadth-first traversal to maintain a more predictable progress
    queue = deque([([], d, result)])
    
    while queue:
        path, current_dict, output_dict = queue.popleft()
        
        for key, value in current_dict.items():
            if isinstance(value, dict):
                output_dict[key] = {}
                queue.append((path + [key], value, output_dict[key]))
            elif isinstance(value, str):
                try:
                    translated = translate_text(value, target_lang)
                    output_dict[key] = translated
                    if translated != value:  # Only count if actually translated
                        progress.mark_translated()
                    logging.debug(f"Translated '{value[:30]}...' -> '{translated[:30]}...'")
                except Exception as e:
                    logging.error(f"Translation error for {'.'.join(path + [key])}: {str(e)}")
                    output_dict[key] = value
            else:
                output_dict[key] = value
    
    return result

def get_english_translations():
    """Get English translations from the Ascendara API"""
    try:
        rate_limiter.wait()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
        }
        logging.debug("Fetching English translations from API...")
        response = requests.get('https://api.ascendara.app/language/en', headers=headers, timeout=10)
        logging.debug(f"API Response status: {response.status_code}")
        response.raise_for_status()
        data = response.json()
        logging.debug(f"Received {len(str(data))} bytes of translation data")
        return data
    except Exception as e:
        logging.error(f"Error fetching English translations: {str(e)}")
        raise  # Let the main function handle the error

def get_base_path():
    """Get the base path for the application, handling both PyInstaller and regular execution"""
    if getattr(sys, 'frozen', False):
        # Running as compiled exe
        base_path = os.path.dirname(sys.executable)
        logging.debug(f"Running from exe: {base_path}")
    else:
        # Running as script
        base_path = os.path.dirname(os.path.abspath(__file__))
        logging.debug(f"Running from script: {base_path}")
    return base_path

def save_translations(translations, output_path):
    """Save translations to a JSON file"""
    try:
        logging.debug(f"Saving translations to: {output_path}")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(translations, f, ensure_ascii=False, indent=2)
        
        # Fetch and save language version
        try:
            version_response = requests.get('https://api.ascendara.app/language/version', timeout=10)
            version_response.raise_for_status()
            version_data = version_response.json()
            
            timestamp_path = os.path.join(os.path.expanduser('~'), 'timestamp.ascendara.json')
            
            timestamp_data = {}
            if os.path.exists(timestamp_path):
                with open(timestamp_path, 'r') as f:
                    timestamp_data = json.load(f)
            
            timestamp_data['extraLangVer'] = version_data['version']
            
            with open(timestamp_path, 'w') as f:
                json.dump(timestamp_data, f, indent=2)
            
            logging.info(f"Language version {version_data['version']} saved to timestamp file")
        except Exception as e:
            logging.error(f"Error saving language version: {str(e)}")
        
        logging.info(f"Translations saved to {output_path}")
    except Exception as e:
        logging.error(f"Error saving translations: {str(e)}")
        raise  # Let the main function handle the error

def main():
    parser = argparse.ArgumentParser(description='Translate Ascendara language files')
    parser.add_argument('lang', help='Target language code (e.g., fr, de, es)')
    parser.add_argument('--output', '-o', help='Output file path', default=None)
    parser.add_argument('--updateKeys', action='store_true', help='Update specific keys in the language file')
    parser.add_argument('--newKey', action='append', help='New key to translate (can be specified multiple times)', default=[])
    args = parser.parse_args()

    logging.info(f"Starting translation to {args.lang}")
    logging.debug(f"Arguments: {args}")

    try:
        # Initialize progress tracking
        progress = TranslationProgress(args.lang)
        
        if args.updateKeys:
            # Handle specific key updates
            logging.info(f"Updating specific keys: {args.newKey}")
            try:
                # Load translations from platform-appropriate path
                if sys.platform == 'win32':
                    appdata_path = os.path.expandvars(r"%LOCALAPPDATA%\Ascendara")
                elif sys.platform == 'darwin':
                    appdata_path = os.path.join(os.path.expanduser('~/Library/Application Support'), 'ascendara')
                else:
                    appdata_path = os.path.join(os.path.expanduser('~/.ascendara'))
                output_path = os.path.join(appdata_path, f"{args.lang}.json")
                
                logging.debug(f"AppData path: {appdata_path}")
                logging.debug(f"Using output path: {output_path}")
                
                existing_translations = {}
                if os.path.exists(output_path):
                    try:
                        with open(output_path, 'r', encoding='utf-8') as f:
                            existing_translations = json.load(f)
                            logging.info(f"Loaded existing translations from {output_path}")
                    except Exception as e:
                        logging.error(f"Error loading existing translations: {e}")
                        existing_translations = {}

                # Get English translations for reference
                en_translations = get_english_translations()
                
                # Extract values for the specified keys
                to_translate = {}
                for key in args.newKey:
                    # Check if key already exists in translations
                    current_translated = existing_translations
                    current_en = en_translations
                    key_parts = key.split('.')
                    exists = False
                    
                    # Debug log the current state
                    logging.debug(f"Checking key: {key}")
                    logging.debug(f"Key parts: {key_parts}")
                    
                    # Check if key exists in current translations
                    try:
                        for i, part in enumerate(key_parts):
                            logging.debug(f"Checking part {i}: {part}")
                            if part not in current_translated:
                                logging.debug(f"Part {part} not found in translations")
                                exists = False
                                break
                            current_translated = current_translated[part]
                            if i == len(key_parts) - 1:  # Last part
                                if isinstance(current_translated, str):
                                    exists = True
                                    logging.debug(f"Found complete key with value: {current_translated[:30]}...")
                                else:
                                    exists = False
                                    logging.debug(f"Found key but value is not a string: {type(current_translated)}")
                    except (KeyError, TypeError) as e:
                        exists = False
                        logging.debug(f"Error checking key existence: {str(e)}")
                    
                    # Get English value and translate if key doesn't exist
                    try:
                        current = en_translations
                        for part in key_parts:
                            current = current[part]
                        if isinstance(current, str):
                            if not exists:
                                to_translate[key] = current
                                logging.info(f"Will translate missing key: {key}")
                            else:
                                logging.info(f"Key exists with valid value, skipping: {key}")
                        else:
                            logging.warning(f"English key exists but is not a string: {type(current)}")
                    except (KeyError, TypeError) as e:
                        logging.warning(f"Key not found in English translations: {key} ({str(e)})")
                        continue
                if to_translate:
                    # Translate the missing keys
                    progress.total_strings = len(to_translate)
                    translated_values = {}
                    for key, value in to_translate.items():
                        translated = translate_text(value, args.lang)
                        translated_values[key] = translated
                        progress.mark_translated()
                        logging.info(f"Translated {key}: {value[:30]}... -> {translated[:30]}...")

                    # Update the existing translations with new values
                    for key, value in translated_values.items():
                        current = existing_translations
                        key_parts = key.split('.')
                        for part in key_parts[:-1]:
                            if part not in current:
                                current[part] = {}
                            current = current[part]
                        current[key_parts[-1]] = value

                    # Save updated translations
                    save_translations(existing_translations, output_path)
                    progress.set_phase("completed")
                    logging.info("Translation of specific keys completed successfully!")
                else:
                    logging.info("No new keys to translate")
                return

            except Exception as e:
                logging.error(f"Failed to update specific keys: {e}")
                launch_crash_reporter(1, str(e))
                sys.exit(1)

        # Regular full translation flow
        # Initialize progress tracking
        progress = TranslationProgress(args.lang)
        
        # Get English translations
        progress.set_phase("fetching")
        logging.info("Fetching English translations...")
        try:
            en_translations = get_english_translations()
        except Exception as e:
            logging.error(f"Failed to fetch English translations: {e}")
            launch_crash_reporter(1, str(e))
            sys.exit(1)
        
        # Count total strings
        progress.set_phase("analyzing")
        logging.info("Analyzing translation scope...")
        count_strings(en_translations, progress)
        logging.debug(f"Found {progress.total_strings} strings to translate")
        
        # Translate to target language
        progress.set_phase("translating")
        logging.info(f"Translating to {args.lang}...")
        try:
            translated = translate_dict(en_translations, args.lang, progress)
        except Exception as e:
            logging.error(f"Translation failed: {e}")
            launch_crash_reporter(1, str(e))
            sys.exit(1)
        
        # Save translations
        progress.set_phase("saving")
        logging.info("Saving translations...")
        
        # Save translations to platform-appropriate path
        if sys.platform == 'win32':
            appdata_path = os.path.expandvars(r"%LOCALAPPDATA%\Ascendara\languages")
        elif sys.platform == 'darwin':
            appdata_path = os.path.join(os.path.expanduser('~/Library/Application Support'), 'ascendara', 'languages')
        else:
            appdata_path = os.path.join(os.path.expanduser('~/.ascendara'), 'languages')
        os.makedirs(appdata_path, exist_ok=True)
        output_path = os.path.join(appdata_path, f"{args.lang}.json")
        
        try:
            save_translations(translated, output_path)
        except Exception as e:
            logging.error(f"Failed to save translations: {e}")
            launch_crash_reporter(1, str(e))
            sys.exit(1)
            
        progress.set_phase("completed")
        logging.info("Translation completed successfully!")
        
    except KeyboardInterrupt:
        logging.info("\nTranslation cancelled by user")
        launch_crash_reporter(1, "User cancelled")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        launch_crash_reporter(1, str(e))
        sys.exit(1)

if __name__ == '__main__':
    main()