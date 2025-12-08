# This script is used to easily and quickly build Ascendara from source to EXE

import os
import subprocess
import shutil
import re

def run_yarn_build():
    print("Running yarn build...")
    try:
        yarn_cmd = 'yarn.cmd' if os.name == 'nt' else 'yarn'
        subprocess.run([yarn_cmd, 'build'], check=True, cwd=os.getcwd())
        print("Build completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Build failed with error: {e}")
        return False

def run_electron_builder():
    print("Running electron-builder...")
    try:
        yarn_cmd = 'yarn.cmd' if os.name == 'nt' else 'yarn'
        # Use electron-builder directly with the correct configuration
        subprocess.run([yarn_cmd, 'electron-builder', '--config.extraMetadata.main=electron/app.js'], check=True, cwd=os.getcwd())
        print("Electron build completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Electron build failed with error: {e}")
        return False

def move_files():
    print("Moving files to build directory...")
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
        if not os.path.exists(electron_assets_dir):
            os.makedirs(electron_assets_dir, exist_ok=True)
            
        # Copy all files from assets directory
        for item in os.listdir(assets_dir):
            src_path = os.path.join(assets_dir, item)
            dst_path = os.path.join(electron_assets_dir, item)
            if os.path.isdir(src_path):
                shutil.copytree(src_path, dst_path, dirs_exist_ok=True)
                print(f"Copied directory {item} to electron/assets")
            else:
                shutil.copy(src_path, dst_path)
                print(f"Copied file {item} to electron/assets")

        # Guide directory if it exists
        guide_dir = 'build/guide'
        if os.path.exists(guide_dir):
            electron_guide_dir = os.path.join('electron', 'guide')
            os.makedirs(electron_guide_dir, exist_ok=True)
            for item in os.listdir(guide_dir):
                src_path = os.path.join(guide_dir, item)
                dst_path = os.path.join(electron_guide_dir, item)
                if os.path.isdir(src_path):
                    shutil.copytree(src_path, dst_path, dirs_exist_ok=True)
                else:
                    shutil.copy(src_path, dst_path)
            print("Copied guide directory to electron")

        # Copy other assets if they exist
        image_files = ['icon.png', 'no-image.png']
        for image in image_files:
            src_path = os.path.join('build', image)
            if os.path.exists(src_path):
                dst_path = os.path.join('electron', image)
                shutil.copy(src_path, dst_path)
                print(f"Copied {image} to electron directory")
            else:
                print(f"Warning: {image} not found in build/")
            
        print("Files moved successfully")
        return True
    except Exception as e:
        print(f"Failed to move files: {e}")
        return False

def cleanup_build_artifacts():
    """Clean up all build artifacts before starting a new build."""
    print("Cleaning up previous build artifacts...")
    
    # Directories to clean
    cleanup_dirs = ['build', 'dist']
    
    # Files to clean from electron directory
    electron_dir = 'electron'
    
    for dir_path in cleanup_dirs:
        if os.path.exists(dir_path):
            try:
                shutil.rmtree(dir_path)
                print(f"Removed existing {dir_path} directory")
            except Exception as e:
                print(f"Warning: Could not remove {dir_path} directory: {e}")
    
    # Clean up asset files from electron directory
    if os.path.exists(electron_dir):
        try:
            # Remove all files except .js files and directories
            for item in os.listdir(electron_dir):
                item_path = os.path.join(electron_dir, item)
                # Keep .js files, the guide directory, services directory, and modules directory
                if item.endswith('.js') or (os.path.isdir(item_path) and item in ('guide', 'services', 'modules')):
                    continue
                
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path)
                    print(f"Removed directory {item_path}")
                else:
                    os.remove(item_path)
                    print(f"Removed file {item_path}")
        except Exception as e:
            print(f"Warning: Error cleaning electron directory: {e}")
    
    # Clean up guide directory if it exists
    guide_dir = os.path.join(electron_dir, 'guide')
    if os.path.exists(guide_dir):
        try:
            shutil.rmtree(guide_dir)
            print(f"Removed guide directory")
            # Recreate the empty directory
            os.makedirs(guide_dir, exist_ok=True)
        except Exception as e:
            print(f"Warning: Could not clean guide directory: {e}")
    
    return True

