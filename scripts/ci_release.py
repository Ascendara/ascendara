#!/usr/bin/env python3
"""Create a NEW draft, upload verified artifacts, register, then optionally publish.

Intentionally refuses to resume existing releases: the backend has no documented
idempotency contract. An interrupted registration requires operator reconciliation.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
from ci_build import ROOT, verify, version
from register_build import register_build
from release_notes import release_notes


def api(path, method='GET', data=None):
    request = urllib.request.Request('https://api.github.com/repos/' + os.environ['GITHUB_REPOSITORY'] + path,
        method=method, data=None if data is None else json.dumps(data).encode(), headers={
            'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def notes_for(tag, assets):
    """The release description: the changelog entry plus download links for the attached files."""
    try:
        previous_tag = api('/releases/latest')['tag_name']
    except Exception:
        previous_tag = None
    return release_notes(tag, assets=assets, repo=os.environ['GITHUB_REPOSITORY'], tag=tag,
                         previous_tag=previous_tag)


def main():
    tag = version()
    if os.environ['GITHUB_REF'] != 'refs/tags/' + tag:
        raise RuntimeError('Release stage requires the matching version tag')
    if not os.environ.get('ADMIN_POST_KEY'):
        raise RuntimeError('ADMIN_POST_KEY is required before creating a draft')
    directory = ROOT / 'release-artifacts'
    manifests = verify(directory)
    # Drafts are invisible to the by-tag lookup, so list releases to catch one left by an earlier run.
    if any(item['tag_name'] == tag for item in api('/releases?per_page=100')):
        raise RuntimeError('Release already exists. Refusing to overwrite assets or repeat registration.')
    release = api('/releases', 'POST', {'tag_name': tag, 'name': 'Ascendara ' + tag, 'draft': True,
        'target_commitish': os.environ['GITHUB_SHA'],
        'body': 'Build artifacts uploaded; backend registration checks are pending.'})
    print(f"Created draft release {release['id']}", flush=True)
    for manifest in manifests:
        folder = directory / manifest['target']
        for item in manifest['artifacts']:
            subprocess.run(['gh', 'release', 'upload', tag, str(folder / item['name']),
                '--repo', os.environ['GITHUB_REPOSITORY']], check=True)
    # Verify the server has every uploaded asset before any backend side effect.
    assets = api(f"/releases/{release['id']}/assets?per_page=100")
    # GitHub stores asset names with spaces replaced by dots
    # ("Ascendara Setup 1.2.3.exe" becomes "Ascendara.Setup.1.2.3.exe").
    expected = {item['name'].replace(' ', '.'): item['size'] for m in manifests for item in m['artifacts']}
    if {item['name']: item['size'] for item in assets} != expected:
        raise RuntimeError('Draft asset verification failed')
    for manifest in manifests:
        register_build(manifest['signature'])
    # The description comes from the changelog entry for this version, when there is one
    api(f"/releases/{release['id']}", 'PATCH', {
        'body': notes_for(tag, assets) or
            'All four native builds, packaged signatures, artifact checksums, and backend registrations passed.',
        'draft': os.environ.get('PUBLISH_RELEASE') != 'true'})
    print('All release checks passed.')


def write_notes():
    """Fill in the description of the existing release for this version, leaving everything else alone."""
    tag = version()
    release = next((item for item in api('/releases?per_page=100') if item['tag_name'] == tag), None)
    if not release:
        raise RuntimeError(f'No release found for {tag}')
    notes = notes_for(tag, api(f"/releases/{release['id']}/assets?per_page=100"))
    if not notes:
        raise RuntimeError(f'No changelog entry found for {tag}')
    api(f"/releases/{release['id']}", 'PATCH', {'name': 'Ascendara ' + tag, 'body': notes})
    print(f"Updated the description of release {release['id']}")


if __name__ == '__main__':
    write_notes() if sys.argv[1:] == ['notes'] else main()
