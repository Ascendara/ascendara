#!/usr/bin/env python3
# This script is used to build Ascendara for Linux distribution as AppImage

import os
import subprocess
import shutil
import sys
import json

def run_command(command, cwd=None):
    """Run a command and return success status"""
    try:
        if cwd is None:
            cwd = os.getcwd()
        print(f"Running: {' '.join(command) if isinstance(command, list) else command}")
        result = subprocess.run(command, check=True, cwd=cwd, shell=isinstance(command, str))
        return True
    except subprocess.CalledProcessError as e:
        print(f"Command failed with error: {e}")
        return False

def check_dependencies():
    """Check if required dependencies are installed"""
    print("Checking dependencies...")
    
    # Check if yarn is installed
    if not shutil.which('yarn'):
        print("Error: yarn is not installed. Please install yarn first.")
        return False
    
    # Check if python3 is installed
    if not shutil.which('python3'):
        print("Error: python3 is not installed.")
        return False
    
    print("All dependencies are available.")
    return True

def build_achievement_watcher():
    """Build the AscendaraAchievementWatcher for Linux"""
    print("Building AscendaraAchievementWatcher...")
    
    achievement_watcher_dir = os.path.join('binaries', 'AscendaraAchievementWatcher')
    if not os.path.exists(achievement_watcher_dir):
        print("Warning: AscendaraAchievementWatcher directory not found, skipping...")
        return True
    
    # Check if package.json exists, if not create it
    package_json_path = os.path.join(achievement_watcher_dir, 'package.json')
    if not os.path.exists(package_json_path):
        print("Creating package.json for AscendaraAchievementWatcher...")
        package_json_content = """{
  "name": "ascendara-achievement-watcher",
  "version": "1.0.0",
  "description": "Achievement watcher for Ascendara",
  "main": "src/monitor.js",
  "scripts": {
    "start": "node src/monitor.js",
    "build-linux": "pkg src/monitor.js --target node18-linux-x64 --output dist/AscendaraAchievementWatcher",
    "build-win": "pkg src/monitor.js --target node18-win-x64 --output dist/AscendaraAchievementWatcher.exe",
    "build-mac": "pkg src/monitor.js --target node18-macos-x64 --output dist/AscendaraAchievementWatcher"
  },
  "dependencies": {
    "find-up": "^4.1.0",
    "ini": "^4.1.1",
    "single-instance": "^0.0.1",
    "node-watch": "^0.7.4",
    "moment": "^2.29.1"
  },
  "devDependencies": {
    "pkg": "^5.8.1"
  },
  "pkg": {
    "assets": [
      "src/**/*"
    ],
    "outputPath": "dist"
  },
  "author": "tagoWorks",
  "license": "CC-BY-NC-1.0"
}"""
        with open(package_json_path, 'w') as f:
            f.write(package_json_content)
    
    # Create dist directory
    dist_dir = os.path.join(achievement_watcher_dir, 'dist')
    if not os.path.exists(dist_dir):
        os.makedirs(dist_dir)
    
    # Install dependencies
    if not run_command(['yarn', 'install'], cwd=achievement_watcher_dir):
        print("Failed to install AscendaraAchievementWatcher dependencies")
        return False
    
    # Build for Linux
    if not run_command(['yarn', 'build-linux'], cwd=achievement_watcher_dir):
        print("Failed to build AscendaraAchievementWatcher for Linux")
        return False
    
    print("AscendaraAchievementWatcher built successfully")
    return True

def copy_linux_binaries():
    """Copy Linux Python scripts to debian directories"""
    print("Copying Linux binaries...")
    
    # Run the existing copy_debian_scripts.py
    copy_script_path = os.path.join('scripts', 'copy_debian_scripts.py')
    if os.path.exists(copy_script_path):
        if not run_command(['python3', copy_script_path]):
            print("Failed to copy debian scripts")
            return False
    else:
        print("Warning: copy_debian_scripts.py not found, skipping...")
    
    return True

def build_react_app():
    """Build the React application"""
    print("Building React application...")
    return run_command(['yarn', 'build'])

def modify_index_html():
    """Modify index.html to fix asset paths"""
    print("Modifying index.html...")
    
    index_path = 'build/index.html'
    if not os.path.exists(index_path):
        print("Error: index.html not found in build directory")
        return False
    
    try:
        with open(index_path, 'r') as file:
            content = file.read()
        
        # Replace absolute paths with relative paths
        content = content.replace('/assets/', './assets/')
        content = content.replace('href="/', 'href="./')
        content = content.replace('src="/', 'src="./')
        
        with open(index_path, 'w') as file:
            file.write(content)
        
        print("index.html modified successfully")
        return True
    except Exception as e:
        print(f"Failed to modify index.html: {e}")
        return False

def move_files():
    """Move necessary files to electron directory"""
    print("Moving files to electron directory...")
    
    try:
        # Copy the index.html file to electron directory
        index_path = 'build/index.html'
        if os.path.exists(index_path):
            shutil.copy(index_path, os.path.join('electron', 'index.html'))
            print("Copied index.html to electron directory")
        else:
            print("Error: index.html not found in build directory")
            return False
            
        # Copy the entire assets directory to electron directory
        assets_dir = 'build/assets'
        if not os.path.exists(assets_dir):
            print("Error: build/assets directory not found")
            return False
            
        # Create assets directory in electron if it doesn't exist
        electron_assets_dir = os.path.join('electron', 'assets')
        if os.path.exists(electron_assets_dir):
            shutil.rmtree(electron_assets_dir)
        
        shutil.copytree(assets_dir, electron_assets_dir)
        print("Copied assets directory to electron directory")
        
        return True
    except Exception as e:
        print(f"Failed to move files: {e}")
        return False

