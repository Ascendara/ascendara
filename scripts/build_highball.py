#!/usr/bin/env python3
"""Build the pinned Highball CLI and stage it with its engine manifest and notices.

Highball (GPL-3.0, https://github.com/gauthierpiarrette/highball) runs Windows games on
Apple Silicon through Wine and the DXMT, D3DMetal and DXVK renderers. Ascendara ships its
CLI as a separate program; engines are downloaded at runtime and are never bundled.
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys

VERSION = 'v0.10.22'
# The tag's commit, recorded when upgrading the pinned release.
COMMIT = 'daa2095b9fd4abad0b9db7c57cacbd4d49a9e06e'
REPOSITORY = 'https://github.com/gauthierpiarrette/highball'
ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / '.build-tools/macos/highball' / VERSION
DEV_OUTPUT = ROOT / 'binaries/Highball/dist'
# Compatibility data from highball-db, bundled as the offline fallback for runtime lookups
COMPAT_DATA_URL = 'https://gethighball.com/data'
COMPAT_LISTS = ('games', 'predictions')
STAGED_FILES = ('highball', 'engine-manifest.json', 'd3dmetal-license.txt', 'LICENSE', 'SOURCE.txt',
                *(f'compat-{name}.json' for name in COMPAT_LISTS))


def run(args, cwd=ROOT):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def preflight():
    errors = []
    if sys.platform != 'darwin':
        errors.append('Highball builds on macOS only.')
    for command in ('git', 'swift', 'lipo', 'curl'):
        if not shutil.which(command):
            errors.append(f'Missing Highball build dependency: {command} (install Xcode command line tools)')
    return errors


def checkout():
    if not (SOURCE_DIR / '.git').is_dir():
        if SOURCE_DIR.exists():
            shutil.rmtree(SOURCE_DIR)
        SOURCE_DIR.parent.mkdir(parents=True, exist_ok=True)
        run(['git', 'clone', '--quiet', '--depth', '1', '--branch', VERSION, REPOSITORY, SOURCE_DIR])
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=SOURCE_DIR, text=True).strip()
    if head != COMMIT:
        raise RuntimeError(f'Highball {VERSION} resolved to {head}, expected {COMMIT}; refusing to build.')


def build(output):
    """Build the arm64 CLI and copy it, the default engine manifest and notices into output."""
    checkout()
    run(['swift', 'build', '-c', 'release', '--product', 'highball', '--arch', 'arm64'], cwd=SOURCE_DIR)
    binary = SOURCE_DIR / '.build/arm64-apple-macosx/release/highball'
    if not binary.is_file():
        binary = SOURCE_DIR / '.build/release/highball'
    run(['lipo', binary, '-verify_arch', 'arm64'])
    output = Path(output)
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    shutil.copy2(binary, output / 'highball')
    (output / 'highball').chmod(0o755)
    shutil.copy2(SOURCE_DIR / 'spike/engine-manifest.json', output / 'engine-manifest.json')
    shutil.copy2(SOURCE_DIR / 'spike/d3dmetal-license.txt', output / 'd3dmetal-license.txt')
    shutil.copy2(SOURCE_DIR / 'LICENSE', output / 'LICENSE')
    for name in COMPAT_LISTS:
        run(['curl', '-fsSL', '--max-time', '120', '-o', output / f'compat-{name}.json',
             f'{COMPAT_DATA_URL}/{name}.json'])
    (output / 'SOURCE.txt').write_text(
        f'Highball {VERSION} ({COMMIT})\n'
        f'Licensed under the GNU General Public License v3.0; see LICENSE.\n'
        f'Corresponding source: {REPOSITORY}/tree/{COMMIT}\n'
        f'\ncompat-games.json: curated highball-db entries, CC0-1.0.\n'
        f'compat-predictions.json: ODbL-1.0, derived from ProtonDB community reports\n'
        f'(https://github.com/bdefore/protondb-data) and AreWeAntiCheatYet (MIT).\n'
        f'Source: https://github.com/gauthierpiarrette/highball-db\n')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=DEV_OUTPUT, help='Directory to stage the CLI into')
    args = parser.parse_args()
    errors = preflight()
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print(f'Highball {VERSION} staged in {build(args.output)}')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (subprocess.CalledProcessError, OSError, RuntimeError) as error:
        print(f'Highball build failed: {error}', file=sys.stderr)
        sys.exit(1)
