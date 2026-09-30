from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_ascendara_mac as build


class MacBuildTests(unittest.TestCase):
    def test_both_targets_and_native_default(self):
        self.assertEqual(build.selected_arches('both'), ['arm64', 'x64'])
        for machine, expected in [('arm64', 'arm64'), ('x86_64', 'x64')]:
            with patch.object(build.platform, 'machine', return_value=machine):
                self.assertEqual(build.selected_arches('host'), [expected])

    def test_python_executes_requested_slice(self):
        self.assertEqual(build.python_command('x64', '/custom/python'),
                         ['/usr/bin/arch', '-x86_64', '/custom/python'])
        self.assertEqual(build.python_command('arm64', '/custom/python'),
                         ['/usr/bin/arch', '-arm64', '/custom/python'])

    def test_cargo_uses_selected_compiler_instead_of_homebrew(self):
        with patch.object(build.subprocess, 'check_output', return_value='/rustup/stable\n'), \
             patch.dict(build.os.environ, {'RUSTC': '/opt/homebrew/bin/rustc', 'PATH': '/opt/homebrew/bin'}):
            env = build.rust_environment()
        self.assertEqual(env['RUSTC'], '/rustup/stable/bin/rustc')
        self.assertEqual(env['RUSTDOC'], '/rustup/stable/bin/rustdoc')
        self.assertTrue(env['PATH'].startswith('/rustup/stable/bin:'))

    def test_preflight_rejects_wrong_python_even_with_intel_rust(self):
        with tempfile.TemporaryDirectory() as libdir, \
             patch.object(build.sys, 'platform', 'darwin'), \
             patch.object(build, 'validate_tool'), \
             patch.object(build.shutil, 'which', return_value='/tool'), \
             patch.object(build.subprocess, 'check_output', side_effect=['arm64\n', libdir]):
            errors = build.preflight('x64')
        self.assertTrue(any('Python must run as x86_64' in error for error in errors))

    def test_preflight_rejects_absent_target_stdlib(self):
        with patch.object(build.sys, 'platform', 'darwin'), \
             patch.object(build, 'validate_tool'), \
             patch.object(build.shutil, 'which', return_value='/tool'), \
             patch.object(build.subprocess, 'check_output', side_effect=['x86_64\n', '/nonexistent/target/lib']):
            errors = build.preflight('x64')
        self.assertTrue(any('x86_64-apple-darwin' in error for error in errors))

    def test_both_artifacts_share_one_renderer_and_signature(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'build/assets').mkdir(parents=True)
            (root / 'build/index.html').write_text('<html></html>')
            (root / 'electron').mkdir()
            with patch.object(build, 'ROOT', root), \
                 patch.object(build.sys, 'argv', ['build', '--arch', 'both', '--dir']), \
                 patch.object(build, 'preflight', return_value=[]), \
                 patch.object(build, 'run') as run, \
                 patch.object(build, 'build_arch') as build_arch:
                self.assertEqual(build.main(), 0)
            self.assertEqual([call.args[0] for call in run.call_args_list], [
                ['yarn', 'build'], ['node', 'scripts/generate_build_signature.js'],
            ])
            self.assertEqual([call.args[0] for call in build_arch.call_args_list], ['arm64', 'x64'])


if __name__ == '__main__':
    unittest.main()
