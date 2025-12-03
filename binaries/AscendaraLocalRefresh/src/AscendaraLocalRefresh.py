# ==============================================================================
# Ascendara Local Refresh
# ==============================================================================
# A command-line tool for refreshing the local game index by scraping SteamRIP
# Read more about the Local Refresh Tool here:
# https://ascendara.app/docs/binary-tool/local-refresh

import cloudscraper
import requests
import json
import datetime
import os
import sys
import re
import random
import string
import html
import time
import threading
import argparse
import logging
import subprocess
import atexit
import shutil
import signal
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Queue, Empty

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Rate limiting for image downloads
image_download_lock = threading.Lock()
last_image_download = 0
IMAGE_DOWNLOAD_DELAY = 0.15  # seconds between image downloads

# Failed image download tracking
failed_image_count = 0
failed_image_lock = threading.Lock()
MAX_FAILED_IMAGES = 5

# Custom exception for cookie expiration/rate limiting
class CookieExpiredError(Exception):
    pass

# Global variables
output_dir = ""
progress_file = ""
scraper = None
cookie_refresh_event = threading.Event()
cookie_refresh_lock = threading.Lock()
new_cookie_value = [None]  # Use list to allow modification across threads

# Keep-alive thread control
keep_alive_stop_event = threading.Event()
keep_alive_thread = None

# View count fetching - runs in parallel with post processing
view_count_queue = Queue()  # Queue of post_ids to fetch views for
view_count_cache = {}
view_count_cache_lock = threading.Lock()
view_count_stop_event = threading.Event()
view_count_thread = None

def start_keep_alive(scraper_instance, interval=30):
    """Start a background thread that periodically pings SteamRIP to keep the cookie alive"""
    global keep_alive_thread
    
    def keep_alive_worker():
        """Worker function that runs in background thread"""
        keep_alive_urls = [
            "https://steamrip.com/",
            "https://steamrip.com/category/games/",
            "https://steamrip.com/category/action/",
        ]
        url_index = 0
        
        logging.info(f"Keep-alive thread started (interval: {interval}s)")
        
        while not keep_alive_stop_event.is_set():
            try:
                # Wait for the interval, but check stop event frequently
                for _ in range(interval):
                    if keep_alive_stop_event.is_set():
                        break
                    time.sleep(1)
                
                if keep_alive_stop_event.is_set():
                    break
                
                # Make a lightweight request to keep the session alive
                url = keep_alive_urls[url_index % len(keep_alive_urls)]
                url_index += 1
                
                response = scraper_instance.head(url, timeout=10)
                if response.status_code == 200:
                    logging.debug(f"Keep-alive ping successful: {url}")
                elif response.status_code == 403:
                    logging.warning(f"Keep-alive got 403 - cookie may be expiring")
                else:
                    logging.debug(f"Keep-alive response: {response.status_code}")
                    
            except Exception as e:
                logging.debug(f"Keep-alive request failed: {e}")
        
        logging.info("Keep-alive thread stopped")
    
    keep_alive_stop_event.clear()
    keep_alive_thread = threading.Thread(target=keep_alive_worker, daemon=True)
    keep_alive_thread.start()

def stop_keep_alive():
    """Stop the keep-alive background thread"""
    global keep_alive_thread
    keep_alive_stop_event.set()
    if keep_alive_thread and keep_alive_thread.is_alive():
        keep_alive_thread.join(timeout=5)
    keep_alive_thread = None

# Character set for encoding post IDs (mixed case for visual variety)
GAME_ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz"  # 46 chars (no I, L, O, i, l, o)
GAME_ID_LENGTH = 6

# Scramble multiplier - a prime number to spread out sequential IDs
# This makes IDs look more random while still being deterministic
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
    
    # Scramble the number to spread out sequential IDs
    scrambled = (num * SCRAMBLE_MULT) % SCRAMBLE_MOD
    
    base = len(GAME_ID_CHARS)
    result = []
    
    # Convert to base-46
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
        
        # Reverse the scramble using modular multiplicative inverse
        # inv = pow(SCRAMBLE_MULT, -1, SCRAMBLE_MOD)
        inv = pow(SCRAMBLE_MULT, -1, SCRAMBLE_MOD)
        original = (num * inv) % SCRAMBLE_MOD
        
        return str(original)
    except Exception:
        return None


def get_blacklist_ids():
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
            user_data_dir = os.path.expanduser('~/Library/Application Support/ascendara')
            candidate = os.path.join(user_data_dir, 'ascendarasettings.json')
            if os.path.exists(candidate):
                settings_path = candidate

        if settings_path and os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                blacklist = settings.get('blacklistIDs', [])
                # Decode the 5-character IDs back to numeric post IDs
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


def get_notification_settings():
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
            user_data_dir = os.path.expanduser('~/Library/Application Support/ascendara')
            candidate = os.path.join(user_data_dir, 'ascendarasettings.json')
            if os.path.exists(candidate):
                settings_path = candidate

        if settings_path and os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                enabled = settings.get('notifications', True)
                theme = settings.get('theme', 'dark')
                return (enabled, theme)
    except Exception as e:
        logging.error(f"Failed to read notification settings: {e}")
    return (True, 'dark')  # Default to enabled with dark theme


