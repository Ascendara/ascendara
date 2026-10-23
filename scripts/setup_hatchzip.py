#!/usr/bin/env python3
"""Build the pinned HatchZip CLI into the project's build cache.

The downloader uses it to extract ZIP and 7z archives in place, so a game
only needs free space for its files instead of its files plus the archive.
"""
import argparse
from pathlib import Path
import re
import shutil
import subprocess
import sys

VERSION = '0.1.2'
# The v0.1.2 tag's commit, so a moved tag cannot change what is built.
COMMIT = '2b754c85b9322da64186e5e199ed22b1e45a5cce'
REPOSITORY = 'https://github.com/xevrion/hatchzip.git'
CACHE = Path(__file__).resolve().parents[1] / '.build-tools/hatchzip'
LICENSES = ('LICENSE-MIT', 'LICENSE-APACHE')


def tool_dir(target=None):
    return CACHE / (target or 'host')


def binary_path(target=None):
    windows = 'windows' in target if target else sys.platform == 'win32'
    return tool_dir(target) / ('hatchzip.exe' if windows else 'hatchzip')


def run(args, cwd=None):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def checkout():
    source = CACHE / 'src'
    if not (source / '.git').is_dir():
        source.mkdir(parents=True, exist_ok=True)
        run(['git', 'init', '--quiet'], source)
    run(['git', 'fetch', '--quiet', '--depth', '1', REPOSITORY, COMMIT], source)
    run(['git', 'checkout', '--quiet', '--force', COMMIT], source)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
    if head != COMMIT:
        raise RuntimeError(f'HatchZip checkout is at {head}, expected {COMMIT}')
    return source


def cargo_command(source, target):
    rustup = shutil.which('rustup')
    if not rustup:
        if not shutil.which('cargo'):
            raise RuntimeError('Missing dependency: cargo. Install Rust with rustup')
        return ['cargo']
    # Build with the compiler HatchZip pins rather than whatever is default.
    channel = re.search(r'^channel\s*=\s*"([^"]+)"', (source / 'rust-toolchain.toml').read_text(), re.M)[1]
    run([rustup, 'toolchain', 'install', channel, '--profile', 'minimal', '--no-self-update'])
    if target:
        run([rustup, 'target', 'add', '--toolchain', channel, target])
    return [rustup, 'run', channel, 'cargo']


def build(target=None):
    """Return the HatchZip binary for `target` (default: this machine), building it if needed."""
    output = binary_path(target)
    stamp = tool_dir(target) / 'COMMIT'
    if output.is_file() and stamp.is_file() and stamp.read_text().strip() == COMMIT:
        return output
    source = checkout()
    command = cargo_command(source, target) + ['build', '--release', '--locked', '-p', 'hatchzip',
                                               '--target-dir', CACHE / 'target']
    if target:
        command += ['--target', target]
    run(command, source)
    built = CACHE / 'target' / (target or '') / 'release' / output.name
    tool_dir(target).mkdir(parents=True, exist_ok=True)
    shutil.copy2(built, output)
    for name in LICENSES:
        shutil.copy2(source / name, tool_dir(target) / name)
    stamp.write_text(COMMIT + '\n')
    print(f'Built HatchZip {VERSION}: {output}')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', help='Rust target triple to cross-compile for')
    build(parser.parse_args().target)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f'HatchZip setup failed: {error}', file=sys.stderr)
        sys.exit(1)
