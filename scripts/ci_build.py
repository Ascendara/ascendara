#!/usr/bin/env python3
"""CI configuration, artifact verification, and release gates. Never load local .env."""
import argparse
from fnmatch import fnmatchcase
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from build_support import ROOT, validate_native_binary

# Electrobun artifacts each target must produce exactly one of: the installer
# (renamed below to carry the version) and the update bundle and manifest the
# in-app updater fetches from release.baseUrl under their original names.
TARGETS = {'windows-x64': ('win', 'win-x64', ['*-Setup.zip']),
           'linux-x64': ('linux', 'linux-x64', ['*Setup*.tar.gz']),
           'mac-arm64': ('mac', 'macos-arm64', ['*.dmg']),
           'mac-x64': ('mac', 'macos-x64', ['*.dmg'])}
UPDATE_PATTERNS = ['*-update.json', '*.tar.zst']
ARTIFACTS = ROOT / '.electrobun' / 'artifacts'
STAGE = ROOT / '.electrobun' / 'stage'
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
    # These values are necessarily recoverable from a distributed desktop app.
    if os.environ.get('RELEASE_MODE') == 'true' and not os.environ.get('ASCENDARA_SECRET_SEED'):
        raise RuntimeError('ASCENDARA_SECRET_SEED is required for production API authentication')
    config = {field: os.environ[key] for key, field in CONFIG_FIELDS.items() if os.environ.get(key)}
    (ROOT / 'electron/config.prod.js').write_text('module.exports = ' + json.dumps(config) + ';\n')


def collect(target):
    platform, label, patterns = TARGETS[target]
    expected_signature = json.loads((ROOT / 'electron/build-signature.json').read_text())
    if expected_signature['version'] != version():
        raise RuntimeError('Signature version mismatch')
    # Electrobun copies the stage folder into the app verbatim.
    actual = json.loads((STAGE / 'electron/build-signature.json').read_text())
    if actual != expected_signature:
        raise RuntimeError('Packaged signature differs from registration signature')
    resources = STAGE / 'resources'
    lists = json.loads((ROOT / 'electrobun/resources.json').read_text())
    for item in lists[platform]:
        source = Path(item['from'])
        if source.name.startswith('Ascendara'):
            helper = resources / source.name
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

    def add(source, name):
        if source.stat().st_size == 0:
            raise RuntimeError(f'Empty artifact: {source.name}')
        shutil.copy2(source, output / name)
        artifacts.append({'name': name, 'sha256': digest(source), 'size': source.stat().st_size})

    for pattern in patterns + UPDATE_PATTERNS:
        matches = [path for path in ARTIFACTS.glob(pattern) if label in path.name]
        if len(matches) != 1:
            raise RuntimeError(f'Expected one {label} {pattern} artifact, found {len(matches)}')
        artifact = matches[0]
        if pattern in UPDATE_PATTERNS:
            add(artifact, artifact.name)
        else:
            suffix = ''.join(artifact.suffixes[-2:]) if artifact.name.endswith('.tar.gz') else artifact.suffix
            add(artifact, f'Ascendara-{version()}-{target}{"-Setup" if platform != "mac" else ""}{suffix}')
    # Delta patches let existing installs update without the full bundle.
    for artifact in ARTIFACTS.glob(f'*{label}*.patch'):
        add(artifact, artifact.name)
    (output / 'manifest.json').write_text(json.dumps({'target': target, 'version': version(),
        'commit': os.environ['GITHUB_SHA'], 'signature': actual, 'artifacts': artifacts}, indent=2))
    print(f'Validated {target}: packaged signature, helpers, and {len(artifacts)} artifacts')


def verify(directory):
    manifests = []
    seen = set()
    ids = set()
    for target, (_, label, _) in TARGETS.items():
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
        installer = f'Ascendara-{version()}-{target}*'
        if sum(fnmatchcase(name, installer) for name in names) != 1:
            raise RuntimeError(f'Missing or duplicate {target} installer')
        for pattern in UPDATE_PATTERNS:
            if sum(fnmatchcase(name, pattern) and label in name for name in names) != 1:
                raise RuntimeError(f'Missing or duplicate {target} update file: {pattern}')
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
