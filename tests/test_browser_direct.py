"""Exercise provider dispatch without network, extraction, or optional native imports."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from urllib.parse import urlparse

source = Path(__file__).parents[1] / 'binaries/AscendaraDownloader/src/AscendaraDownloader.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
method = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == 'download' and any(arg.arg == 'provider' for arg in node.args.args))
namespace = {'prevent_sleep': lambda: None, 'allow_sleep': lambda: None, 'urlparse': urlparse, 'validate_download_url': lambda url: url}
exec(compile(ast.Module(body=[method], type_ignores=[]), str(source), 'exec'), namespace)

class DirectProviderTests(unittest.TestCase):
    def fake(self):
        self.calls = []
        return SimpleNamespace(VALID_BUZZHEAVIER_DOMAINS=['bzzhr.to'],
            _download_buzzheavier=lambda url: self.calls.append(('buzz', url)),
            _download_gofile=lambda url, password: self.calls.append(('gofile', url)),
            _pre_download_disk_check=lambda: self.calls.append(('direct', None)) or False)

    def test_browser_direct_skips_provider_resolution(self):
        for url in ['https://gofile.io/download/file.zip', 'https://bzzhr.to/file.zip', 'https://cdn.example/game.zip?sig=a%2Fb']:
            target = self.fake()
            namespace['download'](target, url, provider='direct')
            self.assertEqual(self.calls, [('direct', None)])

    def test_catalog_provider_resolution_is_preserved(self):
        target = self.fake()
        namespace['download'](target, 'https://bzzhr.to/share', provider='auto')
        self.assertEqual(self.calls, [('buzz', 'https://bzzhr.to/share')])

if __name__ == '__main__':
    unittest.main()

