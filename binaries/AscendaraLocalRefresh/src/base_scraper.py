"""
Base Scraper Abstract Class
Defines the interface that all source scrapers must implement
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Set
import logging


class BaseScraper(ABC):
    """Abstract base class for all game source scrapers"""
    
    def __init__(self, output_dir: str, progress_file: str):
        """
        Initialize the scraper
        
        Args:
            output_dir: Directory to save output files
            progress_file: Path to progress tracking file
        """
        self.output_dir = output_dir
        self.progress_file = progress_file
        self.logger = logging.getLogger(self.__class__.__name__)
    
    @abstractmethod
    def get_source_name(self) -> str:
        """Return the name of this source (e.g., 'SteamRIP', 'FitGirl', etc.)"""
        pass
    
    @abstractmethod
    def initialize(self, cookie: Optional[str] = None) -> bool:
        """
        Initialize the scraper (setup session, validate credentials, etc.)
        
        Args:
            cookie: Optional authentication cookie
            
        Returns:
            True if initialization successful, False otherwise
        """
        pass
    
    @abstractmethod
    def scrape_games(self, blacklist_ids: Set[int]) -> List[Dict]:
        """
        Scrape all games from the source
        
        Args:
            blacklist_ids: Set of game IDs to skip
            
        Returns:
            List of game dictionaries with standardized format
        """
        pass
    
    @abstractmethod
    def get_total_pages(self) -> int:
        """
        Get the total number of pages to scrape
        
        Returns:
            Total page count
        """
        pass
    
    @abstractmethod
    def cleanup(self):
        """Cleanup resources (close sessions, stop threads, etc.)"""
        pass
    
    def get_progress(self) -> Dict:
        """
        Get current scraping progress
        
        Returns:
            Dictionary with progress information
        """
        return {
            'source': self.get_source_name(),
            'output_dir': self.output_dir
        }
