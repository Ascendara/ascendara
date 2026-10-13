"""
SteamRIP Scraper Implementation
Handles all SteamRIP-specific scraping logic
"""

import cloudscraper
import datetime
import hashlib
import os
import shutil
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

try:
    from base_scraper import BaseScraper
    from utils import encode_game_id
except ImportError:
    # Imported as part of a package (the API runs this scraper on a schedule)
    from .base_scraper import BaseScraper
    from .utils import encode_game_id


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
        self.view_counts_enabled = False
        self.view_count_cache = {}
        self.view_count_cache_file = None
        self._VIEW_COUNT_DELAY = 2.0
        self._VIEW_COUNT_MAX_SECONDS = 600
        self._VIEW_COUNT_CONSECUTIVE_FAIL_LIMIT = 5
        
        # Incremental refresh
        self.force_full = False
        # When set, never fall back to a full scrape; scrape_games returns None instead
        self.incremental_only = False
        self.known_img_ids = set()
        self.extra_metadata = {}
        self._INCREMENTAL_MARGIN_DAYS = 2
        self._INCREMENTAL_MAX_AGE_DAYS = 30
        self._INCREMENTAL_MAX_POSTS = 1500
    
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
                self.logger.warning("Cloudflare is challenging requests and no cookie was provided - asking for one")
                if not self._wait_for_cookie_refresh():
                    self.logger.error("Cloudflare protection is active but no cookie was provided")
                    return False
                cookie = self.new_cookie_value[0]
                self.new_cookie_value[0] = None
                user_agent = self.current_user_agent[0]
            
            # Create scraper
            self.scraper = self._create_scraper(cookie if cf_active else None, user_agent)
            
            # Fetch categories
            self.logger.info("Fetching categories...")
            self.category_map = self._fetch_categories()
            
            # Recreate scraper for posts
            self.scraper = self._create_scraper(cookie if cf_active else None, user_agent)
            
            # Start keep-alive thread
            self._start_keep_alive(interval=30)
            
            # Set up view count fetching
            if not skip_views:
                self.view_counts_enabled = True
                self._load_view_count_cache()
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to initialize SteamRIP scraper: {e}")
            return False
    
    def scrape_games(self, blacklist_ids: Set[int], per_page: int = 100, 
                     workers: int = 8, progress=None) -> List[Dict]:
        """Scrape all games from SteamRIP"""
        self.extra_metadata = {
            "lastScrape": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        }
        
        # Only fetch what changed since the existing index when there is one
        baseline = None if self.force_full else self._load_baseline()
        if baseline:
            try:
                merged = self._scrape_incremental(baseline, blacklist_ids, workers, progress)
            except Exception as e:
                self.logger.warning(f"Incremental refresh failed: {e}")
                merged = None
            if merged is not None:
                return merged
            if self.incremental_only:
                self.logger.info("Incremental refresh not possible")
                return None
            self.logger.info("Incremental refresh not possible, running a full scrape")
            self.known_img_ids = set()
        
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
                
                if response.status_code == 403 and not self._is_cloudflare_challenge(response):
                    # Blocked, but not by a Cloudflare challenge - a new cookie would not help
                    consecutive_failures += 1
                    self.logger.warning(f"403 on page {page} without a Cloudflare challenge (attempt {consecutive_failures}), backing off")
                    if consecutive_failures >= max_consecutive_failures:
                        self.logger.error(f"Page {page} keeps returning 403, stopping")
                        break
                    time.sleep(consecutive_failures * 5)
                    continue
                
                if response.status_code == 403:
                    self.logger.warning(f"Cloudflare challenge on page {page}, cookie is missing or expired")
                    consecutive_failures += 1
                    
                    if consecutive_failures >= max_consecutive_failures:
                        if refresh_count >= max_cookie_refreshes:
                            self.logger.error("Max cookie refreshes reached")
                            break
                        
                        refresh_count += 1
                        self.logger.info(f"Cookie refresh attempt {refresh_count}/{max_cookie_refreshes}")
                        
                        if self._wait_for_cookie_refresh():
                            self.scraper = self._create_scraper(self.new_cookie_value[0], self.current_user_agent[0])
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
        
        if self.view_counts_enabled:
            self._fetch_queued_view_counts(game_data)
        
        return game_data
    
    def _load_baseline(self):
        """Load the existing index if it can be used as the starting point for an incremental refresh"""
        try:
            with open(os.path.join(self.output_dir, "ascendara_games.json"), "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            return None
        
        if not isinstance(data, dict) or not isinstance(data.get("games"), list):
            return None
        metadata = data.get("metadata") or {}
        if str(metadata.get("source", "")).upper() not in ("STEAMRIP", "LOCAL_REFRESH_UPLOAD"):
            return None
        if len(data["games"]) < 1000:
            return None
        
        since = None
        for key in ("lastScrape", "lastUpdated"):
            try:
                since = datetime.datetime.fromisoformat(str(metadata[key]).replace("Z", "+00:00"))
                break
            except (KeyError, ValueError):
                continue
        if since is None:
            return None
        if since.tzinfo is None:
            since = since.replace(tzinfo=datetime.timezone.utc)
        
        age = datetime.datetime.now(datetime.timezone.utc) - since
        if age > datetime.timedelta(days=self._INCREMENTAL_MAX_AGE_DAYS):
            self.logger.info(f"Existing index is {age.days} days old, too old for an incremental refresh")
            return None
        
        return {"games": data["games"], "metadata": metadata, "since": since}
    
    def _get_json(self, url, retries=3):
        """GET a JSON endpoint, retrying when the origin is briefly unavailable.
        Returns (data, response); data is None if the request did not succeed."""
        response = None
        for attempt in range(retries):
            response = self.scraper.get(url, timeout=30)
            if response.status_code == 200:
                return response.json(), response
            if response.status_code < 500 and response.status_code != 429:
                break
            if self._is_cloudflare_challenge(response):
                break
            self.logger.warning(f"{response.status_code} from SteamRIP, retrying ({attempt + 1}/{retries})...")
            time.sleep((attempt + 1) * 5)
        return None, response
    
    def _fetch_sitemap_links(self):
        """Links of every post, from the WordPress sitemap. Returns None if unavailable."""
        try:
            response = self.scraper.get("https://steamrip.com/wp-sitemap.xml", timeout=30)
            if response.status_code != 200:
                return None
            sitemaps = [
                url for url in re.findall(r"<loc>([^<]+)</loc>", response.text)
                if "/wp-sitemap-posts-post-" in url
            ]
            links = set()
            for url in sitemaps:
                response = self.scraper.get(url, timeout=30)
                if response.status_code != 200:
                    return None
                links.update(html.unescape(link) for link in re.findall(r"<loc>([^<]+)</loc>", response.text))
            return links
        except Exception as e:
            self.logger.warning(f"Could not read the sitemap: {e}")
            return None
    
    def _fetch_posts(self, query, limit):
        """Fetch every page of a posts query. Returns None if it failed or exceeds limit."""
        posts = []
        page = 1
        while True:
            data, response = self._get_json(f"{self.base_url}?per_page=100&page={page}&{query}")
            if data is None:
                # WordPress answers 400 when asked for a page past the end
                if response is not None and response.status_code == 400 and page > 1:
                    break
                return None
            posts.extend(data)
            if len(posts) > limit:
                return None
            if len(data) < 100:
                break
            page += 1
        return posts
    
    def _process_posts(self, posts, imgs_dir, workers, progress, blacklist_ids):
        """Process posts in parallel. Returns game entries, or None if the cookie expired."""
        results = []
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(self._process_post, post, imgs_dir, progress, blacklist_ids)
                for post in posts
            ]
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result:
                        results.append(result)
                    if progress:
                        progress.increment_processed()
                except CookieExpiredError:
                    for f in futures:
                        f.cancel()
                    return None
                except Exception as e:
                    self.logger.error(f"Error processing post: {e}")
                    if progress:
                        progress.add_error(str(e))
        return results
    
    def _scrape_incremental(self, baseline, blacklist_ids, workers, progress):
        """Refresh the existing index by fetching only posts modified since it was built.
        Returns the merged game list, or None if a full scrape is needed instead."""
        imgs_dir = f"{self.output_dir}/imgs_incoming"
        
        games_by_id = {}
        for game in baseline["games"]:
            if isinstance(game, dict) and game.get("gameID"):
                games_by_id.setdefault(game["gameID"], game)
        # Covers the index already has don't need downloading again
        self.known_img_ids = {game["imgID"] for game in games_by_id.values() if game.get("imgID")}
        
        since = baseline["since"] - datetime.timedelta(days=self._INCREMENTAL_MARGIN_DAYS)
        since_param = since.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        self.logger.info(f"Incremental refresh: fetching posts modified since {since_param}")
        
        modified = self._fetch_posts(f"modified_after={since_param}", self._INCREMENTAL_MAX_POSTS)
        if modified is None:
            return None
        self.logger.info(f"{len(modified)} posts modified since the last refresh")
        
        # The sitemap lists every post, which shows what was removed and
        # anything the modified query didn't cover.
        live_links = self._fetch_sitemap_links()
        if not live_links:
            return None
        
        removed = [
            game_id for game_id, game in games_by_id.items()
            if game.get("dirlink") not in live_links
        ]
        if len(removed) > len(games_by_id) * 0.2:
            self.logger.warning(f"{len(removed)} games missing from the sitemap, not trusting it")
            return None
        for game_id in removed:
            del games_by_id[game_id]
        if removed:
            self.logger.info(f"Removed {len(removed)} games that no longer exist")
        
        covered_links = {game.get("dirlink") for game in games_by_id.values()}
        covered_links.update(post.get("link") for post in modified)
        missing_links = sorted(link for link in live_links if link not in covered_links)
        if len(missing_links) > self._INCREMENTAL_MAX_POSTS:
            return None
        
        missing_posts = []
        for start in range(0, len(missing_links), 50):
            slugs = ",".join(
                link.rstrip("/").rsplit("/", 1)[-1] for link in missing_links[start:start + 50]
            )
            data, _ = self._get_json(f"{self.base_url}?per_page=100&slug={slugs}")
            if data is None:
                return None
            missing_posts.extend(data)
        
        posts = modified + missing_posts
        if progress:
            progress.set_total_posts(len(posts))
        results = self._process_posts(posts, imgs_dir, workers, progress, blacklist_ids)
        if results is None:
            return None
        
        if self.view_counts_enabled:
            self._fetch_queued_view_counts(results)
        
        new_games = []
        for game in results:
            if game["gameID"] in games_by_id:
                # Keep the known popularity when it wasn't fetched this time
                if game.get("weight") in (None, "", "0"):
                    game["weight"] = games_by_id[game["gameID"]].get("weight", "0")
                # Keep the known cover when the new one couldn't be downloaded
                if not game.get("imgID"):
                    game["imgID"] = games_by_id[game["gameID"]].get("imgID", "")
                games_by_id[game["gameID"]] = game
            else:
                new_games.append(game)
        
        blacklisted_game_ids = {encode_game_id(post_id) for post_id in (blacklist_ids or [])}
        merged = [
            game for game in new_games + list(games_by_id.values())
            if game["gameID"] not in blacklisted_game_ids
        ]
        
        self.logger.info(
            f"Incremental refresh done: {len(results)} updated ({len(new_games)} new), {len(merged)} games total"
        )
        return merged
    
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
        if self.scraper:
            self.scraper.close()
    
    # Private helper methods
    
    def _is_cloudflare_challenge(self, response):
        """True only when the response is an actual Cloudflare challenge.
        
        A plain 403/429 (rate limit, hotlink protection, missing file) is not one,
        and a cookie does nothing for those.
        """
        if response is None or response.status_code not in (403, 503):
            return False
        if response.headers.get("cf-mitigated", "").lower() == "challenge":
            return True
        if "text/html" not in response.headers.get("Content-Type", "").lower():
            return False
        try:
            body = response.text[:8192]
        except Exception:
            return False
        return "Just a moment" in body or "challenge-platform" in body or "cf-chl" in body
    
    def _check_cloudflare_protection(self, user_agent=None):
        """Check if Cloudflare is challenging the endpoints the scraper needs"""
        self.logger.info("Checking if Cloudflare protection is active...")
        
        urls_to_check = [
            ("posts API", "https://steamrip.com/wp-json/wp/v2/posts?per_page=1"),
            ("game page", "https://steamrip.com/"),
        ]
        
        # Probe with the same client the scrape uses. A differently configured one
        # can fail where the real scraper works (e.g. on SSL verification) and
        # would say nothing about what the scrape will actually run into.
        try:
            test_scraper = self._create_scraper(None, user_agent)
        except Exception as e:
            self.logger.warning(f"Could not create a scraper for the Cloudflare check: {e}")
            return False
        
        try:
            for label, url in urls_to_check:
                # Only a real challenge counts. Timeouts and odd statuses are retried
                # and then left for the scrape itself to deal with.
                for attempt in range(3):
                    try:
                        response = test_scraper.get(url, timeout=15)
                    except Exception as e:
                        self.logger.warning(f"Error checking {label} (attempt {attempt + 1}): {e}")
                        time.sleep(attempt + 1)
                        continue
                    
                    if self._is_cloudflare_challenge(response):
                        self.logger.info(f"✗ Cloudflare is challenging {label} - cookie required")
                        return True
                    if response.status_code == 200:
                        self.logger.info(f"✓ {label}: accessible without cookie")
                        break
                    self.logger.warning(f"Unexpected status {response.status_code} on {label} (attempt {attempt + 1}), not a Cloudflare challenge")
                    time.sleep(attempt + 1)
                else:
                    self.logger.warning(f"Could not confirm {label} is reachable, continuing without assuming Cloudflare is active")
            
            self.logger.info("✓ No Cloudflare challenge on any endpoint - cookie not required")
            return False
        finally:
            test_scraper.close()
    
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
                img_id = self._download_image(image_url, self._image_id_for(image_url), imgs_dir, progress)
            
            # Get categories
            cat_ids = post.get("categories", [])
            categories = [self.category_map.get(cid, "") for cid in cat_ids if self.category_map.get(cid)]
            
            # Get dates
            latest_update = post.get("modified", "")[:10] if post.get("modified") else ""
            
            # Use cached view count if available; otherwise queue for later
            cached_weight = self.view_count_cache.get(str(post_id)) if self.view_counts_enabled else None
            
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
                "weight": cached_weight if cached_weight is not None else "0",
                "imgID": img_id,
                "gameID": encoded_game_id,
                "category": categories,
                "latest_update": latest_update,
                "minReqs": min_reqs
            }
            
            if self.view_counts_enabled and cached_weight is None and post_id:
                game_entry["_post_id"] = post_id
            
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
            elif "bzzhr.to" in href:
                download_links.setdefault("buzzheavier", []).append(href)
            elif "vikingfile.com" in href:
                download_links.setdefault("vikingfile", []).append(href)
            elif "datanodes.to" in href:
                download_links.setdefault("datanodes", []).append(href)
            elif "1fichier.com" in href:
                download_links.setdefault("1fichier", []).append(href)
            elif "fileditchfiles.me" in href or "fileditch.com" in href:
                download_links.setdefault("fileditch", []).append(href)
        
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
    
    def _image_id_for(self, image_url):
        """Stable ID for a cover, so an unchanged image keeps its ID between scrapes"""
        return hashlib.sha1(image_url.encode("utf-8")).hexdigest()[:16]
    
    def _download_image(self, image_url, img_id, imgs_dir, progress):
        """Download and save image with rate limiting and retry"""
        if not image_url:
            return ""
        
        # The index already has this cover; the app loads it on demand
        if img_id in self.known_img_ids:
            return img_id
        
        if progress:
            progress.increment_images()
        
        # Reuse the cover from the current index instead of downloading it again
        existing_path = os.path.join(self.output_dir, "imgs", f"{img_id}.jpg")
        if os.path.exists(existing_path):
            try:
                shutil.copy2(existing_path, os.path.join(imgs_dir, f"{img_id}.jpg"))
                if progress:
                    progress.increment_downloaded_images()
                return img_id
            except OSError as e:
                self.logger.warning(f"Could not reuse image {img_id}: {e}")
        
        max_retries = 3
        
        for attempt in range(max_retries):
            with self.failed_image_lock:
                if self.failed_image_count >= self.MAX_FAILED_IMAGES:
                    self.logger.warning(f"Hit {self.MAX_FAILED_IMAGES} Cloudflare challenges on images, triggering cookie refresh...")
                    raise CookieExpiredError("Cloudflare is challenging image downloads")
            
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
                
                if self._is_cloudflare_challenge(response):
                    self.logger.warning(f"Cloudflare challenge on image (attempt {attempt+1}), cookie is missing or expired")
                    with self.failed_image_lock:
                        self.failed_image_count += 1
                        if self.failed_image_count >= self.MAX_FAILED_IMAGES:
                            raise CookieExpiredError("Cloudflare is challenging image downloads")
                    time.sleep((attempt + 1) * 2)
                    continue
                
                if response.status_code == 403:
                    self.logger.warning(f"403 on image without a Cloudflare challenge (attempt {attempt+1}), backing off")
                    time.sleep((attempt + 1) * 2)
                    continue
                
                if response.status_code == 404:
                    self.logger.warning(f"Image no longer exists: {image_url}")
                    return ""
                
                response.raise_for_status()
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
                    # A network error says nothing about the cookie, so skip the cover
                    self.logger.warning(f"Failed to download image after {max_retries} attempts: {image_url} ({e})")
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
    
    def _load_view_count_cache(self):
        """Load persistent view count cache from disk."""
        import os
        self.view_count_cache_file = os.path.join(self.output_dir, "view_count_cache.json")
        if os.path.exists(self.view_count_cache_file):
            try:
                with open(self.view_count_cache_file, "r", encoding="utf-8") as f:
                    self.view_count_cache = json.load(f)
                self.logger.info(f"Loaded {len(self.view_count_cache)} cached view counts")
            except Exception as e:
                self.logger.warning(f"Could not load view count cache: {e}")
                self.view_count_cache = {}

    def _save_view_count_cache(self):
        """Save view count cache to disk."""
        if not self.view_count_cache_file:
            return
        try:
            with open(self.view_count_cache_file, "w", encoding="utf-8") as f:
                json.dump(self.view_count_cache, f)
            self.logger.info(f"Saved {len(self.view_count_cache)} view counts to cache")
        except Exception as e:
            self.logger.warning(f"Could not save view count cache: {e}")

    def _extract_view_count_from_html(self, html_text):
        """Extract view count from a SteamRIP game page's HTML.
        The TiePedia theme renders view counts like:
        <span class="meta-views meta-item very-hot"><span class="tie-icon-fire" ...></span> 26,374 </span>
        Note: there may be nested <span> tags between the class and the actual number."""
        # Pattern 1: meta-views span - may contain nested spans before the number
        match = re.search(r'class="[^"]*meta-views[^"]*"[^>]*>(?:<[^>]*>)*\s*([\d,]+)', html_text)
        if match:
            return match.group(1).replace(',', '')
        
        # Pattern 2: tie-views span
        match = re.search(r'class="[^"]*tie-views[^"]*"[^>]*>(?:<[^>]*>)*\s*([\d,]+)', html_text)
        if match:
            return match.group(1).replace(',', '')
        
        # Pattern 3: post-views span
        match = re.search(r'class="[^"]*post-views[^"]*"[^>]*>(?:<[^>]*>)*\s*([\d,]+)', html_text)
        if match:
            return match.group(1).replace(',', '')
        
        # Pattern 4: "N Views" text pattern
        match = re.search(r'>\s*([\d,]+)\s*(?:Views?|views?)\s*<', html_text)
        if match:
            return match.group(1).replace(',', '')
        
        # Pattern 5: data-views attribute
        match = re.search(r'data-views=["\']?(\d+)', html_text)
        if match:
            return match.group(1)
        
        # Pattern 6: postviews_id in inline script with count
        match = re.search(r'tie_postviews[^}]*?["\']count["\']\s*:\s*["\']?(\d+)', html_text)
        if match:
            return match.group(1)
        
        return None

    def _fetch_queued_view_counts(self, game_data: List[Dict], workers: int = 6):
        """Fetch view counts by scraping each game's HTML page (dirlink) in parallel.
        Uses a thread pool to avoid the ~2h serial wait for thousands of games.
        Updates game_data in place and saves the cache on completion."""
        pending = [(i, game["_post_id"], game.get("dirlink", "")) 
                   for i, game in enumerate(game_data) if "_post_id" in game]
        
        if not pending:
            self.logger.info("All view counts served from cache")
            return
        
        self.logger.info(f"Fetching {len(pending)} view counts from game pages ({workers} workers, max {self._VIEW_COUNT_MAX_SECONDS}s)...")
        
        lock = threading.Lock()
        state = {"fetched": 0, "consecutive_failures": 0, "stop": False}
        start_time = time.time()
        
        def fetch_one(game_idx, post_id, dirlink):
            if state["stop"]:
                return
            if time.time() - start_time > self._VIEW_COUNT_MAX_SECONDS:
                with lock:
                    if not state["stop"]:
                        state["stop"] = True
                        self.logger.warning(
                            f"View count time limit ({self._VIEW_COUNT_MAX_SECONDS}s) reached after {state['fetched']} fetches - stopping"
                        )
                return
            
            if not dirlink:
                return
            
            try:
                response = self.scraper.get(dirlink, timeout=15)
                
                if response.status_code == 200:
                    with lock:
                        state["consecutive_failures"] = 0
                    views = self._extract_view_count_from_html(response.text)
                    if views:
                        with lock:
                            game_data[game_idx]["weight"] = views
                            self.view_count_cache[str(post_id)] = views
                            state["fetched"] += 1
                            if state["fetched"] % 100 == 0:
                                self.logger.info(f"View counts fetched: {state['fetched']}/{len(pending)}")
                                self._save_view_count_cache()
                
                elif response.status_code in (429, 403):
                    with lock:
                        state["consecutive_failures"] += 1
                        if state["consecutive_failures"] >= self._VIEW_COUNT_CONSECUTIVE_FAIL_LIMIT:
                            state["stop"] = True
                            self.logger.warning(
                                f"View count fetching rate-limited ({state['consecutive_failures']} consecutive failures) - stopping"
                            )
                
            except Exception as e:
                with lock:
                    state["consecutive_failures"] += 1
                    if state["consecutive_failures"] >= self._VIEW_COUNT_CONSECUTIVE_FAIL_LIMIT:
                        state["stop"] = True
                        self.logger.warning(f"Too many consecutive failures fetching view counts - stopping")
        
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {}
            for game_idx, post_id, dirlink in pending:
                if state["stop"]:
                    break
                futures[executor.submit(fetch_one, game_idx, post_id, dirlink)] = post_id
                time.sleep(0.15)
            
            for future in as_completed(futures):
                if state["stop"]:
                    for f in futures:
                        f.cancel()
                    break
                try:
                    future.result()
                except Exception:
                    pass
        
        for game in game_data:
            game.pop("_post_id", None)
        
        self.logger.info(f"View count fetching complete: {state['fetched']} new, {len(self.view_count_cache)} total cached")
        self._save_view_count_cache()
    
    def _wait_for_cookie_refresh(self):
        """Wait for user to provide a new cookie via stdin"""
        with self.failed_image_lock:
            self.failed_image_count = 0
        
        with self.cookie_refresh_lock:
            if self.new_cookie_value[0] is not None:
                return True
            
            self.logger.info("="*60)
            self.logger.info("COOKIE NEEDED - Waiting for new cookie...")
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
                
                # The app sends {"cookie": ..., "userAgent": ...} when it knows which
                # browser solved the challenge - cf_clearance only works with that one
                if new_cookie.startswith("{"):
                    try:
                        payload = json.loads(new_cookie)
                        new_cookie = str(payload.get("cookie") or "").strip()
                        if payload.get("userAgent"):
                            self.current_user_agent[0] = payload["userAgent"]
                    except ValueError:
                        pass
                
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
