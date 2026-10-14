#!/usr/bin/env python3
"""Build a release description from the published Ascendara changelog."""
import datetime
import json
import sys
import urllib.request

CHANGELOG_URL = 'https://api.ascendara.app/json/changelog/v2'
SECTIONS = (('additions', '➕ Additions'), ('fixes', '🐛 Fixes'),
            ('improvements', '🛠 Improvements'), ('removals', '❌ Removals'))


def fetch_entry(version):
    # Cloudflare rejects urllib's default user agent before the API sees the request
    request = urllib.request.Request(CHANGELOG_URL, headers={'User-Agent': 'Ascendara-Build/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        changelog = json.load(response)
    entry = next((item for item in changelog.get('entries', []) if item.get('version') == version), None)
    # The API returns areas alphabetically; parentTags holds the intended order
    return entry, changelog.get('parentTags', [])


def format_entry(entry, tag_order=()):
    date = datetime.date.fromisoformat(entry['date'])
    lines = [f"## [{entry['version']}] – {date.strftime('%B')} {date.day}, {date.year}",
             f"### {entry['title']}", '', entry['description'], '', '---']
    for key, heading in SECTIONS:
        groups = [(tag, changes[key]) for tag, changes in entry.get('features', {}).items() if changes.get(key)]
        groups.sort(key=lambda group: tag_order.index(group[0]) if group[0] in tag_order else len(tag_order))
        if not groups:
            continue
        lines += ['', f'## {heading}']
        for tag, items in groups:
            lines += ['', f'### {tag}'] + [f'- {item}' for item in items]
        lines += ['', '---']
    return '\n'.join(lines)


def release_notes(version):
    """The changelog entry for this version as Markdown, or None if there isn't one."""
    try:
        entry, tag_order = fetch_entry(version)
        return format_entry(entry, tag_order) if entry else None
    except Exception as error:
        print(f'Could not build release notes from the changelog: {error}', file=sys.stderr)
        return None


if __name__ == '__main__':
    print(release_notes(sys.argv[1]) or 'No changelog entry found.')
