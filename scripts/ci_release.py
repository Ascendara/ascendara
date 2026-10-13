#!/usr/bin/env python3
"""Create a NEW draft, upload verified artifacts, register, then optionally publish.

Intentionally refuses to resume existing releases: the backend has no documented
idempotency contract. An interrupted registration requires operator reconciliation.
"""
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from ci_build import ROOT, verify, version
from register_build import register_build


def api(path, method='GET', data=None):
    request = urllib.request.Request('https://api.github.com/repos/' + os.environ['GITHUB_REPOSITORY'] + path,
        method=method, data=None if data is None else json.dumps(data).encode(), headers={
            'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main():
    tag = 'v' + version()
    if os.environ['GITHUB_REF'] != 'refs/tags/' + tag:
        raise RuntimeError('Release stage requires the matching version tag')
    if not os.environ.get('ADMIN_POST_KEY'):
        raise RuntimeError('ADMIN_POST_KEY is required before creating a draft')
    directory = ROOT / 'release-artifacts'
    manifests = verify(directory)
    try:
        api('/releases/tags/' + urllib.parse.quote(tag))
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
    else:
        raise RuntimeError('Release already exists. Refusing to overwrite assets or repeat registration.')
    release = api('/releases', 'POST', {'tag_name': tag, 'name': tag, 'draft': True,
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
    expected = {item['name']: item['size'] for m in manifests for item in m['artifacts']}
    if {item['name']: item['size'] for item in assets} != expected:
        raise RuntimeError('Draft asset verification failed')
    for manifest in manifests:
        register_build(manifest['signature'])
    api(f"/releases/{release['id']}", 'PATCH', {
        'body': 'All four native builds, packaged signatures, artifact checksums, and backend registrations passed.',
        'draft': os.environ.get('PUBLISH_RELEASE') != 'true'})
    print('All release checks passed.')


if __name__ == '__main__':
    main()
