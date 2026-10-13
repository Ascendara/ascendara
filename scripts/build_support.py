"""Shared guards for the existing platform build entry points."""
import json
import os
from pathlib import Path
import subprocess
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]


def validate_resources(platform, config=None):
    config = config or json.loads((ROOT / 'package.json').read_text())['build']
    for item in config.get('extraResources', []) + config[platform]['extraResources']:
        path = ROOT / item['from']
        if not path.exists() or (path.is_file() and path.stat().st_size == 0):
            raise RuntimeError(f'Required packaging resource missing or empty: {path}')
        if path.is_file() and path.name.startswith('Ascendara'):
            validate_native_binary(path, platform)
        if platform != 'win' and path.name.startswith('Ascendara') and not os.access(path, os.X_OK):
            raise RuntimeError(f'Helper is not executable: {path}')


def validate_native_binary(path, platform):
    path = Path(path)
    with path.open('rb') as stream:
        header = stream.read(64)
        if platform == 'win':
            if header[:2] != b'MZ' or len(header) < 64:
                raise RuntimeError(f'Expected Windows PE executable: {path}')
            stream.seek(struct.unpack_from('<I', header, 60)[0])
            pe = stream.read(6)
            if pe != b'PE\x00\x00\x64\x86':
                raise RuntimeError(f'Expected Windows x64 executable: {path}')
        elif platform == 'linux':
            if header[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<H', header, 18)[0] != 62:
                raise RuntimeError(f'Expected Linux x64 ELF executable: {path}')


def register_after_build():
    if '--skip-registration' in sys.argv:
        print('Registration deferred; this build is not yet authorized by the backend.')
        return
    subprocess.run([sys.executable, str(ROOT / 'scripts/register_build.py')], check=True)
