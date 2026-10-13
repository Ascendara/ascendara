#!/usr/bin/env python3
"""Register one completed build using the existing Ascendara backend contract.

No automatic retries: the backend exposes no documented idempotency/status API.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

API_URL = 'https://api.ascendara.app/admin/register-build'
ROOT = Path(__file__).resolve().parents[1]


def load_build_signature(path):
    data = json.loads(Path(path).read_text())
    if set(data) != {'buildId', 'signature', 'version', 'timestamp'}:
        raise ValueError('Unexpected build signature schema')
    if not all(isinstance(data[key], str) and data[key] for key in ('buildId', 'signature', 'version')):
        raise ValueError('Invalid signature fields')
    if not isinstance(data['timestamp'], int) or data['timestamp'] <= 0:
        raise ValueError('Invalid timestamp')
    return data


def register_build(data):
    key = os.environ.get('ADMIN_POST_KEY')
    if not key:
        raise RuntimeError('ADMIN_POST_KEY is required for registration')
    request = urllib.request.Request(API_URL, data=json.dumps(data).encode(), method='POST',
        headers={'Authorization': key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f'Registration returned HTTP {response.status}')
            result = json.load(response)
            if not isinstance(result, dict):
                raise RuntimeError('Registration did not return the expected JSON object')
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Registration returned HTTP {error.code}; inspect backend logs') from None
    except urllib.error.URLError:
        raise RuntimeError('Registration network failure; outcome may be unknown. Check backend before retrying.') from None
    print(f"Registered build {data['buildId']} ({data['version']})")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('signature', nargs='?', type=Path, default=ROOT / 'electron/build-signature.json')
    args = parser.parse_args()
    register_build(load_build_signature(args.signature))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