def build_appimage():
    """Build the AppImage using electron-builder"""
    print("Building AppImage...")
    
    # Build specifically for Linux AppImage
    command = [
        'yarn', 'electron-builder', 
        '--linux', 
        '--config.extraMetadata.main=electron/app.js'
    ]
    
    return run_command(command)

def build_linux_unpacked():
    """Build Linux unpacked version (fallback for low disk space)"""
    print("Building Linux unpacked version...")
    
    command = [
        'yarn', 'electron-builder', 
        '--linux', 
        '--dir',
        '--config.extraMetadata.main=electron/app.js'
    ]
    
    return run_command(command)

def cleanup_build_artifacts():
    """Clean up build artifacts before starting"""
    print("Cleaning up build artifacts...")
    
    directories_to_clean = ['build', 'dist', 'electron/assets']
    files_to_clean = ['electron/index.html']
    
    for directory in directories_to_clean:
        if os.path.exists(directory):
            shutil.rmtree(directory)
            print(f"Removed directory: {directory}")
    
    for file_path in files_to_clean:
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"Removed file: {file_path}")
    
    return True

def cleanup_after_build():
    """Clean up temporary files after build"""
    print("Cleaning up temporary files...")
    
    # Remove temporary files from electron directory
    temp_files = ['electron/index.html', 'electron/assets']
    
    for temp_file in temp_files:
        if os.path.exists(temp_file):
            if os.path.isdir(temp_file):
                shutil.rmtree(temp_file)
            else:
                os.remove(temp_file)
            print(f"Cleaned up: {temp_file}")
    
    return True

def create_tar_archive():
    """Create a tar.gz archive as fallback"""
    print("Creating tar.gz archive...")
    
    unpacked_dir = 'dist/linux-unpacked'
    if not os.path.exists(unpacked_dir):
        print("Error: linux-unpacked directory not found")
        return False
    
    version = get_app_version() or 'unknown'
    archive_name = f'dist/Ascendara-{version}-linux-x64.tar.gz'
    
    try:
        import tarfile
        with tarfile.open(archive_name, 'w:gz') as tar:
            tar.add(unpacked_dir, arcname='Ascendara')
        print(f"Created archive: {archive_name}")
        return True
    except Exception as e:
        print(f"Failed to create archive: {e}")
        return False

def get_app_version():
    """Read app version from package.json"""
    try:
        with open('package.json', 'r') as f:
            pkg = json.load(f)
        return pkg['version']
    except Exception as e:
        print(f"Warning: Could not read version from package.json: {e}")
        return None


def main():
    """Main build process for Linux AppImage"""
    print("Starting Ascendara Linux AppImage build process...")
    
    # Check if we're on Linux
    if os.name != 'posix':
        print("Warning: This script is designed for Linux. Proceeding anyway...")
    
    # Step 1: Check dependencies
    if not check_dependencies():
        print("Dependency check failed. Exiting.")
        return 1
    
    # Step 2: Clean up existing build artifacts
    if not cleanup_build_artifacts():
        print("Failed to clean up build artifacts. Exiting.")
        return 1
    
    # Step 3: Build AscendaraAchievementWatcher for Linux
    if not build_achievement_watcher():
        print("Failed to build AscendaraAchievementWatcher. Exiting.")
        return 1
    
    # Step 4: Copy Linux binaries
    if not copy_linux_binaries():
        print("Failed to copy Linux binaries. Exiting.")
        return 1
    
    # Step 5: Build the React app
    if not build_react_app():
        print("Failed to build React app. Exiting.")
        return 1
    
    # Step 6: Modify index.html to fix asset paths
    if not modify_index_html():
        print("Failed to modify index.html. Exiting.")
        return 1
    
    # Step 7: Move necessary files to electron directory
    if not move_files():
        print("Failed to move files. Exiting.")
        return 1
    
    # Step 8: Try to build the AppImage, fallback to unpacked if it fails
    if not build_appimage():
        print("AppImage build failed, trying unpacked build...")
        if not build_linux_unpacked():
            print("Failed to build Linux unpacked version. Exiting.")
            return 1
        
        # Create tar.gz archive as alternative
        if not create_tar_archive():
            print("Failed to create tar.gz archive, but unpacked version is available.")
    
    # Step 9: Clean up temporary files after build
    if not cleanup_after_build():
        print("Failed to clean up after build. Exiting.")
        return 1
    
    print("Linux build process completed successfully!")
    
    # Check what was created
    version = get_app_version() or 'unknown'
    appimage_path = f'dist/Ascendara-{version}.AppImage'
    tar_path = f'dist/Ascendara-{version}-linux-x64.tar.gz'
    if os.path.exists(appimage_path):
        print(f"✅ AppImage created: {appimage_path}")
    elif os.path.exists('dist/linux-unpacked'):
        print("✅ Linux unpacked version created: dist/linux-unpacked/")
        if os.path.exists(tar_path):
            print(f"✅ Tar archive created: {tar_path}")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
