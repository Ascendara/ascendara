"""GOFile discovery and authentication, shared by the V4 download pipeline.

The website-token protocol follows the old Ascendara Gofile Helper script. This module does not
write game state, extract archives, launch a helper process, or log credentials.
"""
import hashlib
import logging
import os
import re
import time
from urllib.parse import urlparse, quote

import requests


def content_id(url):
    if url.startswith('//'):
        url = 'https:' + url
    elif '://' not in url:
        url = 'https://' + url
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('gofile.io', 'www.gofile.io'):
        raise ValueError('Expected a GOFile sharing URL: https://gofile.io/d/CONTENT_ID')
    match = re.fullmatch(r'/d/([A-Za-z0-9_-]+)/?', parsed.path)
    if not match or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Expected a GOFile sharing URL: https://gofile.io/d/CONTENT_ID')
    return match[1]


class GofileClient:
    def __init__(self, session, check_cancelled):
        self.session = session
        self.check_cancelled = check_cancelled
        self.user_agent = os.environ.get('GF_USERAGENT', 'Mozilla/5.0')
        self.token = None
        self.secret = None

    def _website_token(self):
        slot = int(time.time()) // 14400
        raw = f'{self.user_agent}::en-US::{self.token or ""}::{slot}::{self.secret}'
        return hashlib.sha256(raw.encode()).hexdigest()

    def _request(self, method, path, params=None):
        self.check_cancelled()
        headers = {'User-Agent': self.user_agent, 'Accept': '*/*',
                   'Origin': 'https://gofile.io', 'Referer': 'https://gofile.io/',
                   'X-Website-Token': self._website_token(), 'X-BL': 'en-US'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        try:
            with self.session.request(method, 'https://api.gofile.io/' + path,
                                      headers=headers, params=params, timeout=(10, 15),
                                      allow_redirects=False) as response:
                if response.status_code == 429:
                    raise RuntimeError('GOFile rate limit reached. Please wait a few minutes and try again.')
                response.raise_for_status()
                payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise RuntimeError('Unable to fetch GOFile content information. Please try again.') from exc
        self.check_cancelled()
        if not isinstance(payload, dict):
            raise RuntimeError('GOFile returned invalid content information')
        status = payload.get('status')
        if status != 'ok':
            messages = {
                'error-rateLimit': 'GOFile rate limit reached. Please wait a few minutes and try again.',
                'error-passwordRequired': 'This GOFile folder requires --password.',
                'error-passwordWrong': 'The GOFile folder password is incorrect.',
                'error-notFound': 'GOFile content was removed or could not be found.',
                'error-notPublic': 'GOFile content is not publicly accessible.',
            }
            raise RuntimeError(messages.get(status, f'GOFile could not provide the content ({status})'))
        data = payload.get('data')
        if not isinstance(data, dict):
            raise RuntimeError('GOFile returned invalid content information')
        return data

    def resolve(self, url, password=None):
        root = content_id(url)
        self.check_cancelled()
        # Retain the helper's Ascendara-provided secret and offline fallback.
        try:
            with self.session.get('https://api.ascendara.app/app/json/gofilesecret', timeout=5) as response:
                response.raise_for_status()
                payload = response.json()
                self.secret = payload.get('secret') if isinstance(payload, dict) else None
                if not isinstance(self.secret, str) or not self.secret:
                    raise ValueError('Missing website token secret')
        except (requests.RequestException, ValueError):
            logging.warning('Could not fetch GOFile website-token secret; using the helper fallback')
            self.secret = 'f4s58gs6'
        account = self._request('POST', 'accounts')
        self.token = account.get('token')
        if not isinstance(self.token, str) or not self.token:
            raise RuntimeError('GOFile did not issue an account token')
        params = {'cache': 'true', 'sortField': 'createTime', 'sortDirection': '1'}
        if password is not None:
            params['password'] = hashlib.sha256(password.encode()).hexdigest()
        pending, visited, files, names = [root], set(), {}, {}
        while pending:
            self.check_cancelled()
            identifier = pending.pop()
            if identifier in visited:
                continue
            visited.add(identifier)
            data = self._request('GET', 'contents/' + quote(identifier, safe=''), params)
            if data.get('type') == 'folder':
                children = data.get('children')
                if not isinstance(children, dict):
                    raise RuntimeError('GOFile folder listing is unavailable or incomplete')
                nodes = [(str(key), child) for key, child in children.items()]
                if int(data.get('childrenCount', len(nodes))) > len(nodes):
                    raise RuntimeError('GOFile returned an incomplete folder listing; no files were installed')
            else:
                nodes = [(identifier, data)]
            for key, node in nodes:
                if not isinstance(node, dict):
                    raise RuntimeError('GOFile returned an invalid file entry')
                file_id = str(node.get('id', key))
                if node.get('type') == 'folder':
                    pending.append(file_id)
                    continue
                if node.get('type') != 'file':
                    raise RuntimeError('GOFile returned an unsupported content type')
                if not node.get('link'):
                    node = self._request('GET', 'contents/' + quote(file_id, safe=''), params)
                name, link = node.get('name'), node.get('link')
                if not isinstance(name, str) or not isinstance(link, str):
                    raise RuntimeError('GOFile did not provide a filename and download link')
                # Like the helper, combine provider folders at the download root.
                # Fail collisions rather than silently overwrite another folder's file.
                if '/' in name or '\\' in name:
                    raise ValueError('GOFile returned a filename containing a directory separator')
                previous = names.setdefault(name.casefold(), file_id)
                if previous != file_id:
                    raise ValueError(f'GOFile folders contain duplicate filenames: {name}')
                parsed = urlparse(link)
                if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
                    raise ValueError('GOFile returned an invalid download URL')
                size = node.get('size')
                if size is not None:
                    size = int(size)
                    if size < 0:
                        raise ValueError('GOFile returned a negative file size')
                files[file_id] = {'id': file_id, 'filename': name, 'link': link,
                                  'size': size, 'md5': node.get('md5')}
        if not files:
            raise RuntimeError('no_files_error: GOFile folder contains no downloadable files')
        return list(files.values())

    def authenticate_downloads(self, session):
        # Keep the API bearer token out of file requests. The cookie is restricted
        # to GOFile domains, including redirects; external CDNs receive no token.
        session.cookies.set('accountToken', self.token, domain='.gofile.io', path='/', secure=True)
        session.headers.update({'User-Agent': self.user_agent, 'Referer': 'https://gofile.io/',
                                'Origin': 'https://gofile.io', 'Accept-Encoding': 'identity'})
