#!/usr/bin/env python3
"""Generate WinGet manifests from an immutable, public Ascendara release."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY = 'Ascendara/ascendara'
PACKAGE = 'tagoWorks.Ascendara'
SCHEMA = '1.10.0'


def read_url(url):
    # Public downloads must work without credentials, just as they do for WinGet.
    request = urllib.request.Request(url, headers={'User-Agent': 'Ascendara-WinGet'})
    return urllib.request.urlopen(request, timeout=60)


def get_json(url):
    with read_url(url) as response:
        return json.load(response)


def select_installer(release, tag):
    if not re.fullmatch(r'\d+\.\d+\.\d+', tag):
        raise ValueError('Expected a stable version tag such as 11.3.3')
    if release['tag_name'] != tag or release['draft'] or release['prerelease']:
        raise ValueError('WinGet requires a published stable release matching the tag')
    # The release also carries a portable .exe; WinGet only takes the installer.
    assets = [a for a in release['assets'] if a['name'] == f'Ascendara.Setup.{tag}.exe']
    if len(assets) != 1:
        raise ValueError('Expected exactly one Ascendara.Setup.<version>.exe asset; review installer layout')
    asset = assets[0]
    expected = f'https://github.com/{REPOSITORY}/releases/download/{tag}/{asset["name"]}'
    if asset['browser_download_url'] != expected:
        raise ValueError('Installer must use the version-specific GitHub release URL')
    return asset


def hash_installer(asset):
    digest = hashlib.sha256()
    size = 0
    with read_url(asset['browser_download_url']) as response:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    if size != asset['size']:
        raise ValueError('Downloaded installer size does not match the release asset')
    actual = digest.hexdigest()
    if asset.get('digest') and asset['digest'].lower() != 'sha256:' + actual:
        raise ValueError('Downloaded installer hash does not match the release asset')
    return actual.upper()


def check_package(package, license_text, tag):
    if package['version'] != tag:
        raise ValueError('Tagged package.json version does not match the release')
    build = package['build']
    if build['win']['target'] != 'nsis' or build.get('nsis'):
        raise ValueError('Installer settings changed; review the WinGet installer manifest')
    if build['productName'] != 'Ascendara' or package['author'] != 'tagoWorks':
        raise ValueError('Product/publisher changed; review WinGet metadata')
    if not license_text.startswith('MIT License'):
        raise ValueError('License changed; review WinGet license metadata')


def manifests(tag, url, sha256):
    # JSON strings are valid YAML scalars; quote all externally sourced values.
    q = json.dumps
    common = f'PackageIdentifier: {PACKAGE}\nPackageVersion: {q(tag)}\n'
    result = {
        f'{PACKAGE}.yaml': common + f'DefaultLocale: en-US\nManifestType: version\nManifestVersion: {SCHEMA}\n',
        f'{PACKAGE}.locale.en-US.yaml': common + f'''PackageLocale: en-US
Publisher: tagoWorks
PublisherUrl: https://github.com/Ascendara
PublisherSupportUrl: https://github.com/Ascendara/ascendara/issues
PackageName: Ascendara
PackageUrl: https://ascendara.app
License: MIT
LicenseUrl: https://github.com/Ascendara/ascendara/blob/{tag}/LICENSE
ShortDescription: A desktop game download manager and launcher.
Moniker: ascendara
Tags:
  - games
  - launcher
  - download-manager
ReleaseNotesUrl: https://github.com/Ascendara/ascendara/releases/tag/{tag}
ManifestType: defaultLocale
ManifestVersion: {SCHEMA}
''',
        f'{PACKAGE}.installer.yaml': common + f'''InstallerType: nullsoft
Scope: user
UpgradeBehavior: install
Installers:
  - Architecture: x64
    InstallerUrl: {q(url)}
    InstallerSha256: {sha256}
ManifestType: installer
ManifestVersion: {SCHEMA}
''',
    }
    for name, contents in result.items():
        kind = 'installer' if name.endswith('.installer.yaml') else 'defaultLocale' if '.locale.' in name else 'version'
        result[name] = f'# yaml-language-server: $schema=https://aka.ms/winget-manifest.{kind}.{SCHEMA}.schema.json\n' + contents
    return result


def existing_submission(tag):
    path = f'manifests/t/tagoWorks/Ascendara/{tag}'
    try:
        get_json(f'https://api.github.com/repos/microsoft/winget-pkgs/contents/{path}')
        return f'https://github.com/microsoft/winget-pkgs/tree/master/{path}'
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
    query = urllib.parse.quote(f'repo:microsoft/winget-pkgs is:pr is:open in:title "{PACKAGE}" "{tag}"')
    results = get_json(f'https://api.github.com/search/issues?q={query}')
    for item in results['items']:
        if PACKAGE.lower() in item['title'].lower() and re.search(rf'(?<![\d.]){re.escape(tag)}(?![\d.])', item['title']):
            return item['html_url']
    return ''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--output', default='.cache/winget')
    parser.add_argument('--check-existing', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'\d+\.\d+\.\d+', args.tag):
        parser.error('Expected a stable version tag such as 11.3.3')
    release = get_json(f'https://api.github.com/repos/{REPOSITORY}/releases/tags/{args.tag}')
    asset = select_installer(release, args.tag)
    base = f'https://raw.githubusercontent.com/{REPOSITORY}/{args.tag}'
    package = get_json(base + '/package.json')
    with read_url(base + '/LICENSE') as response:
        license_text = response.read().decode('utf-8')
    check_package(package, license_text, args.tag)
    digest = hash_installer(asset)
    directory = Path(args.output) / 'manifests/t/tagoWorks/Ascendara' / args.tag
    directory.mkdir(parents=True, exist_ok=True)
    for name, contents in manifests(args.tag, asset['browser_download_url'], digest).items():
        (directory / name).write_text(contents, encoding='utf-8')
    existing = existing_submission(args.tag) if args.check_existing else ''
    print(f'Manifests: {directory}\nSHA256: {digest}')
    if existing:
        print(f'Already submitted: {existing}')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write(f'manifest_path={directory.as_posix()}\nexisting={existing}\n')


if __name__ == '__main__':
    main()
