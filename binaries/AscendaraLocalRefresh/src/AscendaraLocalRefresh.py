# ==============================================================================
# Ascendara Local Refresh
# ==============================================================================
# A command-line tool for refreshing the local game index by scraping game sources
# Read more about the Local Refresh Tool here:
# https://ascendara.app/docs/binary-tool/local-refresh

import json
import datetime
import os
import sys
import argparse
import logging
import subprocess
import atexit
import shutil
import signal
import zipfile
import time
import threading

from steamrip_scraper import SteamRIPScraper
from utils import get_blacklist_ids, send_notification

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Available scrapers - add new sources here
AVAILABLE_SCRAPERS = {
    'steamrip': SteamRIPScraper,
    # Future sources can be added here:
    # 'fitgirl': FitGirlScraper,
    # 'dodi': DodiScraper,
}


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
        self.last_successful_timestamp = None
        try:
            if os.path.exists(self.progress_file):
                with open(self.progress_file, 'r', encoding='utf-8') as f:
                    old_progress = json.load(f)
                    self.last_successful_timestamp = old_progress.get('lastSuccessfulTimestamp')
        except Exception as e:
            logging.debug(f"Could not load previous progress: {e}")
        self._update_progress()
    
    def _update_progress(self):
        """Write progress to file with thread safety"""
        with self.lock:
            elapsed = time.time() - self.start_time
            raw_progress = self.processed_posts / max(1, self.total_posts)
            capped_progress = min(raw_progress, 1.0)
            
            progress_data = {
                "status": self.status,
                "phase": self.phase,
                "totalPosts": self.total_posts,
                "processedPosts": self.processed_posts,
                "totalImages": self.total_images,
                "downloadedImages": self.downloaded_images,
                "currentGame": self.current_game,
                "progress": round(capped_progress, 4),
                "elapsedSeconds": round(elapsed, 1),
                "errors": self.errors[-10:],
                "timestamp": time.time(),
                "waitingForCookie": self.phase == "waiting_for_cookie",
                "lastSuccessfulTimestamp": self.last_successful_timestamp
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
        self.processed_posts = 0
        self._update_progress()
    
    def increment_processed(self):
        self.processed_posts += 1
        self._update_progress()
    
    def set_current_game(self, game_name):
        self.current_game = game_name
        self._update_progress()
    
    def update(self, message=""):
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
        if success:
            self.last_successful_timestamp = time.time()
        self._update_progress()


def _launch_notification(title, message):
    """Launch notification helper to show a system notification if enabled."""
    try:
        exe_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
        notification_helper_path = os.path.join(exe_dir, 'AscendaraNotificationHelper.exe')
        
        if os.path.exists(notification_helper_path):
            from utils import get_notification_settings
            enabled, theme = get_notification_settings()
            if not enabled:
                return
            
            subprocess.Popen(
                [notification_helper_path, "--theme", theme, "--title", title, "--message", message],
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )
    except Exception as e:
        logging.error(f"Failed to launch notification helper: {e}")


def _launch_crash_reporter_on_exit(error_code, error_message):
    """Launch crash reporter on exit"""
    try:
        binary_name = 'AscendaraCrashReporter.exe' if sys.platform == 'win32' else 'AscendaraCrashReporter'
        crash_reporter_path = os.path.join('.', binary_name)
        if os.path.exists(crash_reporter_path):
            subprocess.Popen(
                [crash_reporter_path, "localrefresh", str(error_code), error_message],
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )
    except Exception as e:
        logging.error(f"Failed to launch crash reporter: {e}")


def launch_crash_reporter(error_code, error_message):
    """Register the crash reporter to launch on exit with the given error details"""
    if not hasattr(launch_crash_reporter, "_registered"):
        atexit.register(_launch_crash_reporter_on_exit, error_code, error_message)
        launch_crash_reporter._registered = True


def extract_shared_index(zip_path, output_dir):
    """Extract a downloaded shared index zip file"""
    progress = RefreshProgress(output_dir)
    progress.set_status("running")
    progress.set_phase("extracting")
    
    try:
        logging.info(f"Extracting shared index from {zip_path} to {output_dir}")
        
        games_file = os.path.join(output_dir, "ascendara_games.json")
        imgs_dir = os.path.join(output_dir, "imgs")
        games_backup = os.path.join(output_dir, "ascendara_games_backup.json")
        imgs_backup = os.path.join(output_dir, "imgs_backup")
        
        game_count = 0
        if os.path.exists(games_file):
            try:
                with open(games_file, 'r', encoding='utf-8') as f:
                    games_data = json.load(f)
                    game_count = len(games_data)
                    logging.info(f"Current game count: {game_count}")
            except Exception as e:
                logging.warning(f"Could not read game count: {e}")
            
            shutil.copy2(games_file, games_backup)
            logging.info("Backed up ascendara_games.json")
        
        if os.path.exists(imgs_dir):
            if os.path.exists(imgs_backup):
                shutil.rmtree(imgs_backup)
            
            total_img_files = sum(len(files) for _, _, files in os.walk(imgs_dir))
            logging.info(f"Found {total_img_files} image files")
            
            if game_count > 0 and total_img_files > game_count:
                logging.warning(f"Image count ({total_img_files}) exceeds game count ({game_count})")
                logging.warning("Deleting all images to allow fresh download")
                progress.set_current_game("Cleaning up excess images...")
                shutil.rmtree(imgs_dir)
                logging.info("Deleted imgs directory - will download fresh images")
            else:
                logging.info(f"Backing up {total_img_files} image files...")
                progress.set_total_posts(total_img_files)
                progress.set_current_game(f"Backing up images (0/{total_img_files})...")
                
                os.makedirs(imgs_backup, exist_ok=True)
                copied_files = 0
                for root, dirs, files in os.walk(imgs_dir):
                    rel_path = os.path.relpath(root, imgs_dir)
                    dest_dir = os.path.join(imgs_backup, rel_path) if rel_path != '.' else imgs_backup
                    os.makedirs(dest_dir, exist_ok=True)
                    
                    for file in files:
                        src_file = os.path.join(root, file)
                        dst_file = os.path.join(dest_dir, file)
                        shutil.copy2(src_file, dst_file)
                        copied_files += 1
                        
                        if copied_files % 50 == 0 or copied_files == total_img_files:
                            progress.processed_posts = copied_files
                            progress.set_current_game(f"Backing up images ({copied_files}/{total_img_files})...")
                
                logging.info("Backed up imgs directory")
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            total_files = len(zip_ref.namelist())
            logging.info(f"Extracting {total_files} files...")
            progress.set_total_posts(total_files)
            
            for i, file in enumerate(zip_ref.namelist()):
                zip_ref.extract(file, output_dir)
                progress.processed_posts += 1
                
                if i % 10 == 0 or i == total_files - 1:
                    progress_percent = ((i + 1) / total_files) * 100
                    progress.set_current_game(f"Extracting: {i + 1}/{total_files} files")
        
        try:
            os.remove(zip_path)
            logging.info("Removed zip file")
        except Exception as e:
            logging.warning(f"Could not remove zip file: {e}")
        
        try:
            if os.path.exists(games_backup):
                os.remove(games_backup)
            if os.path.exists(imgs_backup):
                shutil.rmtree(imgs_backup)
            logging.info("Cleaned up backup files")
        except Exception as e:
            logging.warning(f"Could not clean up backups: {e}")
        
        progress.set_current_game("Extraction complete")
        progress.complete(success=True)
        logging.info("Shared index extraction completed successfully")
        
    except Exception as e:
        logging.error(f"Failed to extract shared index: {e}")
        progress.add_error(str(e))
        progress.complete(success=False)
        
        try:
            if os.path.exists(games_backup):
                shutil.copy2(games_backup, games_file)
                logging.info("Restored ascendara_games.json from backup")
            if os.path.exists(imgs_backup):
                if os.path.exists(imgs_dir):
                    shutil.rmtree(imgs_dir)
                shutil.copytree(imgs_backup, imgs_dir)
                logging.info("Restored imgs directory from backup")
        except Exception as restore_err:
            logging.error(f"Failed to restore from backup: {restore_err}")
        
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description='Ascendara Local Refresh - Scrape game sources for game data'
    )
    parser.add_argument(
        '--output', '-o',
        required=True,
        help='Output directory for JSON data and images'
    )
    parser.add_argument(
        '--source', '-s',
        default='steamrip',
        choices=list(AVAILABLE_SCRAPERS.keys()),
        help='Source to scrape (default: steamrip)'
    )
    parser.add_argument(
        '--cookie', '-c',
        required=False,
        default=None,
        help='cf_clearance cookie value for Cloudflare bypass (optional - will auto-detect if needed)'
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
    parser.add_argument(
        '--user-agent', '-u',
        default=None,
        help='Custom User-Agent string (for Firefox/Opera cookie compatibility)'
    )
    parser.add_argument(
        '--extract-shared-index',
        action='store_true',
        help='Extract a downloaded shared index zip file'
    )
    parser.add_argument(
        '--zip-path',
        help='Path to the zip file to extract (used with --extract-shared-index)'
    )
    
    args = parser.parse_args()
    
    # Handle extraction mode
    if args.extract_shared_index:
        if not args.zip_path or not args.output:
            logging.error("--extract-shared-index requires both --zip-path and --output")
            sys.exit(1)
        extract_shared_index(args.zip_path, args.output)
        sys.exit(0)
    
    logging.info("=== Starting Ascendara Local Refresh ===")
    logging.info(f"Output directory: {args.output}")
    logging.info(f"Source: {args.source}")
    
    # Setup directories
    output_dir = args.output
    imgs_dir = os.path.join(output_dir, "imgs")
    games_file = os.path.join(output_dir, "ascendara_games.json")
    imgs_incoming_dir = os.path.join(output_dir, "imgs_incoming")
    games_incoming_file = os.path.join(output_dir, "ascendara_games_incoming.json")
    imgs_backup_dir = os.path.join(output_dir, "imgs_backup")
    games_backup_file = os.path.join(output_dir, "ascendara_games_backup.json")
    
    def cleanup_incoming():
        """Remove incomplete incoming data on failure"""
        try:
            if os.path.exists(imgs_incoming_dir):
                shutil.rmtree(imgs_incoming_dir)
            if os.path.exists(games_incoming_file):
                os.remove(games_incoming_file)
        except Exception as e:
            logging.warning(f"Failed to cleanup incoming: {e}")
    
    def restore_backup():
        """Restore from backup if swap was interrupted"""
        restored = False
        try:
            if os.path.exists(imgs_backup_dir):
                if os.path.exists(imgs_dir):
                    shutil.rmtree(imgs_dir)
                shutil.move(imgs_backup_dir, imgs_dir)
                logging.info("Restored imgs folder from backup")
                restored = True
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
        """Remove backup files after successful swap"""
        try:
            if os.path.exists(imgs_backup_dir):
                shutil.rmtree(imgs_backup_dir)
            if os.path.exists(games_backup_file):
                os.remove(games_backup_file)
        except Exception as e:
            logging.warning(f"Failed to cleanup backup: {e}")
    
    def swap_incoming_to_current():
        """Atomically swap incoming data to current location"""
        try:
            logging.info("Swapping incoming data to current...")
            
            if os.path.exists(imgs_dir):
                if os.path.exists(imgs_backup_dir):
                    shutil.rmtree(imgs_backup_dir)
                shutil.move(imgs_dir, imgs_backup_dir)
            
            if os.path.exists(games_file):
                if os.path.exists(games_backup_file):
                    os.remove(games_backup_file)
                shutil.copy2(games_file, games_backup_file)
            
            if os.path.exists(imgs_incoming_dir):
                shutil.move(imgs_incoming_dir, imgs_dir)
            
            if os.path.exists(games_incoming_file):
                if os.path.exists(games_file):
                    os.remove(games_file)
                shutil.move(games_incoming_file, games_file)
            
            cleanup_backup()
            logging.info("Swap completed successfully")
            return True
            
        except Exception as e:
            logging.error(f"Swap failed: {e}, attempting rollback...")
            restore_backup()
            return False
    
    refresh_completed_successfully = [False]
    
    def on_exit_cleanup():
        """Cleanup incoming data on unexpected exit if not completed successfully"""
        if not refresh_completed_successfully[0]:
            logging.info("Process exiting without successful completion, cleaning up incoming data...")
            cleanup_incoming()
    
    atexit.register(on_exit_cleanup)
    
    def signal_handler(signum, frame):
        logging.info(f"Received signal {signum}, cleaning up incoming data and exiting...")
        cleanup_incoming()
        sys.exit(1)
    
    signal.signal(signal.SIGTERM, signal_handler)
    if sys.platform != 'win32':
        signal.signal(signal.SIGINT, signal_handler)
    
    try:
        os.makedirs(output_dir, exist_ok=True)
        
        # Clean up old incoming/backup data
        if os.path.exists(imgs_incoming_dir):
            shutil.rmtree(imgs_incoming_dir)
        if os.path.exists(games_incoming_file):
            os.remove(games_incoming_file)
        if os.path.exists(imgs_backup_dir):
            shutil.rmtree(imgs_backup_dir)
        if os.path.exists(games_backup_file):
            os.remove(games_backup_file)
        
        os.makedirs(imgs_incoming_dir, exist_ok=True)
        logging.info("Created incoming directories")
    except Exception as e:
        logging.error(f"Failed to create directories: {e}")
        cleanup_incoming()
        launch_crash_reporter(1, str(e))
        sys.exit(1)
    
    # Initialize progress tracking
    progress = RefreshProgress(output_dir)
    progress.set_status("running")
    progress.set_phase("initializing")
    
    try:
        # Load blacklist IDs
        blacklist_ids = get_blacklist_ids()
        
        # Initialize the selected scraper
        ScraperClass = AVAILABLE_SCRAPERS[args.source]
        scraper = ScraperClass(output_dir, progress.progress_file)
        
        logging.info(f"Initializing {scraper.get_source_name()} scraper...")
        
        if not scraper.initialize(
            cookie=args.cookie,
            user_agent=args.user_agent,
            skip_views=args.skip_views,
            view_workers=args.view_workers
        ):
            logging.error("Failed to initialize scraper")
            progress.add_error("Failed to initialize scraper")
            progress.complete(success=False)
            cleanup_incoming()
            sys.exit(1)
        
        # Scrape games
        progress.set_phase("processing_posts")
        logging.info("Starting game scraping...")
        
        game_data = scraper.scrape_games(
            blacklist_ids=blacklist_ids,
            per_page=args.per_page,
            workers=args.workers,
            progress=progress
        )
        
        logging.info(f"Scraped {len(game_data)} games")
        
        # Build output
        progress.set_phase("saving")
        
        metadata = {
            "getDate": datetime.datetime.now().strftime("%B %d, %Y, %I:%M %p"),
            "local": True,
            "source": scraper.get_source_name().upper(),
            "listVersion": "1.0",
            "games": str(len(game_data))
        }
        
        output_data = {
            "metadata": metadata,
            "games": game_data
        }
        
        logging.info(f"Writing to incoming file: {games_incoming_file}...")
        with open(games_incoming_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        
        # Swap incoming data to current
        progress.set_phase("swapping")
        if not swap_incoming_to_current():
            logging.error("Failed to swap incoming data to current")
            progress.add_error("Failed to swap incoming data to current")
            progress.complete(success=False)
            cleanup_incoming()
            scraper.cleanup()
            sys.exit(1)
        
        # Cleanup scraper resources
        scraper.cleanup()
        
        progress.complete(success=True)
        logging.info(f"=== Done! Saved {len(game_data)} games ===")
        
        _launch_notification(
            "Index Refresh Complete",
            f"Successfully indexed {len(game_data)} games from {scraper.get_source_name()}"
        )
        
        refresh_completed_successfully[0] = True
        atexit.unregister(on_exit_cleanup)
        
        # Mark that user has successfully indexed
        try:
            timestamp_path = os.path.join(os.path.expanduser('~'), 'timestamp.ascendara.json')
            timestamp_data = {}
            if os.path.exists(timestamp_path):
                with open(timestamp_path, 'r', encoding='utf-8') as f:
                    timestamp_data = json.load(f)
            timestamp_data['hasIndexBefore'] = True
            with open(timestamp_path, 'w', encoding='utf-8') as f:
                json.dump(timestamp_data, f, indent=2)
        except Exception as e:
            logging.warning(f"Failed to update timestamp file: {e}")
        
    except KeyboardInterrupt:
        logging.info("Refresh cancelled by user")
        progress.add_error("Cancelled by user")
        progress.complete(success=False)
        atexit.unregister(on_exit_cleanup)
        cleanup_incoming()
        if 'scraper' in locals():
            scraper.cleanup()
        sys.exit(1)
        
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        progress.add_error(str(e))
        progress.complete(success=False)
        atexit.unregister(on_exit_cleanup)
        cleanup_incoming()
        if 'scraper' in locals():
            scraper.cleanup()
        launch_crash_reporter(1, str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
