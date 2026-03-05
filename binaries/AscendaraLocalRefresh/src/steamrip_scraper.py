"""
SteamRIP Scraper Implementation
Handles all SteamRIP-specific scraping logic
"""

import cloudscraper
import requests
import json
import time
import threading
import logging
import re
import html
import random
import string
from typing import Dict, List, Optional, Set
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Queue, Empty

from base_scraper import BaseScraper
from utils import encode_game_id


# Custom exception for cookie expiration/rate limiting
class CookieExpiredError(Exception):
    pass


class SteamRIPScraper(BaseScraper):
    """Scraper implementation for SteamRIP source"""
    
    def __init__(self, output_dir: str, progress_file: str):
        super().__init__(output_dir, progress_file)
        
        # SteamRIP-specific configuration
        self.base_url = "https://steamrip.com/wp-json/wp/v2/posts"
        self.category_url = "https://steamrip.com/wp-json/wp/v2/categories"
        self.scraper = None
        self.category_map = {}
        
        # Rate limiting for image downloads
        self.image_download_lock = threading.Lock()
        self.last_image_download = 0
        self.IMAGE_DOWNLOAD_DELAY = 0.15
        
        # Failed image download tracking
        self.failed_image_count = 0
        self.failed_image_lock = threading.Lock()
        self.MAX_FAILED_IMAGES = 5
        
        # Cookie refresh handling
        self.cookie_refresh_event = threading.Event()
        self.cookie_refresh_lock = threading.Lock()
        self.new_cookie_value = [None]
        self.current_user_agent = [None]
        
        # Keep-alive thread control
        self.keep_alive_stop_event = threading.Event()
        self.keep_alive_thread = None
        
        # View count fetching
        self.view_count_queue = Queue()
        self.view_count_cache = {}
        self.view_count_cache_lock = threading.Lock()
        self.view_count_stop_event = threading.Event()
        self.view_count_threads = []
    
    def get_source_name(self) -> str:
        return "SteamRIP"
    
    def initialize(self, cookie: Optional[str] = None, user_agent: Optional[str] = None, 
                   skip_views: bool = False, view_workers: int = 4) -> bool:
        """Initialize the SteamRIP scraper"""
        try:
            self.current_user_agent[0] = user_agent
            
            # Check if Cloudflare protection is active
            cf_active = self._check_cloudflare_protection(user_agent)
            
            if cf_active and not cookie:
                self.logger.error("Cloudflare protection is active but no cookie was provided")
                return False
            
            # Create scraper
            self.scraper = self._create_scraper(cookie if cf_active else None, user_agent)
            
            # Fetch categories
            self.logger.info("Fetching categories...")
            self.category_map = self._fetch_categories()
            
            # Recreate scraper for posts
            self.scraper = self._create_scraper(cookie if cf_active else None, user_agent)
            
            # Start keep-alive thread
            self._start_keep_alive(interval=30)
            
            # Start view count fetcher
            if not skip_views:
                self._start_view_count_fetcher(cookie if cf_active else None, view_workers, user_agent)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to initialize SteamRIP scraper: {e}")
            return False
    
    def scrape_games(self, blacklist_ids: Set[int], per_page: int = 100, 
                     workers: int = 8, progress=None) -> List[Dict]:
        """Scrape all games from SteamRIP"""
        game_data = []
        processed_post_ids = set()
        
        # Get total count
        try:
            head_response = self.scraper.head(f"{self.base_url}?per_page=1", timeout=30)
            total_posts = int(head_response.headers.get('X-WP-Total', 0))
            self.logger.info(f"Total posts available: {total_posts}")
            if progress:
                progress.set_total_posts(total_posts)
        except Exception as e:
            self.logger.warning(f"Could not get total count: {e}")
            total_posts = 0
        
        page = 1
        max_cookie_refreshes = 10
        refresh_count = 0
        consecutive_failures = 0
        max_consecutive_failures = 5
        
        imgs_dir = f"{self.output_dir}/imgs_incoming"
        
        self.logger.info(f"Starting streaming post processing ({per_page} posts per page)...")
        
        while True:
            try:
                response = self.scraper.get(f"{self.base_url}?per_page={per_page}&page={page}", timeout=30)
                
                if response.status_code == 400:
                    self.logger.info(f"Reached end of posts at page {page}")
                    break
                
                if response.status_code == 403:
                    self.logger.warning(f"403 Forbidden on page {page}, cookie may be expired")
                    consecutive_failures += 1
                    
                    if consecutive_failures >= max_consecutive_failures:
                        if refresh_count >= max_cookie_refreshes:
                            self.logger.error("Max cookie refreshes reached")
                            break
                        
                        refresh_count += 1
                        self.logger.info(f"Cookie refresh attempt {refresh_count}/{max_cookie_refreshes}")
                        
                        if self._wait_for_cookie_refresh():
                            self.scraper = self._create_scraper(self.new_cookie_value[0], self.current_user_agent[0])
                            self._restart_view_count_fetcher(self.new_cookie_value[0], 4, self.current_user_agent[0])
                            self.new_cookie_value[0] = None
                            consecutive_failures = 0
                            continue
                        else:
                            self.logger.error("No new cookie provided")
                            break
                    
                    time.sleep(2)
                    continue
                
                response.raise_for_status()
                posts = response.json()
                
                if not posts:
                    self.logger.info(f"No posts returned at page {page}")
                    break
                
                consecutive_failures = 0
                self.logger.info(f"Page {page}: fetched {len(posts)} posts, processing with {workers} workers...")
                
                # Filter posts
                posts_to_process = []
                for post in posts:
                    post_id = post.get("id")
                    if post_id in processed_post_ids:
                        continue
                    if blacklist_ids and post_id and int(post_id) in blacklist_ids:
                        self.logger.debug(f"Skipping blacklisted post ID: {post_id}")
                        processed_post_ids.add(post_id)
                        if progress:
                            progress.increment_processed()
                        continue
                    posts_to_process.append(post)
                
                # Process posts in parallel
                cookie_expired_in_page = False
                page_results = []
                
                with ThreadPoolExecutor(max_workers=workers) as executor:
                    futures = {
                        executor.submit(self._process_post, post, imgs_dir, progress, blacklist_ids): post
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
                            if progress:
                                progress.increment_processed()
                        
                        except CookieExpiredError:
                            self.logger.warning(f"Cookie expired while processing post {post_id}")
                            cookie_expired_in_page = True
                            for f in futures:
                                f.cancel()
                            break
                        
                        except Exception as e:
                            self.logger.error(f"Error processing post {post_id}: {e}")
                            if progress:
                                progress.add_error(str(e))
                
                game_data.extend(page_results)
                
                if cookie_expired_in_page:
                    consecutive_failures += 1
                    if consecutive_failures >= max_consecutive_failures:
                        if refresh_count < max_cookie_refreshes:
                            refresh_count += 1
                            
                            if self._wait_for_cookie_refresh():
                                self.scraper = self._create_scraper(self.new_cookie_value[0], self.current_user_agent[0])
                                self._restart_view_count_fetcher(self.new_cookie_value[0], 4, self.current_user_agent[0])
                                self.new_cookie_value[0] = None
                                consecutive_failures = 0
                                continue
                        break
                    
                    time.sleep(2)
                    continue
                
                page += 1
                time.sleep(0.5)
                
            except Exception as e:
                self.logger.error(f"Error fetching page {page}: {e}")
                consecutive_failures += 1
                if consecutive_failures >= max_consecutive_failures:
                    break
                time.sleep(2)
        
        self.logger.info(f"Processed {len(game_data)} games total")
        
        # Apply view counts
        self._apply_view_counts(game_data)
        
        return game_data
    
    def get_total_pages(self) -> int:
        """Get total number of pages"""
        try:
            head_response = self.scraper.head(f"{self.base_url}?per_page=100", timeout=30)
            total_posts = int(head_response.headers.get('X-WP-Total', 0))
            return (total_posts + 99) // 100
        except:
            return 0
    
    def cleanup(self):
        """Cleanup resources"""
        self._stop_keep_alive()
        self._stop_view_count_fetcher()
        if self.scraper:
            self.scraper.close()
    
    # Private helper methods
    
    def _check_cloudflare_protection(self, user_agent=None):
        """Check if Cloudflare protection is active"""
        self.logger.info("Checking if Cloudflare protection is active...")
        
        try:
            test_scraper = cloudscraper.create_scraper(
                browser={"browser": "chrome", "platform": "windows", "mobile": False}
            )
            
            final_user_agent = user_agent if user_agent else "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
            test_scraper.headers.update({"User-Agent": final_user_agent})
            
            test_url = "https://steamrip.com/wp-json/wp/v2/posts?per_page=1"
            response = test_scraper.get(test_url, timeout=15)
            
            if response.status_code == 200:
                self.logger.info("✓ Cloudflare protection is NOT active - cookie not required")
                return False
            elif response.status_code == 403:
                self.logger.info("✗ Cloudflare protection is active - cookie required")
                return True
            else:
                self.logger.warning(f"Unexpected status code {response.status_code}, assuming CF is active")
                return True
                
        except Exception as e:
            self.logger.warning(f"Error checking Cloudflare protection: {e}, assuming CF is active")
            return True
    
    def _create_scraper(self, cookie=None, user_agent=None):
        """Create a cloudscraper instance"""
        self.logger.info("Creating cloudscraper instance...")
        
        browser_type = "chrome"
        if user_agent:
            ua_lower = user_agent.lower()
            if "firefox" in ua_lower:
                browser_type = "firefox"
            self.logger.info(f"Using custom User-Agent (browser: {browser_type}): {user_agent[:60]}...")
        
        scraper = cloudscraper.create_scraper(
            browser={"browser": browser_type, "platform": "windows", "mobile": False}
        )
        
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=50,
            pool_maxsize=50,
            max_retries=3
        )
        scraper.mount('https://', adapter)
        scraper.mount('http://', adapter)
        
        final_user_agent = user_agent if user_agent else "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
        
        headers = {"User-Agent": final_user_agent}
        
        if cookie:
            cookie = cookie.strip().strip('"\'')
            if not cookie.startswith("cf_clearance="):
                cookie = f"cf_clearance={cookie}"
            headers["Cookie"] = cookie
        
        scraper.headers.update(headers)
        self.logger.info("Scraper created successfully with pool size 50")
        return scraper
    
    def _fetch_categories(self):
        """Fetch category ID to name mapping"""
        categories = {}
        url = self.category_url
        page = 1
        
        while True:
            try:
                response = self.scraper.get(f"{url}?per_page=100&page={page}", timeout=30)
                if response.status_code == 400 or not response.json():
                    break
                for cat in response.json():
                    categories[cat["id"]] = cat["name"]
                page += 1
                time.sleep(0.2)
            except Exception as e:
                self.logger.warning(f"Error fetching categories page {page}: {e}")
                break
        
        self.logger.info(f"Fetched {len(categories)} categories")
        return categories
    
    def _process_post(self, post, imgs_dir, progress, blacklist_ids=None):
        """Process a single post and return game data"""
        try:
            post_id = post.get("id")
            if blacklist_ids and post_id and int(post_id) in blacklist_ids:
                self.logger.debug(f"Skipping blacklisted post ID: {post_id}")
                return None
            
            title = post.get("title", {}).get("rendered", "")
            game_name = self._clean_game_name(title)
            
            if progress:
                progress.set_current_game(game_name)
            
            content = post.get("content", {}).get("rendered", "")
            
            # Extract data
            download_links = self._extract_download_links(content)
            game_size = self._extract_game_size(content)
            version = self._extract_version(content)
            released_by = self._extract_released_by(content)
            is_online = self._check_online_status(content, title)
            has_dlc = self._check_dlc_status(content)
            min_reqs = self._extract_min_requirements(content)
            
            # Get image
            image_url = self._get_image_url(post)
            img_id = self._generate_random_id()
            if image_url:
                img_id = self._download_image(image_url, img_id, imgs_dir, progress)
            
            # Get categories
            cat_ids = post.get("categories", [])
            categories = [self.category_map.get(cid, "") for cid in cat_ids if self.category_map.get(cid)]
            
            # Get dates
            latest_update = post.get("modified", "")[:10] if post.get("modified") else ""
            
            # Queue view count fetch
            self._queue_view_count_fetch(post_id)
            
            # Encode post_id
            encoded_game_id = encode_game_id(post_id) if post_id else ""
            
            game_entry = {
                "game": game_name,
                "size": game_size,
                "version": version,
                "releasedBy": released_by,
                "online": is_online,
                "dlc": has_dlc,
                "dirlink": post.get("link", ""),
                "download_links": download_links,
                "weight": "0",
                "_post_id": post_id,
                "imgID": img_id,
                "gameID": encoded_game_id,
                "category": categories,
                "latest_update": latest_update,
                "minReqs": min_reqs
            }
            
            return game_entry
        
        except CookieExpiredError:
            raise
        except Exception as e:
            error_msg = f"Error processing post {post.get('id')}: {e}"
            self.logger.error(error_msg)
            if progress:
                progress.add_error(error_msg)
            return None
    
    def _extract_download_links(self, content):
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
    
    def _extract_game_size(self, content):
        """Extract game size from content"""
        match = re.search(r'Game Size:?\s*</strong>\s*([^<]+)', content, re.IGNORECASE)
        if match:
            size = match.group(1).strip()
            size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', size, re.IGNORECASE)
            return size_match.group(0) if size_match else ""
        return ""
    
    def _extract_version(self, content):
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
    
    def _extract_released_by(self, content):
        """Extract 'Released By' field from content"""
        match = re.search(r'Released By:?\s*</strong>\s*([^<]+)', content, re.IGNORECASE)
        if match:
            released_by = match.group(1).strip()
            return html.unescape(released_by)
        return ""
    
    def _extract_min_requirements(self, content):
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
    
    def _check_online_status(self, content, title):
        """Check if game has online/multiplayer/co-op"""
        text = (content + title).lower()
        return bool(re.search(r'multiplayer|co-op|online', text))
    
    def _check_dlc_status(self, content):
        """Check if game has DLC"""
        return bool(re.search(r"DLC'?s?\s*(Added|Included)?", content, re.IGNORECASE))
    
    def _clean_game_name(self, title):
        """Extract clean game name from title and decode HTML entities"""
        name = html.unescape(title.replace("Free Download", "").strip())
        if "(" in name:
            name = name[:name.find("(")].strip()
        return name
    
    def _get_image_url(self, post):
        """Extract og:image URL from post"""
        try:
            return post.get("yoast_head_json", {}).get("og_image", [{}])[0].get("url", "")
        except (IndexError, KeyError, TypeError):
            return ""
    
    def _generate_random_id(self, length=10):
        """Generate a random alphanumeric ID"""
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))
    
    def _download_image(self, image_url, img_id, imgs_dir, progress):
        """Download and save image with rate limiting and retry"""
        if not image_url:
            return ""
        
        if progress:
            progress.increment_images()
        
        max_retries = 3
        
        for attempt in range(max_retries):
            with self.failed_image_lock:
                if self.failed_image_count >= self.MAX_FAILED_IMAGES:
                    self.logger.warning(f"Hit {self.MAX_FAILED_IMAGES} failed downloads, triggering cookie refresh...")
                    raise CookieExpiredError("Too many failed image downloads - cookie likely expired")
            
            if self.cookie_refresh_event.is_set():
                while self.cookie_refresh_event.is_set():
                    time.sleep(0.5)
            
            try:
                with self.image_download_lock:
                    elapsed = time.time() - self.last_image_download
                    if elapsed < self.IMAGE_DOWNLOAD_DELAY:
                        time.sleep(self.IMAGE_DOWNLOAD_DELAY - elapsed)
                    self.last_image_download = time.time()
                
                response = self.scraper.get(image_url, timeout=15)
                
                if response.status_code == 429:
                    wait_time = (attempt + 1) * 5
                    self.logger.warning(f"429 on image, waiting {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                
                if response.status_code == 403:
                    self.logger.warning(f"403 Forbidden on image (attempt {attempt+1}), cookie may be expired")
                    with self.failed_image_lock:
                        self.failed_image_count += 1
                        if self.failed_image_count >= self.MAX_FAILED_IMAGES:
                            raise CookieExpiredError("Cookie expired or rate limited")
                    time.sleep((attempt + 1) * 2)
                    continue
                
                response.raise_for_status()
                import os
                img_path = os.path.join(imgs_dir, f"{img_id}.jpg")
                with open(img_path, 'wb') as f:
                    f.write(response.content)
                
                if progress:
                    progress.increment_downloaded_images()
                
                with self.failed_image_lock:
                    self.failed_image_count = 0
                
                return img_id
                
            except CookieExpiredError:
                raise
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep((attempt + 1) * 2)
                else:
                    self.logger.warning(f"Failed to download image after {max_retries} attempts: {image_url}")
                    with self.failed_image_lock:
                        self.failed_image_count += 1
                        if self.failed_image_count >= self.MAX_FAILED_IMAGES:
                            self.logger.error(f"Reached {self.MAX_FAILED_IMAGES} failed image downloads")
                            raise CookieExpiredError("Cookie expired or rate limited")
        return ""
    
    def _start_keep_alive(self, interval=30):
        """Start a background thread that periodically pings SteamRIP"""
        def keep_alive_worker():
            keep_alive_urls = [
                "https://steamrip.com/",
                "https://steamrip.com/category/games/",
                "https://steamrip.com/category/action/",
            ]
            url_index = 0
            
            self.logger.info(f"Keep-alive thread started (interval: {interval}s)")
            
            while not self.keep_alive_stop_event.is_set():
                try:
                    for _ in range(interval):
                        if self.keep_alive_stop_event.is_set():
                            break
                        time.sleep(1)
                    
                    if self.keep_alive_stop_event.is_set():
                        break
                    
                    url = keep_alive_urls[url_index % len(keep_alive_urls)]
                    url_index += 1
                    
                    response = self.scraper.head(url, timeout=10)
                    if response.status_code == 200:
                        self.logger.debug(f"Keep-alive ping successful: {url}")
                    elif response.status_code == 403:
                        self.logger.warning(f"Keep-alive got 403 - cookie may be expiring")
                    else:
                        self.logger.debug(f"Keep-alive response: {response.status_code}")
                        
                except Exception as e:
                    self.logger.debug(f"Keep-alive request failed: {e}")
            
            self.logger.info("Keep-alive thread stopped")
        
        self.keep_alive_stop_event.clear()
        self.keep_alive_thread = threading.Thread(target=keep_alive_worker, daemon=True)
        self.keep_alive_thread.start()
    
    def _stop_keep_alive(self):
        """Stop the keep-alive background thread"""
        self.keep_alive_stop_event.set()
        if self.keep_alive_thread and self.keep_alive_thread.is_alive():
            self.keep_alive_thread.join(timeout=5)
        self.keep_alive_thread = None
    
    def _start_view_count_fetcher(self, cookie, num_workers=4, user_agent=None):
        """Start background threads that fetch view counts"""
        cookie_str = None
        if cookie:
            cookie_str = cookie.strip().strip('"\'')
            if not cookie_str.startswith("cf_clearance="):
                cookie_str = f"cf_clearance={cookie_str}"
        
        browser_type = "chrome"
        final_user_agent = user_agent if user_agent else "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
        if user_agent and "firefox" in user_agent.lower():
            browser_type = "firefox"
        
        def view_count_worker(worker_id):
            self.logger.info(f"View count worker {worker_id} started")
            
            view_scraper = cloudscraper.create_scraper(
                browser={"browser": browser_type, "platform": "windows", "mobile": False}
            )
            headers = {"User-Agent": final_user_agent}
            if cookie_str:
                headers["Cookie"] = cookie_str
            view_scraper.headers.update(headers)
            adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=10, max_retries=1)
            view_scraper.mount('https://', adapter)
            
            fetched_count = 0
            failed_count = 0
            
            while not self.view_count_stop_event.is_set() or not self.view_count_queue.empty():
                try:
                    try:
                        post_id = self.view_count_queue.get(timeout=0.5)
                    except Empty:
                        continue
                    
                    try:
                        url = f"https://steamrip.com/wp-admin/admin-ajax.php?postviews_id={post_id}&action=tie_postviews&_={int(time.time() * 1000)}"
                        response = view_scraper.get(url, timeout=10)
                        if response.status_code == 200:
                            views = re.sub(r'[^\d]', '', response.text.strip())
                            if views:
                                with self.view_count_cache_lock:
                                    self.view_count_cache[post_id] = views
                                fetched_count += 1
                                if fetched_count % 100 == 0:
                                    self.logger.debug(f"Worker {worker_id}: Fetched {fetched_count} view counts")
                            else:
                                failed_count += 1
                        else:
                            failed_count += 1
                    except Exception as e:
                        failed_count += 1
                        self.logger.debug(f"Worker {worker_id}: Error fetching view count for {post_id}: {e}")
                    
                    time.sleep(0.1)
                    
                except Exception as e:
                    self.logger.debug(f"View count worker {worker_id} error: {e}")
            
            view_scraper.close()
            self.logger.info(f"View count worker {worker_id} finished. Fetched: {fetched_count}, Failed: {failed_count}")
        
        self.view_count_stop_event.clear()
        self.view_count_threads = []
        for i in range(num_workers):
            t = threading.Thread(target=view_count_worker, args=(i,), daemon=True, name=f"ViewCountWorker-{i}")
            t.start()
            self.view_count_threads.append(t)
        
        self.logger.info(f"Started {num_workers} view count fetcher workers")
    
    def _stop_view_count_fetcher(self):
        """Stop the view count fetcher threads"""
        if self.view_count_threads:
            self.logger.info("Stopping view count fetcher...")
            self.view_count_stop_event.set()
            
            for t in self.view_count_threads:
                if t.is_alive():
                    t.join(timeout=5)
            
            self.view_count_threads = []
            self.logger.info(f"View count fetcher stopped. Cached {len(self.view_count_cache)} view counts.")
    
    def _restart_view_count_fetcher(self, cookie, num_workers=4, user_agent=None):
        """Restart the view count fetcher with a new cookie"""
        self.logger.info("Restarting view count fetcher with new cookie...")
        
        if self.view_count_threads:
            self.view_count_stop_event.set()
            for t in self.view_count_threads:
                if t.is_alive():
                    t.join(timeout=2)
            self.view_count_threads = []
        
        self.view_count_stop_event.clear()
        self._start_view_count_fetcher(cookie, num_workers=num_workers, user_agent=user_agent)
        self.logger.info("View count fetcher restarted with new cookie")
    
    def _queue_view_count_fetch(self, post_id):
        """Add a post_id to the view count fetch queue"""
        if post_id:
            self.view_count_queue.put(post_id)
    
    def _get_cached_view_count(self, post_id):
        """Get view count from cache"""
        with self.view_count_cache_lock:
            return self.view_count_cache.get(post_id, "0")
    
    def _apply_view_counts(self, game_data):
        """Apply cached view counts to game data"""
        self.logger.info("Waiting for view count fetcher to finish...")
        queue_wait_start = time.time()
        max_queue_wait = 60
        while not self.view_count_queue.empty() and (time.time() - queue_wait_start) < max_queue_wait:
            remaining = self.view_count_queue.qsize()
            if remaining > 0:
                self.logger.info(f"Waiting for {remaining} view counts to be fetched...")
            time.sleep(2)
        
        self._stop_view_count_fetcher()
        
        self.logger.info("Applying view counts to game data...")
        games_with_views = 0
        games_without_views = 0
        for game in game_data:
            post_id = game.pop("_post_id", None)
            if post_id:
                view_count = self._get_cached_view_count(post_id)
                game["weight"] = view_count
                if view_count != "0":
                    games_with_views += 1
                else:
                    games_without_views += 1
        
        self.logger.info(f"View count stats: {games_with_views} games with views, {games_without_views} games with weight=0")
        self.logger.info(f"Total cached view counts: {len(self.view_count_cache)}")
    
    def _wait_for_cookie_refresh(self):
        """Wait for user to provide a new cookie via stdin"""
        with self.failed_image_lock:
            self.failed_image_count = 0
        
        with self.cookie_refresh_lock:
            if self.new_cookie_value[0] is not None:
                return True
            
            self.logger.info("="*60)
            self.logger.info("COOKIE EXPIRED - Waiting for new cookie...")
            self.logger.info("Please provide a new cf_clearance cookie value.")
            self.logger.info("The process will continue automatically once a new cookie is provided.")
            self.logger.info("="*60)
            
            self.cookie_refresh_event.set()
            
            try:
                print("\n" + "="*60, flush=True)
                print("COOKIE_REFRESH_NEEDED", flush=True)
                print("Enter new cf_clearance cookie value:", flush=True)
                print("="*60, flush=True)
                
                new_cookie = input().strip()
                
                if new_cookie:
                    self.logger.info("Received new cookie, refreshing scraper...")
                    self.scraper = self._create_scraper(new_cookie, self.current_user_agent[0])
                    self.new_cookie_value[0] = new_cookie
                    
                    self.cookie_refresh_event.clear()
                    self.logger.info("Cookie refreshed successfully, resuming...")
                    return True
                else:
                    self.logger.error("No cookie provided, cannot continue")
                    return False
            except EOFError:
                self.logger.error("No input available for cookie refresh")
                return False
            except Exception as e:
                self.logger.error(f"Error reading new cookie: {e}")
                return False
