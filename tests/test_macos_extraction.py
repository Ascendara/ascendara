"""Run after yarn setup-mac with the downloader's Python requirements installed."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'binaries/AscendaraDownloader/src'))
import setup_macos_tools as setup
import AscendaraDownloader as downloader


class Connection:
    def __init__(self):
        self.messages = []

    def send(self, message):
        self.messages.append(message)

    def close(self):
        pass

    def poll(self, timeout):
        return True

    def recv(self):
        return 'cancel'


@unittest.skipUnless(sys.platform == 'darwin', 'macOS extraction tests')
class MacExtractionTests(unittest.TestCase):
    def test_official_binary_architecture_and_rar_codecs(self):
        setup.validate_tool()

    def test_project_tool_precedes_system_installation(self):
        with patch.object(downloader.shutil, 'which', return_value='/bin/sh'):
            self.assertEqual(Path(downloader._find_7z()), setup.TOOL_DIR / '7zz')

    def test_bad_download_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / 'bad.tar.xz'
            archive.write_bytes(b'not the official download')
            with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
                setup.install(archive)

    def extract(self, archive, destination):
        destination.mkdir()
        manifest = destination.parent / f'{destination.name}.json'
        connection, stop = Connection(), threading.Event()
        try:
            downloader.extraction_worker(str(archive), str(destination), str(manifest), connection, stop)
        finally:
            stop.set()
        self.assertEqual(connection.messages[-1][0], 'done', connection.messages)
        return json.loads(manifest.read_text())

    def test_zip_encrypted_zip_and_7z(self):
        tool = setup.validate_tool()
        with tempfile.TemporaryDirectory(prefix='ascendara extraction ') as temporary:
            root = Path(temporary)
            payload = root / 'game data.txt'
            payload.write_bytes(b'Ascendara extraction test\n' * 100)
            for index, (format_, options) in enumerate([
                ('zip', []), ('zip', ['-psteamrip.com', '-mem=AES256']), ('7z', []),
            ]):
                with self.subTest(format=format_, options=options):
                    archive = root / f'fixture{index}.{format_}'
                    subprocess.run([str(tool), 'a', f'-t{format_}', *options, str(archive), str(payload)],
                                   check=True, stdout=subprocess.DEVNULL)
                    destination = root / f'output{index}'
                    manifest = self.extract(archive, destination)
                    self.assertIn(payload.name, manifest)
                    self.assertEqual((destination / payload.name).read_bytes(), payload.read_bytes())

    @unittest.skipUnless(os.environ.get('ASCENDARA_RAR_TEST_FIXTURE'), 'Set ASCENDARA_RAR_TEST_FIXTURE to a RAR5 fixture')
    def test_rar5(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'out'
            manifest = self.extract(Path(os.environ['ASCENDARA_RAR_TEST_FIXTURE']), destination)
            self.assertTrue(manifest)
            for name, item in manifest.items():
                self.assertEqual((destination / name).stat().st_size, item['size'])


if __name__ == '__main__':
    unittest.main()