def _launch_notification(title, message):
    """Launch notification helper to show a system notification if enabled."""
    # Check if notifications are enabled
    enabled, theme = get_notification_settings()
    if not enabled:
        logging.debug("Notifications disabled in settings, skipping notification")
        return
    
    try:
        # Get the directory where the current executable is located
        exe_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
        notification_helper_path = os.path.join(exe_dir, 'AscendaraNotificationHelper.exe')
        logging.debug(f"Looking for notification helper at: {notification_helper_path}")
        
        if os.path.exists(notification_helper_path):
            logging.debug(f"Launching notification helper with theme={theme}, title='{title}', message='{message}'")
            subprocess.Popen(
                [notification_helper_path, "--theme", theme, "--title", title, "--message", message],
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )
            logging.debug("Notification helper process started successfully")
        else:
            logging.error(f"Notification helper not found at: {notification_helper_path}")
    except Exception as e:
        logging.error(f"Failed to launch notification helper: {e}")


def _launch_crash_reporter_on_exit(error_code, error_message):
    """Launch crash reporter on exit"""
    try:
        crash_reporter_path = os.path.join('./AscendaraCrashReporter.exe')
        if os.path.exists(crash_reporter_path):
            subprocess.Popen(
                [crash_reporter_path, "localrefresh", str(error_code), error_message],
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
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


class RefreshProgress:
    """Track and persist refresh progress to a JSON file"""
    
    def __init__(self, output_directory):
        self.progress_file = os.path.join(output_directory, "progress.json")
        self.lock = threading.Lock()
        self.status = "initializing"
        self.phase = "starting"
        self.total_posts = 0
        self.processed_posts = 0
        self.total_images = 0
        self.downloaded_images = 0
        self.current_game = ""
        self.errors = []
        self.start_time = time.time()
        self._update_progress()
    
    def _update_progress(self):
        """Write progress to file with thread safety"""
        with self.lock:
            elapsed = time.time() - self.start_time
            progress_data = {
                "status": self.status,
                "phase": self.phase,
                "totalPosts": self.total_posts,
                "processedPosts": self.processed_posts,
                "totalImages": self.total_images,
                "downloadedImages": self.downloaded_images,
                "currentGame": self.current_game,
                "progress": round(self.processed_posts / max(1, self.total_posts), 4),
                "elapsedSeconds": round(elapsed, 1),
                "errors": self.errors[-10:],  # Keep last 10 errors
                "timestamp": time.time(),
                "waitingForCookie": self.phase == "waiting_for_cookie"
            }
            try:
                with open(self.progress_file, 'w', encoding='utf-8') as f:
                    json.dump(progress_data, f, indent=2)
            except Exception as e:
                logging.error(f"Error writing progress: {e}")
    
    def set_status(self, status):
        self.status = status
        self._update_progress()
    
    def set_phase(self, phase):
        self.phase = phase
        self._update_progress()
    
    def set_total_posts(self, total):
        self.total_posts = total
        self.processed_posts = 0  # Reset processed count when setting new total
        self._update_progress()
    
    def increment_processed(self):
        self.processed_posts += 1
        self._update_progress()
    
    def set_current_game(self, game_name):
        self.current_game = game_name
        self._update_progress()
    
    def update(self, message=""):
        """Update progress during fetching phase - just updates the message, no counts"""
        if message:
            self.current_game = message
        self._update_progress()
    
    def increment_images(self):
        self.total_images += 1
    
    def increment_downloaded_images(self):
        self.downloaded_images += 1
        self._update_progress()
    
    def add_error(self, error_msg):
        self.errors.append({
            "message": error_msg,
            "timestamp": time.time()
        })
        self._update_progress()
    
    def clear_errors_and_set(self, error_msg):
        """Clear all errors and set a single error message"""
        self.errors = [{
            "message": error_msg,
            "timestamp": time.time()
        }]
        self._update_progress()
    
    def complete(self, success=True):
        self.status = "completed" if success else "failed"
        self.phase = "done"
        self._update_progress()


def generate_random_id(length=10):
    """Generate a random alphanumeric ID"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


def create_scraper(cookie):
    """Create a cloudscraper instance with the provided cookie"""
    logging.info("Creating cloudscraper instance...")
    logging.info(f"Raw cookie received (first 50 chars): {repr(cookie[:50])}")
    logging.info(f"Raw cookie length: {len(cookie)}")
    
    # Strip any quotes and whitespace
    cookie = cookie.strip().strip('"\'')
    
    # Ensure cf_clearance= prefix is present for the Cookie header
    if not cookie.startswith("cf_clearance="):
        cookie = f"cf_clearance={cookie}"
    
    logging.info(f"Final cookie for header: {cookie[:50]}...")
    
    # Create scraper with larger connection pool for parallel requests
    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    
    # Increase connection pool size to handle parallel requests
    adapter = requests.adapters.HTTPAdapter(
        pool_connections=50,
        pool_maxsize=50,
        max_retries=3
    )
    scraper.mount('https://', adapter)
    scraper.mount('http://', adapter)

    scraper.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        "Cookie": cookie
    })
    logging.info("Scraper created successfully with pool size 50")
    return scraper


def fetch_categories(scraper, progress):
    """Fetch category ID to name mapping"""
    categories = {}
    url = "https://steamrip.com/wp-json/wp/v2/categories"
    page = 1
    
    progress.set_phase("fetching_categories")
    
    while True:
        try:
            response = scraper.get(f"{url}?per_page=100&page={page}", timeout=30)
            if response.status_code == 400 or not response.json():
                break
            for cat in response.json():
                categories[cat["id"]] = cat["name"]
            page += 1
            time.sleep(0.2)
        except Exception as e:
            logging.warning(f"Error fetching categories page {page}: {e}")
            break
    
    logging.info(f"Fetched {len(categories)} categories")
    return categories


def extract_download_links(content):
    """Extract download links from content HTML"""
    download_links = {}
    link_pattern = r'href="([^"]+)"[^>]*class="shortc-button[^"]*"|class="shortc-button[^"]*"[^>]*href="([^"]+)"'
    matches = re.findall(link_pattern, content)
    
    for match in matches:
        href = match[0] or match[1]
        if "gofile.io" in href:
            download_links.setdefault("gofile", []).append(href)
        elif "qiwi.gg" in href:
            download_links.setdefault("qiwi", []).append(href)
        elif "megadb.net" in href:
            download_links.setdefault("megadb", []).append(href)
        elif "pixeldrain.com" in href:
            download_links.setdefault("pixeldrain", []).append(href)
        elif "buzzheavier.com" in href:
            download_links.setdefault("buzzheavier", []).append(href)
        elif "vikingfile.com" in href:
            download_links.setdefault("vikingfile", []).append(href)
        elif "datanodes.to" in href:
            download_links.setdefault("datanodes", []).append(href)
        elif "1fichier.com" in href:
            download_links.setdefault("1fichier", []).append(href)
    
    return download_links


def extract_game_size(content):
    """Extract game size from content"""
    match = re.search(r'Game Size:?\s*</strong>\s*([^<]+)', content, re.IGNORECASE)
    if match:
        size = match.group(1).strip()
        size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', size, re.IGNORECASE)
        return size_match.group(0) if size_match else ""
    return ""


def extract_version(content):
    """Extract version from content"""
    match = re.search(r'Version:?\s*</strong>\s*:?\s*([^<|]+)', content, re.IGNORECASE)
    if match:
        ver = match.group(1).strip()
        ver = re.sub(r'^(?:v(?:ersion)?\.?\s*|Build\s*|Patch\s*)', '', ver, flags=re.IGNORECASE)
        ver = re.sub(r'\([^)]*\)', '', ver)
        
        noise_words = {
            'latest', 'vr', 'co-op', 'coop', 'multiplayer', 'online', 'zombies',
            'all', 'dlcs', 'dlc', 'complete', 'edition', 'goty', 'game', 'year',
            'the', 'of', 'and', 'with', 'plus', 'update', 'updated', 'final',
            'definitive', 'ultimate', 'deluxe', 'premium', 'gold', 'silver',
            'remastered', 'enhanced', 'extended', 'expanded', 'full', 'bonus'
        }
        
        parts = re.split(r'\s*\+\s*|\s+', ver)
        version_parts = []
        for part in parts:
            part = part.strip()
            if part.lower() in noise_words:
                continue
            if part and (re.search(r'\d', part) or (len(part) == 1 and part.upper() == 'X')):
                version_parts.append(part)
        
        ver = ' '.join(version_parts).strip()
        if ver:
            return ver
    return ""


def extract_min_requirements(content):
    """Extract minimum system requirements from content"""
    reqs = {}
    
    os_match = re.search(r'<strong>OS</strong>:?\s*([^<]+)', content, re.IGNORECASE)
    if os_match:
        reqs['os'] = html.unescape(os_match.group(1).strip())
    
    cpu_match = re.search(r'<strong>Processor</strong>:?\s*([^<]+)', content, re.IGNORECASE)
    if cpu_match:
        reqs['cpu'] = html.unescape(cpu_match.group(1).strip())
    
    ram_match = re.search(r'<strong>Memory</strong>:?\s*([^<]+)', content, re.IGNORECASE)
    if ram_match:
        reqs['ram'] = html.unescape(ram_match.group(1).strip())
    
    gpu_match = re.search(r'<strong>Graphics</strong>:?\s*([^<]+)', content, re.IGNORECASE)
    if gpu_match:
        reqs['gpu'] = html.unescape(gpu_match.group(1).strip())
    
    dx_match = re.search(r'<strong>DirectX</strong>:?\s*([^<]+)', content, re.IGNORECASE)
    if dx_match:
        reqs['directx'] = html.unescape(dx_match.group(1).strip())
    
    storage_match = re.search(r'<strong>Storage</strong>:?\s*([^<]+)', content, re.IGNORECASE)
    if storage_match:
        reqs['storage'] = html.unescape(storage_match.group(1).strip())
    
    return reqs if reqs else None


def check_online_status(content, title):
    """Check if game has online/multiplayer/co-op"""
    text = (content + title).lower()
    return bool(re.search(r'multiplayer|co-op|online', text))


def check_dlc_status(content):
    """Check if game has DLC"""
    return bool(re.search(r"DLC'?s?\s*(Added|Included)?", content, re.IGNORECASE))


def clean_game_name(title):
    """Extract clean game name from title and decode HTML entities"""
    name = html.unescape(title.replace("Free Download", "").strip())
    if "(" in name:
        name = name[:name.find("(")].strip()
    return name


def get_image_url(post):
    """Extract og:image URL from post"""
    try:
        return post.get("yoast_head_json", {}).get("og_image", [{}])[0].get("url", "")
    except (IndexError, KeyError, TypeError):
        return ""


def start_view_count_fetcher(cookie, num_workers=8):
    """Start background threads that fetch view counts from the queue using cloudscraper"""
    global view_count_thread
    
    # Prepare cookie string
    cookie_str = cookie.strip().strip('"\'')
    if not cookie_str.startswith("cf_clearance="):
        cookie_str = f"cf_clearance={cookie_str}"
    
    def view_count_worker(worker_id):
        """Worker that continuously fetches view counts from queue"""
        logging.info(f"View count worker {worker_id} started")
        
        # Create a dedicated cloudscraper instance for this worker (required for Cloudflare bypass)
        view_scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        view_scraper.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
            "Cookie": cookie_str
        })
        # Increase pool size for parallel requests
        adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=10, max_retries=1)
        view_scraper.mount('https://', adapter)
        
        fetched_count = 0
        failed_count = 0
        
        while not view_count_stop_event.is_set() or not view_count_queue.empty():
            try:
                # Get next post_id with timeout so we can check stop event
                try:
                    post_id = view_count_queue.get(timeout=0.5)
                except Empty:
                    continue
                
                # Fetch view count
                try:
                    url = f"https://steamrip.com/wp-admin/admin-ajax.php?postviews_id={post_id}&action=tie_postviews&_={int(time.time() * 1000)}"
                    response = view_scraper.get(url, timeout=10)
                    if response.status_code == 200:
                        # Extract just the digits from the response
                        views = re.sub(r'[^\d]', '', response.text.strip())
                        if views:
                            with view_count_cache_lock:
                                view_count_cache[post_id] = views
                            fetched_count += 1
                            if fetched_count % 100 == 0:
                                logging.debug(f"Worker {worker_id}: Fetched {fetched_count} view counts")
                        else:
                            failed_count += 1
                    else:
                        failed_count += 1
                        if response.status_code == 403:
                            logging.debug(f"Worker {worker_id}: 403 on view count for post {post_id}")
                except Exception as e:
                    failed_count += 1
                    logging.debug(f"Worker {worker_id}: Error fetching view count for {post_id}: {e}")
                
                # Small rate limit to be nice to the server
                time.sleep(0.1)
                
            except Exception as e:
                logging.debug(f"View count worker {worker_id} error: {e}")
        
        view_scraper.close()
        logging.info(f"View count worker {worker_id} finished. Fetched: {fetched_count}, Failed: {failed_count}")
    
    view_count_stop_event.clear()
    # Start multiple worker threads for parallel fetching
    view_count_threads = []
    for i in range(num_workers):
        t = threading.Thread(target=view_count_worker, args=(i,), daemon=True, name=f"ViewCountWorker-{i}")
        t.start()
        view_count_threads.append(t)
    
    logging.info(f"Started {num_workers} view count fetcher workers")
    
    # Store threads for later cleanup
    global view_count_thread
    view_count_thread = view_count_threads


def stop_view_count_fetcher():
    """Stop the view count fetcher threads and wait for them to finish"""
    global view_count_thread
    
    if view_count_thread:
        logging.info("Stopping view count fetcher...")
        view_count_stop_event.set()
        
        # Wait for all worker threads
        if isinstance(view_count_thread, list):
            for t in view_count_thread:
                if t.is_alive():
                    t.join(timeout=5)
        elif view_count_thread.is_alive():
            view_count_thread.join(timeout=5)
        
        logging.info(f"View count fetcher stopped. Cached {len(view_count_cache)} view counts.")


def queue_view_count_fetch(post_id):
    """Add a post_id to the view count fetch queue"""
    if post_id:
        view_count_queue.put(post_id)


# fetch_single_view_count is now inlined in the worker threads


def get_cached_view_count(post_id):
    """Get view count from cache, returns '0' if not yet fetched"""
    with view_count_cache_lock:
        return view_count_cache.get(post_id, "0")


def wait_for_cookie_refresh():
    """Wait for user to provide a new cookie via stdin. Returns True if cookie was refreshed."""
    global scraper, new_cookie_value, failed_image_count
    
    # Immediately reset failed count to prevent other threads from also triggering
    with failed_image_lock:
        failed_image_count = 0
    
    with cookie_refresh_lock:
        # Check if another thread already refreshed the cookie
        if new_cookie_value[0] is not None:
            return True
        
        logging.info("="*60)
        logging.info("COOKIE EXPIRED - Waiting for new cookie...")
        logging.info("Please provide a new cf_clearance cookie value.")
        logging.info("The process will continue automatically once a new cookie is provided.")
        logging.info("="*60)
        
        # Signal that we need a cookie refresh
        cookie_refresh_event.set()
        
        # Read new cookie from stdin (blocking)
        try:
            print("\n" + "="*60, flush=True)
            print("COOKIE_REFRESH_NEEDED", flush=True)
            print("Enter new cf_clearance cookie value:", flush=True)
            print("="*60, flush=True)
            
            new_cookie = input().strip()
            
            if new_cookie:
                logging.info("Received new cookie, refreshing scraper...")
                scraper = create_scraper(new_cookie)
                new_cookie_value[0] = new_cookie
                
                cookie_refresh_event.clear()
                logging.info("Cookie refreshed successfully, resuming...")
                return True
            else:
                logging.error("No cookie provided, cannot continue")
                return False
        except EOFError:
            logging.error("No input available for cookie refresh")
            return False
        except Exception as e:
            logging.error(f"Error reading new cookie: {e}")
            return False


def download_image(scraper_ref, image_url, img_id, imgs_dir, progress):
    """Download and save image with rate limiting and retry"""
    global last_image_download, failed_image_count, scraper
    
    if not image_url:
        return ""
    
    progress.increment_images()
    max_retries = 3
    
    for attempt in range(max_retries):
        # Check if we've hit the failure threshold and need cookie refresh
        with failed_image_lock:
            if failed_image_count >= MAX_FAILED_IMAGES:
                logging.warning(f"Hit {MAX_FAILED_IMAGES} failed downloads, triggering cookie refresh...")
                raise CookieExpiredError("Too many failed image downloads - cookie likely expired")
        
        # Check if cookie refresh is needed
        if cookie_refresh_event.is_set():
            # Wait for the refresh to complete
            while cookie_refresh_event.is_set():
                time.sleep(0.5)
            # Use the refreshed scraper
            scraper_ref = scraper
        
        try:
            with image_download_lock:
                elapsed = time.time() - last_image_download
                if elapsed < IMAGE_DOWNLOAD_DELAY:
                    time.sleep(IMAGE_DOWNLOAD_DELAY - elapsed)
                last_image_download = time.time()
            
            response = scraper_ref.get(image_url, timeout=15)
            
            if response.status_code == 429:
                wait_time = (attempt + 1) * 5
                logging.warning(f"429 on image, waiting {wait_time}s...")
                time.sleep(wait_time)
                continue
            
            if response.status_code == 403:
                logging.warning(f"403 Forbidden on image (attempt {attempt+1}), cookie may be expired")
                with failed_image_lock:
                    failed_image_count += 1
                    if failed_image_count >= MAX_FAILED_IMAGES:
                        raise CookieExpiredError("Cookie expired or rate limited")
                time.sleep((attempt + 1) * 2)
                continue
            
            response.raise_for_status()
            img_path = os.path.join(imgs_dir, f"{img_id}.jpg")
            with open(img_path, 'wb') as f:
                f.write(response.content)
            progress.increment_downloaded_images()
            
            # Reset failed count on success
            with failed_image_lock:
                failed_image_count = 0
            
            return img_id
            
        except CookieExpiredError:
            raise  # Re-raise to trigger cookie refresh
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep((attempt + 1) * 2)
            else:
                logging.warning(f"Failed to download image after {max_retries} attempts: {image_url}")
                # Increment failed count and check threshold
                with failed_image_lock:
                    failed_image_count += 1
                    if failed_image_count >= MAX_FAILED_IMAGES:
                        logging.error(f"Reached {MAX_FAILED_IMAGES} failed image downloads")
                        raise CookieExpiredError("Cookie expired or rate limited")
    return ""


def process_post(post, scraper, category_map, imgs_dir, progress, blacklist_ids=None):
    """Process a single post and return game data"""
    try:
        # Check if post is blacklisted
        post_id = post.get("id")
        if blacklist_ids and post_id and int(post_id) in blacklist_ids:
            logging.debug(f"Skipping blacklisted post ID: {post_id}")
            return None
        
        title = post.get("title", {}).get("rendered", "")
        game_name = clean_game_name(title)
        
        progress.set_current_game(game_name)
        
        content = post.get("content", {}).get("rendered", "")
        
        # Extract data
        download_links = extract_download_links(content)
        game_size = extract_game_size(content)
        version = extract_version(content)
        is_online = check_online_status(content, title)
        has_dlc = check_dlc_status(content)
        min_reqs = extract_min_requirements(content)
        
        # Get image
        image_url = get_image_url(post)
        img_id = generate_random_id()
        if image_url:
            img_id = download_image(scraper, image_url, img_id, imgs_dir, progress)
        
        # Get categories
        cat_ids = post.get("categories", [])
        categories = [category_map.get(cid, "") for cid in cat_ids if category_map.get(cid)]
        
        # Get dates
        latest_update = post.get("modified", "")[:10] if post.get("modified") else ""
        
        # Get post ID (permanent identifier from SteamRIP)
        post_id = post.get("id")
        
        # Queue view count fetch (runs in background thread)
        queue_view_count_fetch(post_id)
        
        # Encode post_id to a nice 5-character identifier
        encoded_game_id = encode_game_id(post_id) if post_id else ""
        
        # View count will be populated from cache after all processing
        game_entry = {
            "game": game_name,
            "size": game_size,
            "version": version,
            "online": is_online,
            "dlc": has_dlc,
            "dirlink": post.get("link", ""),
            "download_links": download_links,
            "weight": "0",  # Will be populated from cache
            "_post_id": post_id,  # Temporary field for view count lookup
            "imgID": img_id,
            "gameID": encoded_game_id,
            "category": categories,
            "latest_update": latest_update,
            "minReqs": min_reqs
        }
        
        return game_entry
    
    except CookieExpiredError:
        raise  # Re-raise to stop all processing
    except Exception as e:
        error_msg = f"Error processing post {post.get('id')}: {e}"
        logging.error(error_msg)
        progress.add_error(error_msg)
        return None


def main():
    parser = argparse.ArgumentParser(
        description='Ascendara Local Refresh - Scrape SteamRIP for game data'
    )
    parser.add_argument(
        '--output', '-o',
        required=True,
        help='Output directory for JSON data and images'
    )
    parser.add_argument(
        '--cookie', '-c',
        required=True,
        help='cf_clearance cookie value for Cloudflare bypass'
    )
    parser.add_argument(
        '--workers', '-w',
        type=int,
        default=8,
        help='Number of worker threads (default: 8)'
    )
    parser.add_argument(
        '--per-page', '-p',
        type=int,
        default=100,
        help='Number of posts to fetch per page (default: 100, max: 100)'
    )
    parser.add_argument(
        '--skip-views',
        action='store_true',
        help='Skip fetching view counts (faster refresh)'
    )
    parser.add_argument(
        '--view-workers',
        type=int,
        default=4,
        help='Number of workers for view count fetching (default: 4)'
    )
    
    args = parser.parse_args()
    
    logging.info("=== Starting Ascendara Local Refresh ===")
    logging.info(f"Output directory: {args.output}")
    
    # Setup directories
    output_dir = args.output
    imgs_dir = os.path.join(output_dir, "imgs")
    imgs_backup_dir = os.path.join(output_dir, "imgs_backup")
    games_file = os.path.join(output_dir, "ascendara_games.json")
    games_backup_file = os.path.join(output_dir, "ascendara_games_backup.json")
    
    def restore_backup():
        """Restore from backup if it exists"""
        restored = False
        try:
            # Restore imgs folder
            if os.path.exists(imgs_backup_dir):
                if os.path.exists(imgs_dir):
                    shutil.rmtree(imgs_dir)
                shutil.move(imgs_backup_dir, imgs_dir)
                logging.info("Restored imgs folder from backup")
                restored = True
            # Restore games file
            if os.path.exists(games_backup_file):
                if os.path.exists(games_file):
                    os.remove(games_file)
                shutil.move(games_backup_file, games_file)
                logging.info("Restored ascendara_games.json from backup")
                restored = True
        except Exception as e:
            logging.error(f"Failed to restore backup: {e}")
        return restored
    
    def cleanup_backup():
        """Remove backup files after successful completion"""
        try:
            if os.path.exists(imgs_backup_dir):
                shutil.rmtree(imgs_backup_dir)
                logging.info("Cleaned up imgs backup")
            if os.path.exists(games_backup_file):
                os.remove(games_backup_file)
                logging.info("Cleaned up games backup")
        except Exception as e:
            logging.warning(f"Failed to cleanup backup: {e}")
    
    # Track if we completed successfully to decide whether to restore on exit
    refresh_completed_successfully = [False]  # Use list to allow modification in nested function
    
    def on_exit_restore():
        """Restore backup on unexpected exit if not completed successfully"""
        if not refresh_completed_successfully[0]:
            logging.info("Process exiting without successful completion, attempting to restore backup...")
            restore_backup()
    
    # Register atexit handler to restore backup if process is killed
    atexit.register(on_exit_restore)
    
    # Handle SIGTERM (sent by taskkill) to restore backup
    def signal_handler(signum, frame):
        logging.info(f"Received signal {signum}, restoring backup and exiting...")
        restore_backup()
        sys.exit(1)
    
    # Register signal handlers (SIGTERM for graceful kill, SIGINT for Ctrl+C)
    signal.signal(signal.SIGTERM, signal_handler)
    if sys.platform != 'win32':
        signal.signal(signal.SIGINT, signal_handler)
    
    try:
        os.makedirs(output_dir, exist_ok=True)
        
        # Clean up any old backups first
        if os.path.exists(imgs_backup_dir):
            shutil.rmtree(imgs_backup_dir)
        if os.path.exists(games_backup_file):
            os.remove(games_backup_file)
        
        # Backup existing imgs folder before creating new one
        if os.path.exists(imgs_dir):
            shutil.move(imgs_dir, imgs_backup_dir)
            logging.info("Backed up existing imgs directory")
        
        # Backup existing games file
        if os.path.exists(games_file):
            shutil.copy2(games_file, games_backup_file)
            logging.info("Backed up existing ascendara_games.json")
        
        os.makedirs(imgs_dir, exist_ok=True)
        logging.info("Created output directories")
    except Exception as e:
        logging.error(f"Failed to create directories: {e}")
        restore_backup()
        launch_crash_reporter(1, str(e))
        sys.exit(1)
    
    # Initialize progress tracking
    progress = RefreshProgress(output_dir)
    progress.set_status("running")
    
    try:
        # Create scraper
        progress.set_phase("initializing")
        scraper = create_scraper(args.cookie)
        
        # Fetch categories
        logging.info("Fetching categories...")
        category_map = fetch_categories(scraper, progress)
        
        logging.info("Creating fresh scraper session for posts...")
        scraper = create_scraper(args.cookie)
        
        # Start keep-alive thread to prevent cookie expiration
        start_keep_alive(scraper, interval=30)
        
        # Start view count fetcher in background (fetches views while posts are processed)
        if not args.skip_views:
            start_view_count_fetcher(args.cookie, num_workers=args.view_workers)
        
        # Load blacklist IDs from settings
        blacklist_ids = get_blacklist_ids()
        
        # Stream-process posts: fetch pages and process each post immediately
        base_url = "https://steamrip.com/wp-json/wp/v2/posts"
        per_page = args.per_page
        progress.set_phase("processing_posts")
        game_data = []
        processed_post_ids = set()
        
        # First, get total count from headers
        logging.info("Getting total post count...")
        try:
            head_response = scraper.head(f"{base_url}?per_page=1", timeout=30)
            total_posts = int(head_response.headers.get('X-WP-Total', 0))
            logging.info(f"Total posts available: {total_posts}")
            progress.set_total_posts(total_posts)
        except Exception as e:
            logging.warning(f"Could not get total count: {e}")
            total_posts = 0
        
        page = 1
        max_cookie_refreshes = 10
        refresh_count = 0
        consecutive_failures = 0
        max_consecutive_failures = 5
        
        logging.info(f"Starting streaming post processing ({per_page} posts per page)...")
        
        while True:
            # Fetch page of posts
            try:
                response = scraper.get(f"{base_url}?per_page={per_page}&page={page}", timeout=30)
                
                if response.status_code == 400:
                    # No more posts
                    logging.info(f"Reached end of posts at page {page}")
                    break
                
                if response.status_code == 403:
                    logging.warning(f"403 Forbidden on page {page}, cookie may be expired")
                    consecutive_failures += 1
                    
                    if consecutive_failures >= max_consecutive_failures:
                        if refresh_count >= max_cookie_refreshes:
                            logging.error("Max cookie refreshes reached")
                            break
                        
                        refresh_count += 1
                        logging.info(f"Cookie refresh attempt {refresh_count}/{max_cookie_refreshes}")
                        progress.set_phase("waiting_for_cookie")
                        progress.set_status("waiting")
                        
                        if wait_for_cookie_refresh():
                            scraper = create_scraper(new_cookie_value[0])
                            new_cookie_value[0] = None
                            consecutive_failures = 0
                            progress.set_phase("processing_posts")
                            progress.set_status("running")
                            continue  # Retry same page
                        else:
                            logging.error("No new cookie provided")
                            break
                    
                    time.sleep(2)
                    continue  # Retry same page
                
                response.raise_for_status()
                posts = response.json()
                
                if not posts:
                    logging.info(f"No posts returned at page {page}")
                    break
                
                consecutive_failures = 0  # Reset on success
                logging.info(f"Page {page}: fetched {len(posts)} posts, processing with {args.workers} workers...")
                
                # Filter posts to process (skip already processed and blacklisted)
                posts_to_process = []
                for post in posts:
                    post_id = post.get("id")
                    if post_id in processed_post_ids:
                        continue
                    if blacklist_ids and post_id and int(post_id) in blacklist_ids:
                        logging.debug(f"Skipping blacklisted post ID: {post_id}")
                        processed_post_ids.add(post_id)
                        progress.increment_processed()
                        continue
                    posts_to_process.append(post)
                
                # Process posts in parallel using thread pool
                cookie_expired_in_page = False
                page_results = []
                
                with ThreadPoolExecutor(max_workers=args.workers) as executor:
                    futures = {
                        executor.submit(process_post, post, scraper, category_map, imgs_dir, progress, blacklist_ids): post
                        for post in posts_to_process
                    }
                    
                    for future in as_completed(futures):
                        post = futures[future]
                        post_id = post.get("id")
                        
                        try:
                            result = future.result()
                            if result:
                                page_results.append(result)
                            processed_post_ids.add(post_id)
                            progress.increment_processed()
                        
                        except CookieExpiredError:
                            logging.warning(f"Cookie expired while processing post {post_id}")
                            cookie_expired_in_page = True
                            # Cancel remaining futures
                            for f in futures:
                                f.cancel()
                            break
                            
                        except Exception as e:
                            logging.error(f"Error processing post {post_id}: {e}")
                            progress.add_error(f"Error processing post {post_id}: {str(e)}")
                            processed_post_ids.add(post_id)
                            progress.increment_processed()
                
                # Add results from this page
                game_data.extend(page_results)
                
                # Check if cookie expired during page processing
                if cookie_expired_in_page:
                    consecutive_failures = max_consecutive_failures  # Trigger refresh on next iteration
                    continue
                
                page += 1
                time.sleep(0.1)  # Small delay between page requests
                
            except Exception as e:
                if 'timed out' in str(e).lower():
                    logging.warning(f"Timeout on page {page}, retrying...")
                    time.sleep(2)
                    continue
                else:
                    logging.error(f"Error fetching page {page}: {e}")
                    progress.add_error(f"Error fetching page {page}: {str(e)}")
                    consecutive_failures += 1
                    
                    if consecutive_failures >= max_consecutive_failures:
                        # Try cookie refresh
                        if refresh_count < max_cookie_refreshes:
                            refresh_count += 1
                            progress.set_phase("waiting_for_cookie")
                            progress.set_status("waiting")
                            
                            if wait_for_cookie_refresh():
                                scraper = create_scraper(new_cookie_value[0])
                                new_cookie_value[0] = None
                                consecutive_failures = 0
                                progress.set_phase("processing_posts")
                                progress.set_status("running")
                                continue
                        break
                    
                    time.sleep(2)
                    continue
        
        logging.info(f"Processed {len(game_data)} games total")
        
        # Stop keep-alive thread
        stop_keep_alive()
        
        # Stop view count fetcher and wait for remaining fetches to complete
        if not args.skip_views:
            logging.info("Waiting for view count fetcher to finish...")
            stop_view_count_fetcher()
            
            # Apply cached view counts to game data
            logging.info("Applying view counts to game data...")
            for game in game_data:
                post_id = game.pop("_post_id", None)  # Remove temp field
                if post_id:
                    game["weight"] = get_cached_view_count(post_id)
            logging.info(f"Applied {len(view_count_cache)} view counts")
        else:
            # Just remove the temp field if skipping views
            for game in game_data:
                game.pop("_post_id", None)
        
        if refresh_count >= max_cookie_refreshes:
            logging.warning(f"Reached maximum cookie refresh attempts ({max_cookie_refreshes})")
            progress.add_error(f"Reached maximum cookie refresh attempts")
        
        # Build output
        progress.set_phase("saving")
        logging.info(f"Building output with {len(game_data)} games...")
        
        metadata = {
            "getDate": datetime.datetime.now().strftime("%B %d, %Y, %I:%M %p"),
            "local": True,
            "source": "STEAMRIP",
            "games": str(len(game_data))
        }
        
        output_data = {
            "metadata": metadata,
            "games": game_data
        }
        
        output_file = os.path.join(output_dir, "ascendara_games.json")
        logging.info(f"Writing to {output_file}...")
        
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        
        progress.complete(success=True)
        logging.info(f"=== Done! Saved {len(game_data)} games to {output_file} ===")
        
        # Send notification (checks settings internally)
        _launch_notification(
            "Index Refresh Complete",
            f"Successfully indexed {len(game_data)} games"
        )
        
        # Mark as successfully completed so atexit handler doesn't restore
        refresh_completed_successfully[0] = True
        atexit.unregister(on_exit_restore)
        
        # Success - cleanup backup files
        cleanup_backup()
        
        # Mark that user has successfully indexed
        try:
            timestamp_path = os.path.join(os.environ['USERPROFILE'], 'timestamp.ascendara.json')
            timestamp_data = {}
            if os.path.exists(timestamp_path):
                with open(timestamp_path, 'r', encoding='utf-8') as f:
                    timestamp_data = json.load(f)
            timestamp_data['hasIndexBefore'] = True
            with open(timestamp_path, 'w', encoding='utf-8') as f:
                json.dump(timestamp_data, f, indent=2)
            logging.info("Updated timestamp file with hasIndexBefore=true")
        except Exception as e:
            logging.warning(f"Failed to update timestamp file: {e}")
        
    except CookieExpiredError:
        # This should only be reached if cookie expires during initial fetch phase
        # (post processing has its own cookie refresh handling)
        stop_keep_alive()
        stop_view_count_fetcher()
        logging.error("Cookie expired during initial fetch phase - stopping scraper")
        # Clear all errors and set single meaningful error
        progress.clear_errors_and_set("Cookie expired or rate limited during initial fetch")
        progress.complete(success=False)
        # Send failure notification (checks settings internally)
        _launch_notification(
            "Index Refresh Failed",
            "Cookie expired during initial fetch"
        )
        # Unregister atexit handler since we're manually restoring
        atexit.unregister(on_exit_restore)
        # Restore from backup
        if restore_backup():
            logging.info("Previous data restored after cookie expiration")
        sys.exit(1)
        
    except KeyboardInterrupt:
        stop_keep_alive()
        stop_view_count_fetcher()
        logging.info("Refresh cancelled by user")
        progress.add_error("Cancelled by user")
        progress.complete(success=False)
        # Unregister atexit handler since we're manually restoring
        atexit.unregister(on_exit_restore)
        # Restore from backup on cancellation
        if restore_backup():
            logging.info("Previous data restored after cancellation")
        sys.exit(1)
        
    except Exception as e:
        stop_keep_alive()
        stop_view_count_fetcher()
        logging.error(f"Unexpected error: {e}")
        progress.add_error(str(e))
        progress.complete(success=False)
        # Unregister atexit handler since we're manually restoring
        atexit.unregister(on_exit_restore)
        # Restore from backup on error
        if restore_backup():
            logging.info("Previous data restored after error")
        launch_crash_reporter(1, str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