def cleanup_after_build():
    """Clean up temporary files after the build is complete."""
    print("Cleaning up after build...")
    
    # Step 1: Remove build directory
    if os.path.exists('build'):
        try:
            shutil.rmtree('build')
            print("Removed build directory")
        except Exception as e:
            print(f"Warning: Could not remove build directory: {e}")
    
    # Step 2: Clean up unnecessary files in electron directory
    # We need to keep essential files but remove temporary build artifacts
    electron_dir = 'electron'
    if os.path.exists(electron_dir):
        try:
            # Remove index.html file
            index_path = os.path.join(electron_dir, 'index.html')
            if os.path.exists(index_path):
                os.remove(index_path)
                print("Removed index.html")
            
            # Remove index-*.css, index-*.js, and index-*.js.map files
            for item in os.listdir(electron_dir):
                if item.startswith('index-') and (item.endswith('.css') or item.endswith('.js') or item.endswith('.js.map')):
                    os.remove(os.path.join(electron_dir, item))
                    print(f"Removed {item}")
            
            # Clean up guide directory if it exists
            guide_dir = os.path.join(electron_dir, 'guide')
            if os.path.exists(guide_dir):
                shutil.rmtree(guide_dir)
                print("Removed electron/guide directory")
                
            # Clean up assets directory but keep essential files
            assets_dir = os.path.join(electron_dir, 'assets')
            if os.path.exists(assets_dir):
                shutil.rmtree(assets_dir)
                print("Removed electron/assets directory")
            
            # Do NOT remove the services or modules directories
            # If you want to clean up inside services, add logic here, but do not delete the folder
            services_dir = os.path.join(electron_dir, 'services')
            if os.path.exists(services_dir):
                print("Preserved electron/services directory")
            
            modules_dir = os.path.join(electron_dir, 'modules')
            if os.path.exists(modules_dir):
                print("Preserved electron/modules directory")
            
            # Remove other temporary files
            temp_files = ['icon.png', 'no-image.png']
            for temp_file in temp_files:
                temp_path = os.path.join(electron_dir, temp_file)
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    print(f"Removed {temp_file}")
                    
        except Exception as e:
            print(f"Warning: Error cleaning up electron directory: {e}")
    
    print("Cleanup complete")
    return True

def modify_index_html():
    print("Modifying index.html...")
    index_path = 'build/index.html'
    
    try:
        if not os.path.exists(index_path):
            print(f"Error: {index_path} does not exist")
            return False
            
        with open(index_path, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Replace absolute paths with relative paths
        modified_content = content.replace('"/assets/', '"assets/')
        
        with open(index_path, 'w', encoding='utf-8') as file:
            file.write(modified_content)
        print("index.html modified successfully")
        return True
    except Exception as e:
        print(f"Failed to modify index.html: {e}")
        return False

def build_react_app():
    return run_yarn_build()

def package_electron_app():
    return run_electron_builder()

def main():
    print("Starting Ascendara build process...")
    
    # Step 1: Clean up existing build artifacts
    if not cleanup_build_artifacts():
        print("Failed to clean up build artifacts. Exiting.")
        return 1
    
    # Step 2: Build the React app
    if not build_react_app():
        print("Failed to build React app. Exiting.")
        return 1
    
    # Step 3: Modify index.html to fix asset paths
    if not modify_index_html():
        print("Failed to modify index.html. Exiting.")
        return 1
    
    # Step 4: Move necessary files to electron directory
    if not move_files():
        print("Failed to move files. Exiting.")
        return 1
    
    # Step 5: Package the Electron app
    if not package_electron_app():
        print("Failed to package Electron app. Exiting.")
        return 1
    
    # Step 6: Clean up temporary files after build
    if not cleanup_after_build():
        print("Failed to clean up after build. Exiting.")
        return 1
    
    print("Build process completed successfully!")
    return 0

if __name__ == "__main__":
    main()
