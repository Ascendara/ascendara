"""Legacy TorrentHandler regression tests.

This file is intentionally excluded from the repository's default test_*.py
discovery. The production torrent path is AscendaraDownloader; run this module
explicitly only when maintaining the retained legacy handler source.
"""
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

from qbittorrentapi import TorrentState

# Keep the handler's import-time logging out of the real Ascendara log
_home = tempfile.TemporaryDirectory()
with patch.dict(os.environ, {'HOME': _home.name}):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'binaries/AscendaraTorrentHandler/src'))
    import AscendaraTorrentHandler as handler
    from AscendaraTorrentClients import QbitClient, TorrentClient, TorrentStatus, create_client

MAGNET = 'magnet:?xt=urn:btih:' + 'a' * 40 + '&dn=Example'
HASH = 'a' * 40


def status(save_path, **overrides):
    values = dict(name='Example', progress=0.5, download_speed=2048, eta=30, save_path=save_path,
                  state='downloading', complete=False, error=False, busy=False)
    values.update(overrides)
    return TorrentStatus(**values)


class FakeClient(TorrentClient):
    name = 'FakeTorrent'

    def __init__(self, existing=None, states=None):
        super().__init__('localhost', 1234, 'user', 'pass')
        self.calls = []
        self.torrent = existing
        self.states = list(states or [])

    def connect(self):
        self.calls.append(('connect',))

    def get(self, torrent_hash):
        assert torrent_hash == HASH
        if self.torrent and self.states:
            self.torrent = self.states.pop(0)
        return self.torrent

    def add(self, magnet_link, save_path):
        self.calls.append(('add', magnet_link, save_path))
        content = Path(save_path) / 'Example'
        content.mkdir(parents=True)
        with zipfile.ZipFile(content / 'game.zip', 'w') as zf:
            zf.writestr('Example/Example.exe', b'MZ' + b'\0' * 64)
            zf.writestr('Example/data/level.pak', b'level')
        self.torrent = status(save_path, progress=0.0, download_speed=0)
        if not self.states:
            self.states = [status(save_path), status(save_path, progress=1.0, complete=True, state='seeding')]

    def resume(self, torrent_hash):
        self.calls.append(('resume', torrent_hash))

    def set_download_limit(self, torrent_hash, limit_bytes):
        self.calls.append(('limit', torrent_hash, limit_bytes))

    def remove(self, torrent_hash, delete_files):
        self.calls.append(('remove', torrent_hash, delete_files))
        self.torrent = None
        self.states = []


class TorrentHandlerTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for target in ('time.sleep', '_launch_notification', 'launch_crash_reporter'):
            patcher = patch(f'AscendaraTorrentHandler.{target}')
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch('AscendaraTorrentHandler.load_settings', return_value={'downloadLimit': 500})
        patcher.start()
        self.addCleanup(patcher.stop)
        # download_torrent registers cleanup with atexit; don't run it after the test
        patcher = patch('AscendaraTorrentHandler.atexit.register')
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_download(self, client):
        manager = handler.TorrentManager(client)
        manager.download_torrent(MAGNET, 'Example', False, False, False, False, '1.0', '', str(self.root))
        return manager

    def game_info(self):
        return json.loads((self.root / 'Example' / 'Example.ascendara.json').read_text(encoding='utf-8'))

    def test_downloads_and_installs_through_the_client(self):
        client = FakeClient()
        manager = self.run_download(client)

        game_dir = str(self.root / 'Example')
        self.assertEqual(client.calls, [
            ('connect',),
            ('add', MAGNET, game_dir),
            ('limit', HASH, 500 * 1024),
            ('remove', HASH, False),
        ])
        self.assertIsNone(manager.current_torrent_hash)
        info = self.game_info()
        self.assertNotIn('downloadingData', info)
        self.assertTrue(info['executable'].endswith('Example.exe'))
        self.assertTrue(os.path.isfile(info['executable']))
        self.assertTrue((self.root / 'Example' / 'Example' / 'data' / 'level.pak').is_file())

    def test_resumes_a_torrent_already_saving_to_the_game_folder(self):
        game_dir = str(self.root / 'Example')
        client = FakeClient()
        client.add(MAGNET, game_dir)
        client.calls.clear()

        self.run_download(client)

        self.assertIn(('resume', HASH), client.calls)
        self.assertFalse([c for c in client.calls if c[0] == 'add'])

    def test_refuses_a_torrent_already_saving_elsewhere(self):
        client = FakeClient(existing=status(str(self.root / 'elsewhere')))

        with self.assertRaisesRegex(Exception, 'already in FakeTorrent'):
            self.run_download(client)

        self.assertFalse([c for c in client.calls if c[0] == 'add'])
        self.assertIn('already in FakeTorrent', self.game_info()['downloadingData']['message'])

    def test_stops_when_the_client_reports_an_error(self):
        game_dir = str(self.root / 'Example')
        client = FakeClient(states=[status(game_dir, error=True, state='missingFiles')])

        with self.assertRaisesRegex(Exception, "FakeTorrent reported 'missingFiles'"):
            self.run_download(client)

    def test_cleanup_deletes_an_unfinished_torrent_with_its_files(self):
        client = FakeClient(existing=status('x'))
        manager = handler.TorrentManager(client)
        manager.ensure_connected()
        manager.current_torrent_hash = HASH

        manager.cleanup()

        self.assertIn(('remove', HASH, True), client.calls)

    def test_cleanup_keeps_a_finished_torrent(self):
        client = FakeClient(existing=status('x', complete=True))
        manager = handler.TorrentManager(client)
        manager.ensure_connected()
        manager.current_torrent_hash = HASH

        manager.cleanup()

        self.assertFalse([c for c in client.calls if c[0] == 'remove'])


