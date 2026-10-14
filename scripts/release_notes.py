#!/usr/bin/env python3
"""Build a release description from the published Ascendara changelog."""
import datetime
import json
import sys
import urllib.request

CHANGELOG_URL = 'https://api.ascendara.app/json/changelog/v2'
SECTIONS = (('additions', '➕ Added'), ('improvements', '🛠 Improved'),
            ('fixes', '🐛 Fixed'), ('removals', '❌ Removed'))
# Installers people pick from, in the order they are listed. Anything else
# attached to the release (updater archives, blockmaps) goes under "All files".
INSTALLERS = (('.exe', 'Windows', '64-bit'), ('-mac-arm64.dmg', 'macOS', 'Apple Silicon'),
              ('-mac-x64.dmg', 'macOS', 'Intel'), ('.AppImage', 'Linux', '64-bit'))


def fetch_entry(version):
    # Cloudflare rejects urllib's default user agent before the API sees the request
    request = urllib.request.Request(CHANGELOG_URL, headers={'User-Agent': 'Ascendara-Build/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        changelog = json.load(response)
    entry = next((item for item in changelog.get('entries', []) if item.get('version') == version), None)
    # The API returns areas alphabetically; parentTags holds the intended order
    return entry, changelog.get('parentTags', [])


def size_label(size):
    return f'{size / 1048576:.0f} MB' if size >= 1048576 else f'{max(1, round(size / 1024))} KB'


def format_downloads(assets, repo, tag):
    """A table of installers, with every attached file and its checksum folded away below it."""
    # Built from the tag, not the asset's own link: a draft's links change when it is published
    link = lambda name: f'https://github.com/{repo}/releases/download/{tag}/{name}'
    rows = []
    for suffix, platform, detail in INSTALLERS:
        for asset in assets:
            if asset['name'].endswith(suffix):
                rows.append(f"| **{platform}** | {detail} | [{asset['name']}]({link(asset['name'])}) "
                            f"| {size_label(asset['size'])} |")
    if not rows:
        return []
    lines = ['## Download', '', '| Platform | Version | File | Size |', '|---|---|---|---|', *rows, '',
             '> Already have Ascendara? It will offer this update on its own.', '',
             '<details>', '<summary>All files and checksums</summary>', '',
             '| File | Size | SHA-256 |', '|---|---|---|']
    for asset in sorted(assets, key=lambda item: item['name']):
        digest = (asset.get('digest') or '').removeprefix('sha256:')
        lines.append(f"| [{asset['name']}]({link(asset['name'])}) | {size_label(asset['size'])} "
                     f"| {f'`{digest}`' if digest else '—'} |")
    return lines + ['', '</details>', '']


def format_entry(entry, tag_order=(), assets=(), repo=None, tag=None, previous_tag=None):
    date = datetime.date.fromisoformat(entry['date'])
    lines = [f"# {entry['title']}", '',
             f"**Ascendara {entry['version']}** · {date.strftime('%B')} {date.day}, {date.year}", '',
             entry['description'], '']
    if assets and repo and tag:
        lines += format_downloads(list(assets), repo, tag)

    lines += ["## What's new", '']
    for key, heading in SECTIONS:
        groups = [(area, changes[key]) for area, changes in entry.get('features', {}).items() if changes.get(key)]
        if not groups:
            continue
        groups.sort(key=lambda group: tag_order.index(group[0]) if group[0] in tag_order else len(tag_order))
        lines += [f'### {heading}', '']
        for area, items in groups:
            lines += [f'**{area}**'] + [f'- {item}' for item in items] + ['']

    if repo and tag and previous_tag and previous_tag != tag:
        lines += ['---', '', f'**Full list of code changes:** '
                  f'[{previous_tag} → {tag}](https://github.com/{repo}/compare/{previous_tag}...{tag})']
    return '\n'.join(lines).rstrip() + '\n'


def release_notes(version, **details):
    """The changelog entry for this version as Markdown, or None if there isn't one.
    details: assets, repo, tag, previous_tag (all optional)."""
    try:
        entry, tag_order = fetch_entry(version)
        return format_entry(entry, tag_order, **details) if entry else None
    except Exception as error:
        print(f'Could not build release notes from the changelog: {error}', file=sys.stderr)
        return None


if __name__ == '__main__':
    print(release_notes(sys.argv[1]) or 'No changelog entry found.')
