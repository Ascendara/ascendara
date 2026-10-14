import copy
import io
from pathlib import Path
import sys
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import winget_release as winget


class WinGetReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tag = '11.3.3'
        self.asset = {
            'name': 'Ascendara.Setup.11.3.3.exe',
            'browser_download_url': 'https://github.com/Ascendara/ascendara/releases/download/11.3.3/Ascendara.Setup.11.3.3.exe',
            'size': 3,
            'digest': 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        }
        self.release = {'tag_name': self.tag, 'draft': False, 'prerelease': False, 'assets': [self.asset]}

    def test_published_release(self):
        self.assertEqual(winget.select_installer(self.release, self.tag), self.asset)

    def test_reject_unpublished_or_mismatched_releases(self):
        for key, value in [('draft', True), ('prerelease', True), ('tag_name', '11.4.0')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                winget.select_installer(dict(self.release, **{key: value}), self.tag)

    def test_reject_ambiguous_or_mutable_assets(self):
        release = copy.deepcopy(self.release)
        release['assets'].append(dict(self.asset, name='other.exe'))
        with self.assertRaises(ValueError):
            winget.select_installer(release, self.tag)
        release = copy.deepcopy(self.release)
        release['assets'][0]['browser_download_url'] = 'https://example.com/latest.exe'
        with self.assertRaises(ValueError):
            winget.select_installer(release, self.tag)

    def test_verify_download_and_reject_corruption(self):
        with patch.object(winget, 'read_url', return_value=io.BytesIO(b'abc')):
            self.assertEqual(winget.hash_installer(self.asset), self.asset['digest'][7:].upper())
        for content in [b'ab', b'bad']:
            with patch.object(winget, 'read_url', return_value=io.BytesIO(content)), self.assertRaises(ValueError):
                winget.hash_installer(self.asset)

    def test_installer_changes_require_review(self):
        package = {'version': self.tag, 'author': 'tagoWorks', 'build': {'productName': 'Ascendara', 'win': {'target': 'nsis'}}}
        winget.check_package(package, 'MIT License\n', self.tag)
        package['build']['nsis'] = {'perMachine': True}
        with self.assertRaises(ValueError):
            winget.check_package(package, 'MIT License\n', self.tag)

    def test_existing_merged_version_is_not_resubmitted(self):
        with patch.object(winget, 'get_json', return_value=[]):
            self.assertIn('/11.3.3', winget.existing_submission(self.tag))

    def test_open_pr_matches_exact_version(self):
        missing = urllib.error.HTTPError('https://api.github.com', 404, 'Not found', {}, None)
        results = {'items': [
            {'title': 'New version: tagoWorks.Ascendara 11.3.30', 'html_url': 'wrong'},
            {'title': 'New version: tagoWorks.Ascendara 11.3.3', 'html_url': 'correct'},
        ]}
        with patch.object(winget, 'get_json', side_effect=[missing, results]):
            self.assertEqual(winget.existing_submission(self.tag), 'correct')

    def test_api_failure_does_not_trigger_duplicate_submission(self):
        forbidden = urllib.error.HTTPError('https://api.github.com', 403, 'Rate limited', {}, None)
        with patch.object(winget, 'get_json', side_effect=forbidden), self.assertRaises(urllib.error.HTTPError):
            winget.existing_submission(self.tag)


if __name__ == '__main__':
    unittest.main()
