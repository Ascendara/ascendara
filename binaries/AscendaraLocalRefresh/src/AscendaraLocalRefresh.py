# ==============================================================================
# Ascendara Local Refresh
# ==============================================================================
# A command-line tool for refreshing the local game index by scraping SteamRIP
# Read more about the Local Refresh Tool here:
# https://ascendara.app/docs/binary-tool/local-refresh

import cloudscraper
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
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Rate limiting for image downloads
image_download_lock = threading.Lock()
last_image_download = 0
IMAGE_DOWNLOAD_DELAY = 0.15  # seconds between image downloads

# Global variables
output_dir = ""
progress_file = ""
scraper = None


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
                "timestamp": time.time()
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
    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )

    scraper.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        "Cookie": cookie
    })
    logging.info("Scraper created successfully")
    return scraper


def fetch_all_posts(scraper, base_url, progress, per_page=100):
    """Fetch all posts from the WordPress API"""
    all_posts = []
    page = 1
    
    logging.info(f"Starting to fetch posts from {base_url}")
    progress.set_phase("fetching_posts")
    
    while True:
        url = f"{base_url}?per_page={per_page}&page={page}"
        logging.debug(f"Fetching: {url}")
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                response = scraper.get(url, timeout=30)
                logging.debug(f"Response status: {response.status_code}")
                
                if response.status_code == 400:
                    logging.info(f"Reached end of posts at page {page}")
                    return all_posts
                
                if response.status_code == 403:
                    error_msg = "Cloudflare verification failed. Cookie may be invalid or expired."
                    logging.error(error_msg)
                    progress.add_error(error_msg)
                    progress.set_status("error")
                    return all_posts
                
                response.raise_for_status()
                posts = response.json()
                logging.debug(f"Parsed {len(posts)} posts from JSON")
                
                if not posts:
                    logging.info(f"No more posts at page {page}")
                    return all_posts
                
                all_posts.extend(posts)
                logging.info(f"Page {page}: fetched {len(posts)} posts (total: {len(all_posts)})")
                # Update progress message only - no counts since we don't know total pages
                progress.update(f"Fetched {len(all_posts)} posts...")
                page += 1
                time.sleep(0.3)
                break  # Success, exit retry loop
                
            except Exception as e:
                if 'timed out' in str(e).lower() or 'read timed out' in str(e).lower():
                    logging.warning(f"Timeout fetching page {page} (attempt {attempt+1}/{max_retries}): {e}")
                    if attempt == max_retries - 1:
                        logging.error(f"Max retries reached for page {page}. Skipping.")
                        progress.add_error(f"Timeout on page {page} after {max_retries} attempts")
                        break
                    time.sleep(2 * (attempt + 1))
                else:
                    logging.error(f"Error fetching page {page}: {e}")
                    progress.add_error(f"Error fetching page {page}: {str(e)}")
                    return all_posts
    
    return all_posts


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


def fetch_view_count(scraper, post_id):
    """Fetch view count via admin-ajax endpoint"""
    try:
        url = f"https://steamrip.com/wp-admin/admin-ajax.php?postviews_id={post_id}&action=tie_postviews&_={int(time.time() * 1000)}"
        response = scraper.get(url, timeout=10)
        if response.status_code == 200:
            views = re.sub(r'[^\d]', '', response.text.strip())
            return views if views else "0"
    except Exception:
        pass
    return "0"


def download_image(scraper, image_url, img_id, imgs_dir, progress):
    """Download and save image with rate limiting and retry"""
    global last_image_download
    
    if not image_url:
        return ""
    
    progress.increment_images()
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            with image_download_lock:
                elapsed = time.time() - last_image_download
                if elapsed < IMAGE_DOWNLOAD_DELAY:
                    time.sleep(IMAGE_DOWNLOAD_DELAY - elapsed)
                last_image_download = time.time()
            
            response = scraper.get(image_url, timeout=15)
            
            if response.status_code == 429:
                wait_time = (attempt + 1) * 5
                logging.warning(f"429 on image, waiting {wait_time}s...")
                time.sleep(wait_time)
                continue
            
            response.raise_for_status()
            img_path = os.path.join(imgs_dir, f"{img_id}.jpg")
            with open(img_path, 'wb') as f:
                f.write(response.content)
            progress.increment_downloaded_images()
            return img_id
            
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep((attempt + 1) * 2)
            else:
                logging.warning(f"Failed to download image after {max_retries} attempts: {image_url}")
                progress.add_error(f"Failed to download image: {image_url}")
    return ""


def process_post(post, scraper, category_map, imgs_dir, progress):
    """Process a single post and return game data"""
    try:
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
        
        # Get view count
        views = fetch_view_count(scraper, post_id) if post_id else "0"
        
        game_entry = {
            "game": game_name,
            "size": game_size,
            "version": version,
            "online": is_online,
            "dlc": has_dlc,
            "dirlink": post.get("link", ""),
            "download_links": download_links,
            "weight": views,
            "imgID": img_id,
            "gameID": str(post_id) if post_id else "",
            "category": categories,
            "latest_update": latest_update,
            "minReqs": min_reqs
        }
        
        return game_entry
    
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
        default=50,
        help='Number of posts to fetch per page (default: 50)'
    )
    
    args = parser.parse_args()
    
    logging.info("=== Starting Ascendara Local Refresh ===")
    logging.info(f"Output directory: {args.output}")
    
    # Setup directories
    output_dir = args.output
    imgs_dir = os.path.join(output_dir, "imgs")
    
    try:
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(imgs_dir, exist_ok=True)
        logging.info(f"Created output directories")
    except Exception as e:
        logging.error(f"Failed to create directories: {e}")
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
        
        # Fetch all posts
        base_url = "https://steamrip.com/wp-json/wp/v2/posts"
        logging.info(f"Fetching posts from: {base_url} (per_page={args.per_page})")
        posts = fetch_all_posts(scraper, base_url, progress, per_page=args.per_page)
        
        if not posts:
            error_msg = "No posts fetched! Cookie may be invalid or expired."
            logging.error(error_msg)
            progress.add_error(error_msg)
            progress.complete(success=False)
            launch_crash_reporter(1, error_msg)
            sys.exit(1)
        
        logging.info(f"Total posts fetched: {len(posts)}")
        progress.set_total_posts(len(posts))
        
        # Process posts
        progress.set_phase("processing_posts")
        game_data = []
        
        logging.info(f"Processing {len(posts)} posts with {args.workers} workers...")
        
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(
                    process_post, post, scraper, category_map, imgs_dir, progress
                ): post for post in posts
            }
            
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result:
                        game_data.append(result)
                except Exception as e:
                    logging.error(f"Thread error: {e}")
                    progress.add_error(f"Thread error: {str(e)}")
                progress.increment_processed()
        
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
        
    except KeyboardInterrupt:
        logging.info("Refresh cancelled by user")
        progress.add_error("Cancelled by user")
        progress.complete(success=False)
        sys.exit(1)
        
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        progress.add_error(str(e))
        progress.complete(success=False)
        launch_crash_reporter(1, str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
