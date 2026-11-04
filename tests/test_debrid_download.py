"""Exercise the real HTTP transfer, staging, extraction and installer handoff."""
import functools
import http.server
import json
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'binaries/AscendaraDownloader/src'))
from AscendaraDownloader import AscendaraDownloader
from AscendaraTransfer import Transfer


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


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

    def download(self, files, platform='win32'):
        plan = {'transferId': 'realdebrid:torrent:test', 'files': [
            dict(filename=path, size=(self.source / name).stat().st_size,
                 url=f'http://127.0.0.1:{self.server.server_port}/{name}')
            for name, path in files]}
        manifest = self.root / 'files.json'
        manifest.write_text(json.dumps(plan), encoding='utf-8')
        worker = AscendaraDownloader('Example', False, False, False, False, '1', '', str(self.root / 'games'))
        with patch('AscendaraDownloader.prevent_sleep'), patch('AscendaraDownloader.allow_sleep'), \
             patch('AscendaraDownloader.load_settings', return_value={}), \
             patch('AscendaraDownloader.sys', SimpleNamespace(**{**vars(sys), 'platform': platform})), \
             patch.object(worker, '_handle_post_download_behavior'):
            worker.download(str(manifest), file_list=True)
        return worker, Path(worker.download_dir)

    def test_repack_downloads_all_files_and_uses_existing_manual_install_state(self):
        (self.source / 'setup.exe').write_bytes(b'MZ fixture - never execute')
        (self.source / 'data.bin').write_bytes(b'repack data' * 100)
        worker, dest = self.download([('setup.exe', 'Repack/setup.exe'), ('data.bin', 'Repack/data.bin')])
        info = json.loads(Path(worker.game_info_path).read_text(encoding='utf-8'))
        data = info['downloadingData']
        self.assertTrue(data['pendingManualInstall'])
        self.assertEqual(Path(data['manualInstallerPath']).read_bytes(), (self.source / 'setup.exe').read_bytes())
        self.assertEqual(data['manualInstallDir'], str(dest))
        self.assertEqual((dest / 'data.bin').read_bytes(), (self.source / 'data.bin').read_bytes())
        self.assertEqual(info['executable'], '')

    def test_linux_debrid_repack_extracts_without_entering_windows_installer_flow(self):
        with zipfile.ZipFile(self.source / 'repack.zip', 'w') as archive:
            archive.writestr('Repack/setup.exe', b'MZ installer fixture')
            archive.writestr('Repack/data.bin', b'repack data')
        worker, dest = self.download([('repack.zip', 'repack.zip')], platform='linux')
        info = json.loads(Path(worker.game_info_path).read_text(encoding='utf-8'))
        self.assertNotIn('downloadingData', info,
                         'Linux debrid downloads must not offer the Windows-only installer launcher')
        self.assertEqual((dest / 'setup.exe').read_bytes(), b'MZ installer fixture')
        self.assertEqual((dest / 'data.bin').read_bytes(), b'repack data')

    def test_archive_and_companion_files_are_installed_together(self):
        with zipfile.ZipFile(self.source / 'game.zip', 'w') as archive:
            archive.writestr('Example/game.exe', b'MZ game fixture')
        (self.source / 'extra.bin').write_bytes(b'companion data')
        worker, dest = self.download([('game.zip', 'game.zip'), ('extra.bin', 'extra.bin')])
        info = json.loads(Path(worker.game_info_path).read_text(encoding='utf-8'))
        self.assertNotIn('downloadingData', info, info)
        self.assertEqual((dest / 'Example/game.exe').read_bytes(), b'MZ game fixture')
        self.assertEqual((dest / 'extra.bin').read_bytes(), b'companion data')

    def test_manifest_cannot_write_outside_download_folder(self):
        (self.source / 'bad.bin').write_bytes(b'bad')
        worker, dest = self.download([('bad.bin', '../../escaped.bin')])
        info = json.loads(Path(worker.game_info_path).read_text(encoding='utf-8'))
        self.assertTrue(info['downloadingData']['error'])
        self.assertFalse((dest / 'escaped.bin').exists())
        self.assertFalse((self.root / 'escaped.bin').exists())

    def test_resume_keeps_finished_files_and_downloads_remaining_files(self):
        (self.source / 'setup.exe').write_bytes(b'MZ setup fixture')
        (self.source / 'data.bin').write_bytes(b'data fixture')
        files = [('setup.exe', 'setup.exe'), ('data.bin', 'data.bin')]
        original_run = Transfer.run
        transferred = []
        def pause_after_first(transfer):
            original_run(transfer)
            transferred.append(Path(transfer.destination).name)
            metadata = self.root / 'games/Example/Example.ascendara.json'
            info = json.loads(metadata.read_text(encoding='utf-8'))
            info['downloadingData']['stopped'] = True
            metadata.write_text(json.dumps(info), encoding='utf-8')
        with patch.object(Transfer, 'run', pause_after_first):
            worker, _ = self.download(files)
        self.assertEqual(transferred, ['setup.exe'])
        info = json.loads(Path(worker.game_info_path).read_text(encoding='utf-8'))
        info['downloadingData']['stopped'] = False
        Path(worker.game_info_path).write_text(json.dumps(info), encoding='utf-8')
        def record(transfer):
            transferred.append(Path(transfer.destination).name)
            return original_run(transfer)
        with patch.object(Transfer, 'run', record):
            worker, _ = self.download(files)
        self.assertEqual(transferred, ['setup.exe', 'data.bin'])
        self.assertTrue(worker.game_info['downloadingData']['pendingManualInstall'])


if __name__ == '__main__':
    unittest.main()
