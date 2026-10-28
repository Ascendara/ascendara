# Building Ascendara for Linux

This guide explains how to build the Linux package of Ascendara with [Electrobun](https://electrobun.dev).

## Prerequisites

- Node.js (v16 or higher)
- Yarn package manager
- Python 3
- Linux x64 (Electrobun packages for the machine it runs on)

## Quick Build

To build the Linux package, simply run:

```bash
yarn dist-linux
```

This will:

1. ✅ Check dependencies (yarn, python3)
2. ✅ Build the AscendaraAchievementWatcher Node.js binary for Linux
3. ✅ Copy all Linux Python scripts to debian directories
4. ✅ Build the React application with environment variables
5. ✅ Package everything with Electrobun (bundling Chromium/CEF, since GTK WebKit cannot layer webviews reliably)

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

### Electrobun Package

- Self-extracting `*Setup*.tar.gz` installer
- `stable-linux-x64-Ascendara.tar.zst` and `stable-linux-x64-update.json` for in-app updates

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

### 5. Package

```bash
node scripts/electrobun/stage-app.cjs --env=stable
npx --yes electrobun@2.0.5 build --env=stable
```

## Output Files

The build will create one or more of the following:

- `.electrobun/artifacts/*Setup*.tar.gz` - Self-extracting installer
- `.electrobun/artifacts/stable-linux-x64-Ascendara.tar.zst` - Update bundle
- `.electrobun/artifacts/stable-linux-x64-update.json` - Update manifest
- `.electrobun/build/stable-linux-x64/` - Built application

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
   rm -rf build dist .electrobun electron/assets electron/index.html
   yarn dist-linux
   ```

2. Check that all binaries are properly built:
   ```bash
   ls -la binaries/*/dist/
   ```

## Environment Variables

Make sure your `.env` file contains all necessary environment variables:

- Firebase configuration (VITE*FIREBASE*\*)
- API keys (REACT*APP*\*)
- Other application secrets

## Notes

- The Linux build includes Python scripts for all Ascendara binaries except AscendaraAchievementWatcher
- AscendaraAchievementWatcher is built as a standalone Node.js binary using `pkg`
- The build process automatically handles asset path corrections for the bundled UI
