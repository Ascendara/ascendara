from contextlib import ExitStack
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent / 'src'))
import AscendaraDownloader as downloader


class LocalExtractionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'Example'
        self.cache = self.root / '.ascendara-downloads'
        self.cache.mkdir(parents=True)
        self.metadata = self.root / 'Example.ascendara.json'
        self.info = {'game': 'Example', 'favorite': True, 'playTime': 123,
                     'downloadingData': {'error': True, 'progressCompleted': '100.00'}}
        stack = ExitStack()
        self.addCleanup(stack.close)
        for target in ('prevent_sleep', 'allow_sleep'):
            stack.enter_context(patch.object(downloader, target))
        stack.enter_context(patch.object(downloader.AscendaraDownloader, '_handle_post_download_behavior'))
        stack.enter_context(patch.object(downloader.requests.sessions.Session, 'request',
                                      side_effect=AssertionError('Network request during local extraction')))
        self.repair = stack.enter_context(patch.object(downloader.AscendaraDownloader, '_repair_archive',
                                                    side_effect=AssertionError('Repair download attempted')))
        stack.enter_context(patch.object(downloader.AscendaraDownloader, '_await_extraction_recovery', return_value='cancel'))

    def run_retry(self):
        self.metadata.write_text(json.dumps(self.info), encoding='utf-8')
        downloader.retry_local_extraction(str(self.metadata))
        self.repair.assert_not_called()
        return json.loads(self.metadata.read_text(encoding='utf-8'))

    def archive(self):
        target = self.cache / 'game.zip'
        with zipfile.ZipFile(target, 'w') as archive:
            archive.writestr('Example/game.exe', b'example executable')
        return target

    def test_legacy_archive_extracts_and_preserves_metadata(self):
        archive = self.archive()
        result = self.run_retry()
        self.assertNotIn('downloadingData', result)
        self.assertTrue(result['favorite'])
        self.assertEqual(result['playTime'], 123)
        self.assertEqual((self.root / 'game.exe').read_bytes(), b'example executable')
        self.assertFalse(archive.exists())

    def test_saved_plan_includes_loose_files(self):
        self.archive()
        (self.cache / 'extra.txt').write_text('extra')
        self.info['extractionSources'] = {
            'archives': ['.ascendara-downloads/game.zip'],
            'loose': [{'source': '.ascendara-downloads/extra.txt', 'filename': 'extra.txt', 'size': 5}],
            'updating': False,
        }
        result = self.run_retry()
        self.assertNotIn('downloadingData', result)
        self.assertNotIn('extractionSources', result)
        self.assertEqual((self.root / 'extra.txt').read_text(), 'extra')

    def test_corrupt_archive_retained_without_repair_download(self):
        archive = self.cache / 'game.zip'
        archive.write_bytes(b'broken archive')
        result = self.run_retry()
        self.assertTrue(result['downloadingData']['error'])
        self.assertIn('Extraction failure', result['downloadingData']['message'])
        self.assertEqual(archive.read_bytes(), b'broken archive')

    def test_missing_source_does_not_modify_installation(self):
        (self.root / 'game.exe').write_bytes(b'existing')
        self.info['extractionSources'] = {'archives': ['.ascendara-downloads/missing.zip']}
        result = self.run_retry()
        self.assertIn('Retained source is missing', result['downloadingData']['message'])
        self.assertEqual((self.root / 'game.exe').read_bytes(), b'existing')

    def test_source_cannot_escape_game_directory(self):
        self.info['extractionSources'] = {'archives': ['../outside.zip']}
        result = self.run_retry()
        self.assertTrue(result['downloadingData']['error'])
        self.assertIn('Unsafe archive member', result['downloadingData']['message'])


if __name__ == '__main__':
    unittest.main()
