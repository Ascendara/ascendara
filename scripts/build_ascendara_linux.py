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

def build_python_binaries_linux():
    """Use PyInstaller to compile each Python binary into a standalone ELF executable.
    Uses a dedicated build venv to avoid PEP 668 externally-managed-environment errors."""
    print("Building Python binaries for Linux with PyInstaller...")

    binaries_dir = os.path.join(os.getcwd(), 'binaries')

    # Create a dedicated build venv so we don't touch the system Python
    venv_dir = os.path.join(os.getcwd(), '.build_venv')
    venv_python = os.path.join(venv_dir, 'bin', 'python3')
    venv_pip = os.path.join(venv_dir, 'bin', 'pip')

    if not os.path.exists(venv_python):
        print("Creating build venv...")
        if not run_command(['python3', '-m', 'venv', venv_dir]):
            print("Failed to create build venv")
            return False

    # Install PyInstaller into the build venv
    print("Installing PyInstaller into build venv...")
    if not run_command([venv_pip, 'install', '--quiet', 'pyinstaller']):
        print("Failed to install PyInstaller")
        return False

    # Install all binary requirements into the build venv so PyInstaller bundles them
    print("Installing binary dependencies into build venv...")
    for binary_name in sorted(os.listdir(binaries_dir)):
        req_file = os.path.join(binaries_dir, binary_name, 'requirements.txt')
        if os.path.exists(req_file):
            print(f"  Installing requirements for {binary_name}...")
            if not run_command([venv_pip, 'install', '--quiet', '-r', req_file]):
                print(f"Warning: Failed to install requirements for {binary_name}, continuing...")

    # Map: (output name, script path relative to binaries_dir, extra PyInstaller args)
    binaries = [
        ('AscendaraDownloader',         'AscendaraDownloader/src/AscendaraDownloader.py',         []),
        ('AscendaraGofileHelper',        'AscendaraDownloader/src/AscendaraGofileHelper.py',        []),
        ('AscendaraGameHandler',         'AscendaraGameHandler/src/AscendaraGameHandler.py',        []),
        ('AscendaraLanguageTranslation', 'AscendaraLanguageTranslation/src/AscendaraLanguageTranslation.py', []),
        ('AscendaraLocalRefresh',        'AscendaraLocalRefresh/src/AscendaraLocalRefresh.py',      []),
        ('AscendaraTorrentHandler',      'AscendaraTorrentHandler/src/AscendaraTorrentHandler.py',  []),
        ('AscendaraNotificationHelper',  'AscendaraNotificationHelper/src/AscendaraNotificationHelper.py', ['--windowed']),
    ]

    for binary_name, rel_script, extra_args in binaries:
        script_path = os.path.join(binaries_dir, rel_script)
        if not os.path.exists(script_path):
            print(f"Warning: Script not found, skipping: {script_path}")
            continue

        dist_dir = os.path.join(binaries_dir, rel_script.split('/')[0], 'dist')
        os.makedirs(dist_dir, exist_ok=True)

        cmd = [
            venv_python, '-m', 'PyInstaller',
            '--onefile',
            '--noconfirm',
            '--name', binary_name,
            '--distpath', dist_dir,
            '--workpath', os.path.join(dist_dir, 'build_tmp'),
            '--specpath', os.path.join(dist_dir, 'spec_tmp'),
        ] + extra_args + [script_path]

        print(f"Compiling {binary_name}...")
        if not run_command(cmd):
            print(f"Failed to compile {binary_name}")
            return False

        # Clean up PyInstaller temp dirs
        for tmp in ['build_tmp', 'spec_tmp']:
            tmp_path = os.path.join(dist_dir, tmp)
            if os.path.exists(tmp_path):
                shutil.rmtree(tmp_path)

        print(f"  -> {os.path.join(dist_dir, binary_name)}")

    # Remove the build venv — it's only needed during compilation
    print("Cleaning up build venv...")
    shutil.rmtree(venv_dir, ignore_errors=True)

    print("All Python binaries compiled successfully")
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

        # Copy icon.png for Linux window/tray icon
        icon_src = os.path.join('readme', 'logo', 'png', 'ascendara_512x.png')
        if os.path.exists(icon_src):
            shutil.copy(icon_src, os.path.join('electron', 'icon.png'))
            print("Copied icon.png to electron directory")
        else:
            print("Warning: ascendara_512x.png not found, skipping icon copy")

        return True
    except Exception as e:
        print(f"Failed to move files: {e}")
        return False

def generate_build_signature():
    print("Generating build signature...")
    try:
        subprocess.run(['node', 'scripts/generate_build_signature.js'], check=True, cwd=os.getcwd())
        print("Build signature generated successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Build signature generation failed with error: {e}")
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
    temp_files = ['electron/index.html', 'electron/assets', 'electron/icon.png']
    
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

    # Step 4: Compile Python binaries to standalone ELF executables
    if not build_python_binaries_linux():
        print("Failed to build Python binaries. Exiting.")
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
    
    # Step 8: Generate build signature
    if not generate_build_signature():
        print("Failed to generate build signature. Exiting.")
        return 1
    
    # Step 9: Try to build the AppImage, fallback to unpacked if it fails
    if not build_appimage():
        print("AppImage build failed, trying unpacked build...")
        if not build_linux_unpacked():
            print("Failed to build Linux unpacked version. Exiting.")
            return 1
        
        # Create tar.gz archive as alternative
        if not create_tar_archive():
            print("Failed to create tar.gz archive, but unpacked version is available.")
    
    # Step 10: Clean up temporary files after build
    if not cleanup_after_build():
        print("Failed to clean up after build. Exiting.")
        return 1
    
    # Step 11: Register build with backend API
    print("\n" + "="*60)
    print("Registering build with backend API...")
    print("="*60)
    try:
        register_script = os.path.join('scripts', 'register_build.py')
        subprocess.run(['python3', register_script], check=True, cwd=os.getcwd())
        print("Build registration completed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"Warning: Build registration failed with error: {e}")
        print("You may need to register this build manually.")
        print("The build is complete but will not work until registered.")
    except FileNotFoundError:
        print("Warning: register_build.py not found, skipping automatic registration.")
        print("You will need to register this build manually.")
    
    print("\n" + "="*60)
    print("Linux build process completed successfully!")
    print("="*60)
    
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
