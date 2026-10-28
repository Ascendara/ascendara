"""Shared guards for the existing platform build entry points."""
import json
import os
from pathlib import Path
import subprocess
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]


def validate_resources(platform, items=None):
    lists = json.loads((ROOT / 'electrobun' / 'resources.json').read_text())
    for item in lists['common'] + (items if items is not None else lists[platform]):
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


ELECTROBUN_VERSION = '2.0.5'  # keep in step with hutch.config.ts

# Hutch reads its own names for the signing and notarization credentials.
SIGNING_ENV = {
    'ASCENDARA_MAC_SIGN_IDENTITY': 'ELECTROBUN_DEVELOPER_ID',
    'APPLE_ID': 'ELECTROBUN_APPLEID',
    'APPLE_APP_SPECIFIC_PASSWORD': 'ELECTROBUN_APPLEIDPASS',
    'APPLE_TEAM_ID': 'ELECTROBUN_TEAMID',
    'APPLE_API_KEY': 'ELECTROBUN_APPLEAPIKEYPATH',
    'APPLE_API_KEY_ID': 'ELECTROBUN_APPLEAPIKEY',
    'APPLE_API_ISSUER': 'ELECTROBUN_APPLEAPIISSUER',
}


def run_electrobun_build(platform, resources=None, highball=None, sign=False):
    """Stage the app and package it with Electrobun for the host platform.

    Artifacts land in .electrobun/artifacts: the installer (DMG on macOS,
    Setup on Windows, self-extracting archive on Linux) plus the update
    bundle and update.json for release.baseUrl.
    """
    validate_resources(platform, resources)
    # The pinned npm bootstrap fetches Hutch and forwards to `hutch electrobun`.
    electrobun = ['npx.cmd' if os.name == 'nt' else 'npx', '--yes', f'electrobun@{ELECTROBUN_VERSION}']
    stage = ['node', str(ROOT / 'scripts/electrobun/stage-app.cjs'), '--env=stable']
    staging = ROOT / '.electrobun'
    staging.mkdir(exist_ok=True)
    if resources is not None:
        resources_file = staging / 'resources.override.json'
        resources_file.write_text(json.dumps(resources, indent=2))
        stage.append(f'--resources={resources_file}')
    if highball:
        stage.append(f'--highball={highball}')
    env = os.environ.copy()
    for source, target in SIGNING_ENV.items():
        if env.get(source) and not env.get(target):
            env[target] = env[source]
    env['ASCENDARA_CODESIGN'] = '1' if sign else '0'
    subprocess.run([*electrobun, 'prepare'], check=True, cwd=ROOT, env=env)
    subprocess.run(stage, check=True, cwd=ROOT, env=env)
    subprocess.run([*electrobun, 'build', '--env=stable'], check=True, cwd=ROOT, env=env)


def register_after_build():
    if '--skip-registration' in sys.argv:
        print('Registration deferred; this build is not yet authorized by the backend.')
        return
    subprocess.run([sys.executable, str(ROOT / 'scripts/register_build.py')], check=True)
