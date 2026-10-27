#!/usr/bin/env python3
"""CI configuration, artifact verification, and release gates. Never load local .env."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from build_support import ROOT, validate_native_binary

TARGETS = {'windows-x64': ('win', ['.exe']), 'linux-x64': ('linux', ['.AppImage']),
           'mac-arm64': ('mac', ['.dmg', '.zip']), 'mac-x64': ('mac', ['.dmg', '.zip'])}
# Everything here ships readable inside the app, so only values that are meant
# to be public belong in it. The old AUTHORIZATION, ASCENDARA_API_KEY and
# IMAGE_KEY entries were unused by the app and leaked server keys.
CONFIG_FIELDS = {'ASCENDARA_SECRET_SEED': 'SECRET_SEED', 'REACT_APP_DISCKEY': 'DISCKEY'}


def version():
    return json.loads((ROOT / 'package.json').read_text())['version']


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def preflight():
    ref = os.environ['GITHUB_REF']
    release = ref.startswith('refs/tags/')
    if release and ref != 'refs/tags/' + version():
        raise RuntimeError('Tag must be ' + version() + ' to match package.json')
    if release and not re.fullmatch(r'\d+\.\d+\.\d+', version()):
        raise RuntimeError('Release version must be a stable x.y.z version')
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write(f'release={str(release).lower()}\nversion={version()}\n')


def configure():
    # This file is already the application's production configuration interface.
    # These values are necessarily recoverable from a distributed Electron app.
    if os.environ.get('RELEASE_MODE') == 'true' and not os.environ.get('ASCENDARA_SECRET_SEED'):
        raise RuntimeError('ASCENDARA_SECRET_SEED is required for production API authentication')
    config = {field: os.environ[key] for key, field in CONFIG_FIELDS.items() if os.environ.get(key)}
    (ROOT / 'electron/config.prod.js').write_text('module.exports = ' + json.dumps(config) + ';\n')


def collect(target):
    platform, suffixes = TARGETS[target]
    config = json.loads((ROOT / 'package.json').read_text())['build']
    expected_signature = json.loads((ROOT / 'electron/build-signature.json').read_text())
    if expected_signature['version'] != version():
        raise RuntimeError('Signature version mismatch')
    resources = {'win': ROOT / 'dist/win-unpacked/resources',
                 'linux': ROOT / 'dist/linux-unpacked/resources'}
    if platform == 'mac':
        apps = list((ROOT / 'dist').glob('mac*/*.app/Contents/Resources'))
        if len(apps) != 1:
            raise RuntimeError('Expected exactly one packaged macOS application')
        resource = apps[0]
    else:
        resource = resources[platform]
    # Read the actual packaged ASAR, not just the signature left in the checkout.
    script = "const a=require('@electron/asar'); process.stdout.write(a.extractFile(process.argv[1], 'electron/build-signature.json'));"
    actual = json.loads(subprocess.check_output(['node', '-e', script, str(resource / 'app.asar')], cwd=ROOT))
    if actual != expected_signature:
        raise RuntimeError('Packaged signature differs from registration signature')
    for item in config[platform]['extraResources']:
        source = Path(item['from'])
        if source.name.startswith('Ascendara'):
            helper = resource / source.name
            if not helper.is_file() or helper.stat().st_size == 0:
                raise RuntimeError(f'Packaged helper missing: {helper.name}')
            validate_native_binary(helper, platform)
            if platform == 'mac':
                arch = 'arm64' if target == 'mac-arm64' else 'x86_64'
                subprocess.run(['lipo', str(helper), '-verify_arch', arch], check=True)
            if platform != 'win' and not os.access(helper, os.X_OK):
                raise RuntimeError(f'Packaged helper not executable: {helper.name}')
    output = ROOT / 'release-artifacts' / target
    output.mkdir(parents=True, exist_ok=False)
    artifacts = []
    for suffix in suffixes:
        matches = list((ROOT / 'dist').glob('*' + suffix))
        if len(matches) != 1 or matches[0].stat().st_size == 0:
            raise RuntimeError(f'Expected one nonempty {suffix} installer')
        artifact = matches[0]
        if version() not in artifact.name:
            raise RuntimeError('Installer filename does not contain package version')
        if platform == 'mac' and not artifact.name.endswith(f'-{target[4:]}{suffix}'):
            raise RuntimeError('Wrong macOS artifact architecture')
        shutil.copy2(artifact, output / artifact.name)
        artifacts.append({'name': artifact.name, 'sha256': digest(artifact), 'size': artifact.stat().st_size})
    # Retain Windows differential update metadata where electron-builder emits it.
    for artifact in (ROOT / 'dist').glob('*.blockmap'):
        shutil.copy2(artifact, output / artifact.name)
        artifacts.append({'name': artifact.name, 'sha256': digest(artifact), 'size': artifact.stat().st_size})
    (output / 'manifest.json').write_text(json.dumps({'target': target, 'version': version(),
        'commit': os.environ['GITHUB_SHA'], 'signature': actual, 'artifacts': artifacts}, indent=2))
    print(f'Validated {target}: packaged signature, helpers, and {len(artifacts)} artifacts')


def verify(directory):
    manifests = []
    seen = set()
    ids = set()
    for target, (_, suffixes) in TARGETS.items():
        folder = directory / target
        manifest = json.loads((folder / 'manifest.json').read_text())
        if manifest['target'] != target or manifest['version'] != version() or manifest['commit'] != os.environ['GITHUB_SHA']:
            raise RuntimeError('Artifact provenance mismatch')
        if manifest['signature']['version'] != version() or manifest['signature']['buildId'] in ids:
            raise RuntimeError('Signature version mismatch or duplicate build ID')
        ids.add(manifest['signature']['buildId'])
        names = []
        for item in manifest['artifacts']:
            name = item['name']
            if Path(name).name != name or '/' in name or '\\' in name or name in seen:
                raise RuntimeError('Unsafe or duplicate asset filename')
            seen.add(name)
            names.append(name)
            artifact = folder / name
            if artifact.stat().st_size != item['size'] or item['size'] <= 0 or digest(artifact) != item['sha256']:
                raise RuntimeError('Artifact checksum/size mismatch')
        for suffix in suffixes:
            if sum(name.endswith(suffix) for name in names) != 1:
                raise RuntimeError(f'Missing or duplicate {target} installer: {suffix}')
        manifests.append(manifest)
    return manifests


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('preflight', 'configure', 'collect', 'verify'))
    parser.add_argument('--target', choices=TARGETS)
    parser.add_argument('--directory', type=Path, default=ROOT / 'release-artifacts')
    args = parser.parse_args()
    if args.command == 'collect':
        collect(args.target)
    elif args.command == 'verify':
        verify(args.directory)
        print('All four platforms verified')
    else:
        globals()[args.command]()
