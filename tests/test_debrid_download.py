"""Cloud-torrent file lists through the real downloader: transfer, extraction, install and installer handoff.

Needs the release build: cargo build --release in binaries/AscendaraDownloader.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / 'binaries/AscendaraDownloader/target/release' / (
    'AscendaraDownloader.exe' if sys.platform == 'win32' else 'AscendaraDownloader')


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@unittest.skipUnless(BINARY.is_file(), f'build the downloader first: {BINARY}')
class DebridDownloadTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'server'
        self.source.mkdir()
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0),
            functools.partial(QuietHandler, directory=str(self.source)))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        # Isolated settings and log: never the developer's own post-download action.
        home = self.root / 'home'
        settings = home / ('Ascendara' if sys.platform == 'win32' else '.config/ascendara')
        settings.mkdir(parents=True)
        (settings / 'ascendarasettings.json').write_text(json.dumps({'behaviorAfterDownload': 'none'}))
        self.env = dict(os.environ, APPDATA=str(home), HOME=str(home))

    def download(self, files):
        plan = {'transferId': 'realdebrid:torrent:test', 'files': [
            dict(filename=path, size=(self.source / name).stat().st_size,
                 url=f'http://127.0.0.1:{self.server.server_port}/{name}')
            for name, path in files]}
        manifest = self.root / 'files.json'
        manifest.write_text(json.dumps(plan), encoding='utf-8')
        games = self.root / 'games'
        subprocess.run([str(BINARY), str(manifest), 'Example', 'false', 'false', 'false', 'false',
                        '1', '1 MB', str(games), '', '--file-list'],
                       env=self.env, timeout=120, check=True)
        dest = games / 'Example'
        return json.loads((dest / 'Example.ascendara.json').read_text(encoding='utf-8')), dest

    @unittest.skipUnless(sys.platform == 'win32', 'the installer handoff is Windows only')
    def test_repack_downloads_all_files_and_uses_manual_install_state(self):
        (self.source / 'setup.exe').write_bytes(b'MZ fixture - never execute')
        (self.source / 'data.bin').write_bytes(b'repack data' * 100)
        info, dest = self.download([('setup.exe', 'Repack/setup.exe'), ('data.bin', 'Repack/data.bin')])
        data = info['downloadingData']
        self.assertTrue(data['pendingManualInstall'])
        self.assertEqual(Path(data['manualInstallerPath']).read_bytes(), (self.source / 'setup.exe').read_bytes())
        self.assertEqual(Path(data['manualInstallDir']), dest)
        self.assertEqual((dest / 'data.bin').read_bytes(), (self.source / 'data.bin').read_bytes())
        self.assertEqual(info['executable'], '')

    @unittest.skipIf(sys.platform == 'win32', 'checks the non-Windows install path')
    def test_repack_installs_without_the_windows_installer_flow(self):
        with zipfile.ZipFile(self.source / 'repack.zip', 'w') as archive:
            archive.writestr('Repack/setup.exe', b'MZ installer fixture')
            archive.writestr('Repack/data.bin', b'repack data')
        info, dest = self.download([('repack.zip', 'repack.zip')])
        self.assertNotIn('downloadingData', info)
        self.assertEqual((dest / 'setup.exe').read_bytes(), b'MZ installer fixture')
        self.assertEqual((dest / 'data.bin').read_bytes(), b'repack data')

    def test_archive_and_companion_files_are_installed_together(self):
        with zipfile.ZipFile(self.source / 'game.zip', 'w') as archive:
            archive.writestr('Example/game.exe', b'MZ game fixture')
        (self.source / 'extra.bin').write_bytes(b'companion data')
        info, dest = self.download([('game.zip', 'game.zip'), ('extra.bin', 'extra.bin')])
        self.assertNotIn('downloadingData', info, info)
        self.assertEqual((dest / 'Example/game.exe').read_bytes(), b'MZ game fixture')
        self.assertEqual((dest / 'extra.bin').read_bytes(), b'companion data')
        self.assertFalse((dest / '.ascendara-downloads').exists())

    def test_manifest_cannot_write_outside_download_folder(self):
        (self.source / 'bad.bin').write_bytes(b'bad')
        info, dest = self.download([('bad.bin', '../../escaped.bin')])
        self.assertTrue(info['downloadingData']['error'])
        self.assertFalse((dest / 'escaped.bin').exists())
        self.assertFalse((self.root / 'escaped.bin').exists())
        self.assertFalse((self.root / 'games/escaped.bin').exists())


if __name__ == '__main__':
    unittest.main()
