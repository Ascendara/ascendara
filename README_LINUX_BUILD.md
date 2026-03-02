# Building Ascendara for Linux (AppImage)

This guide explains how to build Ascendara as an AppImage for Linux distribution.

## Prerequisites

- Node.js (v16 or higher)
- Yarn package manager
- Python 3
- Linux operating system (for building AppImage)

## Quick Build

To build the Linux AppImage, simply run:

```bash
yarn dist-linux
```

This will:

1. ✅ Check dependencies (yarn, python3)
2. ✅ Build the AscendaraAchievementWatcher Node.js binary for Linux
3. ✅ Copy all Linux Python scripts to debian directories
4. ✅ Build the React application with environment variables
5. ✅ Package everything into an AppImage

## What Gets Built

The build process creates several Linux-specific components:

### AscendaraAchievementWatcher

- Node.js application packaged as a standalone Linux binary
- Uses `pkg` to create a self-contained executable
- No Node.js runtime required on target system

### Linux Python Scripts

- All Ascendara helper binaries as Python scripts
- Copied to debian directories for Linux compatibility
- Includes: Downloader, GameHandler, CrashReporter, etc.

### AppImage Package

- Self-contained Linux application
- Works on most Linux distributions
- No installation required - just make executable and run

## Manual Build Steps

If you prefer to run the build steps manually:

### 1. Install Dependencies

```bash
# Install main project dependencies
yarn install

# Install AscendaraAchievementWatcher dependencies
cd binaries/AscendaraAchievementWatcher
yarn install
cd ../..
```

### 2. Build AscendaraAchievementWatcher for Linux

```bash
cd binaries/AscendaraAchievementWatcher
yarn build-linux
cd ../..
```

### 3. Copy Linux Scripts

```bash
python3 scripts/copy_debian_scripts.py
```

### 4. Build React App

```bash
yarn build
```

### 5. Build AppImage

```bash
yarn electron-builder --linux --config.extraMetadata.main=electron/app.js
```

## Output Files

The build will create one or more of the following:

- `dist/Ascendara-x.x.x.AppImage` - Main AppImage file
- `dist/linux-unpacked/` - Unpacked Linux application (fallback)
- `dist/Ascendara-x.x.x-linux-x64.tar.gz` - Compressed archive (fallback)

## Troubleshooting

### Missing Dependencies

If you encounter missing dependency errors:

```bash
# Check Node.js version
node --version

# Check Yarn version
yarn --version

# Check Python version
python3 --version
```

### Build Failures

1. Clean the build artifacts and try again:

   ```bash
   rm -rf build dist electron/assets electron/index.html
   yarn dist-linux
   ```

2. Check that all binaries are properly built:
   ```bash
   ls -la binaries/*/dist/
   ```

### Low Disk Space

The build script includes automatic fallbacks:

- If AppImage creation fails due to disk space, it creates an unpacked version
- If unpacked build succeeds, it also creates a tar.gz archive
- Both alternatives work as Linux distributions

### AppImage Not Working

1. Make the AppImage executable:

   ```bash
   chmod +x dist/Ascendara-*.AppImage
   ```

2. Run the AppImage:
   ```bash
   ./dist/Ascendara-*.AppImage
   ```

## Environment Variables

Make sure your `.env` file contains all necessary environment variables:

- Firebase configuration (VITE*FIREBASE*\*)
- API keys (REACT*APP*\*)
- Other application secrets

## Notes

- The Linux build includes Python scripts for all Ascendara binaries except AscendaraAchievementWatcher
- AscendaraAchievementWatcher is built as a standalone Node.js binary using `pkg`
- The AppImage is self-contained and should work on most Linux distributions
- The build process automatically handles asset path corrections for the Electron app
- Fallback mechanisms ensure you get a working Linux build even with limited disk space