def qbit_torrent(state, **overrides):
    values = dict(name='Example', progress=0.25, dlspeed=4096, eta=60, save_path='/games/Example',
                  state=state, state_enum=TorrentState(state))
    values.update(overrides)
    return SimpleNamespace(**values)


class FakeQbitApi:
    def __init__(self, torrents=(), add_result='Ok.'):
        self.torrents = list(torrents)
        self.add_result = add_result
        self.calls = []

    def torrents_info(self, torrent_hashes):
        return self.torrents

    def torrents_add(self, **kwargs):
        self.calls.append(('add', kwargs))
        return self.add_result

    def torrents_start(self, torrent_hashes):
        raise Exception('404: qBittorrent 4 has no start endpoint')

    def torrents_resume(self, torrent_hashes):
        self.calls.append(('resume', torrent_hashes))

    def torrents_set_download_limit(self, limit, torrent_hashes):
        self.calls.append(('limit', limit, torrent_hashes))

    def torrents_delete(self, delete_files, torrent_hashes):
        self.calls.append(('delete', delete_files, torrent_hashes))


class QbitClientTest(unittest.TestCase):
    def client(self, api):
        qbit = QbitClient('localhost', 8080, 'admin', 'adminadmin')
        qbit.client = api
        return qbit

    def test_maps_torrent_info_to_a_status(self):
        got = self.client(FakeQbitApi([qbit_torrent('downloading')])).get(HASH)
        self.assertEqual(got, TorrentStatus(
            name='Example', progress=0.25, download_speed=4096, eta=60, save_path='/games/Example',
            state='downloading', complete=False, error=False, busy=False))

    def test_maps_states(self):
        cases = {
            'stalledUP': dict(complete=True, error=False, busy=False),
            'checkingUP': dict(complete=True, error=False, busy=True),
            'moving': dict(complete=False, error=False, busy=False),
            'checkingResumeData': dict(complete=False, error=False, busy=True),
            'missingFiles': dict(complete=False, error=True, busy=False),
            'error': dict(complete=False, error=True, busy=False),
        }
        for state, expected in cases.items():
            with self.subTest(state=state):
                got = self.client(FakeQbitApi([qbit_torrent(state)])).get(HASH)
                self.assertEqual((got.complete, got.error, got.busy),
                                 (expected['complete'], expected['error'], expected['busy']))

    def test_missing_torrent_is_none(self):
        self.assertIsNone(self.client(FakeQbitApi()).get(HASH))

    def test_add_accepts_old_and_new_responses(self):
        for result in ('Ok.', {'success_count': 1}, {'pending_count': 1}, {'added_torrent_ids': [HASH]}):
            with self.subTest(result=result):
                api = FakeQbitApi(add_result=result)
                self.client(api).add(MAGNET, '/games/Example')
                self.assertEqual(api.calls, [('add', dict(urls=MAGNET, save_path='/games/Example',
                                                          use_auto_torrent_management=False,
                                                          sequential_download=True))])

    def test_add_raises_when_rejected(self):
        for result in ('Fails.', {'failure_count': 1}):
            with self.subTest(result=result):
                with self.assertRaisesRegex(Exception, 'qBittorrent rejected the torrent'):
                    self.client(FakeQbitApi(add_result=result)).add(MAGNET, '/games/Example')

    def test_resume_falls_back_to_the_qbittorrent_4_endpoint(self):
        api = FakeQbitApi()
        self.client(api).resume(HASH)
        self.assertEqual(api.calls, [('resume', HASH)])

    def test_limit_and_remove(self):
        api = FakeQbitApi()
        qbit = self.client(api)
        qbit.set_download_limit(HASH, 1024)
        qbit.remove(HASH, delete_files=False)
        self.assertEqual(api.calls, [('limit', 1024, HASH), ('delete', False, HASH)])


class CreateClientTest(unittest.TestCase):
    def test_creates_qbittorrent(self):
        client = create_client('qbittorrent', 'host', 9090, 'u', 'p')
        self.assertIsInstance(client, QbitClient)
        self.assertEqual((client.host, client.port, client.username, client.password), ('host', 9090, 'u', 'p'))

    def test_rejects_unknown_clients(self):
        with self.assertRaisesRegex(Exception, "Unsupported torrent client 'nope'"):
            create_client('nope', 'host', 1, 'u', 'p')


if __name__ == '__main__':
    unittest.main()
