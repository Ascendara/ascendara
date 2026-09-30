#!/usr/bin/env python3
"""Install the pinned official Mac 7-Zip binary into the project's build cache."""
import argparse
import hashlib
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

VERSION = '26.03'
URL = 'https://github.com/ip7z/7zip/releases/download/26.03/7z2603-mac.tar.xz'
# GitHub's release asset SHA-256, recorded when upgrading the pinned release.
SHA256 = '5ca87677072c59f5602e5c49baa27d4694bacd2259b4e507f0094249d4281480'
TOOL_DIR = Path(__file__).resolve().parents[1] / '.build-tools/macos/7zip'


def validate_tool(directory=TOOL_DIR, architecture=None):
    architecture = architecture or platform.machine()
    binary = directory / '7zz'
    for name in ('7zz', 'License.txt', 'readme.txt'):
        if not (directory / name).is_file():
            raise RuntimeError('Missing Mac extraction tool or notices. Run yarn setup-mac.')
    subprocess.run(['lipo', str(binary), '-verify_arch', architecture], check=True)
    info = subprocess.check_output(['/usr/bin/arch', '-' + architecture, str(binary), 'i'], text=True)
    if not re.search(r'\bRar5?\b', info) or not re.search(r'\b(?:Rar[1-5]|RAR[1-5])\b', info):
        raise RuntimeError('7-Zip must include RAR decoders, not just a RAR format reader.')
    return binary


def install(archive):
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise RuntimeError('7-Zip archive checksum mismatch; refusing installation.')
    TOOL_DIR.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=TOOL_DIR.parent) as staging:
        staging = Path(staging)
        with tarfile.open(archive, 'r:xz') as source:
            # Only extract the expected regular files; never unpack archive paths/links.
            for name in ('7zz', 'License.txt', 'readme.txt', 'History.txt'):
                member = source.getmember(name)
                if not member.isfile():
                    raise RuntimeError(f'Unexpected archive member: {name}')
                with source.extractfile(member) as reader, (staging / name).open('wb') as writer:
                    shutil.copyfileobj(reader, writer)
        (staging / '7zz').chmod(0o755)
        validate_tool(staging)
        TOOL_DIR.mkdir(parents=True, exist_ok=True)
        for item in staging.iterdir():
            shutil.copy2(item, TOOL_DIR / item.name)
    print(f'Installed official 7-Zip {VERSION} with RAR support: {TOOL_DIR}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Use an already downloaded official archive')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        raise RuntimeError('Run this setup on macOS.')
    if args.archive:
        install(args.archive)
    else:
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / '7zip.tar.xz'
            subprocess.run(['curl', '--fail', '--location', '--proto', '=https',
                            '--tlsv1.2', '--output', str(archive), URL], check=True)
            install(archive)
    print('Cargo is only needed to build the crash reporter. Install it with: brew install rust')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError, tarfile.TarError) as error:
        print(f'Mac tools setup failed: {error}', file=sys.stderr)
        sys.exit(1)
