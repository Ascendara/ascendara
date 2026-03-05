"""
GOG-Games.to Scraper Implementation
Handles scraping game data from gog-games.to
"""

import requests
import json
import time
import threading
import logging
import re
import html
import random
import string
import os
from typing import Dict, List, Optional, Set
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup

from base_scraper import BaseScraper
from utils import encode_game_id


class GOGGamesScraper(BaseScraper):
    """Scraper implementation for GOG-Games.to source"""
    
    def __init__(self, output_dir: str, progress_file: str):
        super().__init__(output_dir, progress_file)
        
        # GOG-Games specific configuration
        self.base_url = "https://gog-games.to"
        self.session = None
        self.total_pages = 0
        
        # Rate limiting
        self.request_lock = threading.Lock()
        self.last_request = 0
        self.REQUEST_DELAY = 0.5  # seconds between requests
        
        # Image download rate limiting
        self.image_download_lock = threading.Lock()
        self.last_image_download = 0
        self.IMAGE_DOWNLOAD_DELAY = 0.3
    
    def get_source_name(self) -> str:
        return "GOG-Games"
    
    def initialize(self, cookie: Optional[str] = None, user_agent: Optional[str] = None, 
                   skip_views: bool = False, view_workers: int = 4) -> bool:
        """Initialize the GOG-Games scraper"""
        try:
            self.session = requests.Session()
            
            # Set headers
            headers = {
                'User-Agent': user_agent if user_agent else 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
            
            if cookie:
                headers['Cookie'] = cookie
            
            self.session.headers.update(headers)
            
            # Test connection
            self.logger.info("Testing connection to gog-games.to...")
            response = self._rate_limited_get(f"{self.base_url}/")
            
            if response.status_code != 200:
                self.logger.error(f"Failed to connect: HTTP {response.status_code}")
                return False
            
            self.logger.info("Successfully connected to gog-games.to")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to initialize GOG-Games scraper: {e}")
            return False
    
    def scrape_games(self, blacklist_ids: Set[int], per_page: int = 100, 
                     workers: int = 8, progress=None) -> List[Dict]:
        """Scrape all games from GOG-Games.to"""
        game_data = []
        processed_game_urls = set()
        
        imgs_dir = f"{self.output_dir}/imgs_incoming"
        
        # GOG-Games typically shows games in a paginated list
        # We'll scrape the game list pages and then fetch details for each game
        page = 1
        max_pages = 200  # Safety limit
        
        self.logger.info("Starting to scrape game listings...")
        
        while page <= max_pages:
            try:
                # Fetch game list page
                list_url = f"{self.base_url}/games?page={page}"
                self.logger.info(f"Fetching page {page}: {list_url}")
                
                response = self._rate_limited_get(list_url)
                
                if response.status_code != 200:
                    self.logger.warning(f"Got status {response.status_code} on page {page}, stopping")
                    break
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Find game links on the page
                # GOG-Games typically has game cards with links
                game_links = self._extract_game_links(soup)
                
                if not game_links:
                    self.logger.info(f"No more games found on page {page}, stopping")
                    break
                
                self.logger.info(f"Found {len(game_links)} games on page {page}")
                
                # Update total if this is first page
                if page == 1 and progress:
                    # Estimate total based on pagination
                    total_estimate = len(game_links) * max_pages
                    progress.set_total_posts(total_estimate)
                
                # Process each game
                for game_url in game_links:
                    if game_url in processed_game_urls:
                        continue
                    
                    processed_game_urls.add(game_url)
                    
                    try:
                        game_entry = self._process_game(game_url, imgs_dir, progress, blacklist_ids)
                        if game_entry:
                            game_data.append(game_entry)
                        
                        if progress:
                            progress.increment_processed()
                    
                    except Exception as e:
                        self.logger.error(f"Error processing game {game_url}: {e}")
                        if progress:
                            progress.add_error(f"Error processing {game_url}: {str(e)}")
                
                page += 1
                time.sleep(1)  # Be nice to the server between pages
                
            except Exception as e:
                self.logger.error(f"Error fetching page {page}: {e}")
                if progress:
                    progress.add_error(f"Error fetching page {page}: {str(e)}")
                break
        
        self.logger.info(f"Scraped {len(game_data)} games total")
        return game_data
    
    def get_total_pages(self) -> int:
        """Get total number of pages"""
        return self.total_pages
    
    def cleanup(self):
        """Cleanup resources"""
        if self.session:
            self.session.close()
    
    # Private helper methods
    
    def _rate_limited_get(self, url, timeout=30):
        """Make a rate-limited GET request"""
        with self.request_lock:
            elapsed = time.time() - self.last_request
            if elapsed < self.REQUEST_DELAY:
                time.sleep(self.REQUEST_DELAY - elapsed)
            
            response = self.session.get(url, timeout=timeout)
            self.last_request = time.time()
            return response
    
    def _extract_game_links(self, soup):
        """Extract game page links from a listing page"""
        game_links = []
        
        # Try multiple selectors as the site structure may vary
        # Common patterns: game cards, game titles, etc.
        selectors = [
            'a[href*="/game/"]',
            '.game-card a',
            '.game-item a',
            'a.game-link',
            'div.game a'
        ]
        
        for selector in selectors:
            links = soup.select(selector)
            if links:
                for link in links:
                    href = link.get('href', '')
                    if href and '/game/' in href:
                        full_url = href if href.startswith('http') else f"{self.base_url}{href}"
                        if full_url not in game_links:
                            game_links.append(full_url)
                break  # Use first selector that works
        
        return game_links
    
    def _process_game(self, game_url, imgs_dir, progress, blacklist_ids=None):
        """Process a single game page and return game data"""
        try:
            if progress:
                progress.set_current_game(f"Fetching {game_url}")
            
            response = self._rate_limited_get(game_url)
            
            if response.status_code != 200:
                self.logger.warning(f"Failed to fetch {game_url}: HTTP {response.status_code}")
                return None
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract game data
            game_name = self._extract_game_name(soup)
            if not game_name:
                self.logger.warning(f"Could not extract game name from {game_url}")
                return None
            
            if progress:
                progress.set_current_game(game_name)
            
            # Extract other metadata
            game_size = self._extract_game_size(soup)
            version = self._extract_version(soup)
            download_links = self._extract_download_links(soup)
            
            # Get image
            image_url = self._extract_image_url(soup)
            img_id = self._generate_random_id()
            if image_url:
                img_id = self._download_image(image_url, img_id, imgs_dir, progress)
            
            # Generate game ID from URL
            game_id_num = self._extract_game_id_from_url(game_url)
            encoded_game_id = encode_game_id(game_id_num) if game_id_num else self._generate_random_id(6)
            
            # Get release date/update date
            latest_update = self._extract_update_date(soup)
            
            game_entry = {
                "game": game_name,
                "size": game_size,
                "version": version,
                "releasedBy": "GOG",
                "online": False,  # GOG games are typically DRM-free single player
                "dlc": False,  # Can't easily determine from page
                "dirlink": game_url,
                "download_links": download_links,
                "weight": "0",  # No view counts available
                "imgID": img_id,
                "gameID": encoded_game_id,
                "category": ["GOG"],
                "latest_update": latest_update,
                "minReqs": None  # Not typically listed on GOG-Games
            }
            
            return game_entry
        
        except Exception as e:
            error_msg = f"Error processing game {game_url}: {e}"
            self.logger.error(error_msg)
            if progress:
                progress.add_error(error_msg)
            return None
    
    def _extract_game_name(self, soup):
        """Extract game name from page"""
        # Try multiple selectors
        selectors = [
            'h1.game-title',
            'h1',
            '.game-name',
            'title'
        ]
        
        for selector in selectors:
            element = soup.select_one(selector)
            if element:
                name = element.get_text(strip=True)
                # Clean up title
                name = name.replace(' - GOG Games', '').replace('Download', '').strip()
                name = html.unescape(name)
                if name:
                    return name
        
        return ""
    
    def _extract_game_size(self, soup):
        """Extract game size from page"""
        # Look for size information in common locations
        text = soup.get_text()
        
        # Common patterns: "Size: 5.2 GB", "5.2GB", etc.
        size_patterns = [
            r'Size:?\s*([0-9.]+\s*[GM]B)',
            r'([0-9.]+\s*[GM]B)',
        ]
        
        for pattern in size_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return ""
    
    def _extract_version(self, soup):
        """Extract version from page"""
        text = soup.get_text()
        
        # Common patterns: "Version: 1.0.5", "v1.0.5", etc.
        version_patterns = [
            r'Version:?\s*([0-9.]+[a-zA-Z0-9._-]*)',
            r'v\.?\s*([0-9.]+[a-zA-Z0-9._-]*)',
        ]
        
        for pattern in version_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return ""
    
    def _extract_download_links(self, soup):
        """Extract download links from page"""
        download_links = {}
        
        # Find all links on the page
        links = soup.find_all('a', href=True)
        
        for link in links:
            href = link.get('href', '')
            
            # Check for various file hosting services
            if 'gofile.io' in href:
                download_links.setdefault('gofile', []).append(href)
            elif 'pixeldrain.com' in href:
                download_links.setdefault('pixeldrain', []).append(href)
            elif 'buzzheavier.com' in href:
                download_links.setdefault('buzzheavier', []).append(href)
            elif '1fichier.com' in href:
                download_links.setdefault('1fichier', []).append(href)
            elif 'mediafire.com' in href:
                download_links.setdefault('mediafire', []).append(href)
            elif 'mega.nz' in href or 'mega.io' in href:
                download_links.setdefault('mega', []).append(href)
        
        return download_links
    
    def _extract_image_url(self, soup):
        """Extract game cover image URL"""
        # Try og:image meta tag first
        og_image = soup.find('meta', property='og:image')
        if og_image and og_image.get('content'):
            return og_image.get('content')
        
        # Try common image selectors
        selectors = [
            'img.game-cover',
            'img.cover',
            '.game-image img',
            'img[alt*="cover"]',
            'img[src*="cover"]'
        ]
        
        for selector in selectors:
            img = soup.select_one(selector)
            if img and img.get('src'):
                src = img.get('src')
                if src.startswith('http'):
                    return src
                elif src.startswith('/'):
                    return f"{self.base_url}{src}"
        
        return ""
    
    def _extract_update_date(self, soup):
        """Extract last update date"""
        text = soup.get_text()
        
        # Look for date patterns
        date_patterns = [
            r'Updated:?\s*(\d{4}-\d{2}-\d{2})',
            r'(\d{4}-\d{2}-\d{2})',
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        
        return ""
    
    def _extract_game_id_from_url(self, url):
        """Extract numeric game ID from URL"""
        # Try to extract a numeric ID from the URL
        match = re.search(r'/game/(\d+)', url)
        if match:
            return int(match.group(1))
        
        # If no numeric ID, hash the URL to get a consistent number
        return abs(hash(url)) % (10 ** 8)
    
    def _generate_random_id(self, length=10):
        """Generate a random alphanumeric ID"""
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))
    
    def _download_image(self, image_url, img_id, imgs_dir, progress):
        """Download and save image with rate limiting"""
        if not image_url:
            return ""
        
        if progress:
            progress.increment_images()
        
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                with self.image_download_lock:
                    elapsed = time.time() - self.last_image_download
                    if elapsed < self.IMAGE_DOWNLOAD_DELAY:
                        time.sleep(self.IMAGE_DOWNLOAD_DELAY - elapsed)
                    self.last_image_download = time.time()
                
                response = self.session.get(image_url, timeout=15)
                
                if response.status_code == 429:
                    wait_time = (attempt + 1) * 5
                    self.logger.warning(f"429 on image, waiting {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                
                img_path = os.path.join(imgs_dir, f"{img_id}.jpg")
                with open(img_path, 'wb') as f:
                    f.write(response.content)
                
                if progress:
                    progress.increment_downloaded_images()
                
                return img_id
                
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep((attempt + 1) * 2)
                else:
                    self.logger.warning(f"Failed to download image after {max_retries} attempts: {image_url}")
        
        return ""
