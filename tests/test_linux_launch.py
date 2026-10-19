import ast
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch


class LinuxLaunchTests(unittest.TestCase):
    def test_umu_uses_same_prefix_as_proton_and_preserves_display_environment(self):
        source = Path('binaries/AscendaraGameHandler/src/AscendaraGameHandler.py').read_text()
        function = next(node for node in ast.parse(source).body
                        if isinstance(node, ast.FunctionDef) and node.name == 'launch_with_umu')
        process = Mock()
        subprocess = Mock()
        subprocess.Popen.return_value = process
        install = Mock()
        namespace = dict(os=os, logging=Mock(), subprocess=subprocess,
                         _clean_pyinstaller_env=lambda env: env,
                         _split_env_and_args=lambda cmd: ({}, []),
                         install_vcredist=install, _pipe_process_logs=Mock())
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<launch>', 'exec'), namespace)
        with patch('os.path.exists', return_value=True), patch('os.chmod'), patch('os.makedirs'), patch.dict(os.environ, {'DISPLAY': ':0'}):
            result = namespace['launch_with_umu']('/games/game.exe', {
                'runner_path': '/umu/umu-run', 'compat_data': '/prefix/game',
                'proton_path': '/GE-Proton', 'steam_path': '/steam',
            })
        self.assertIs(result, process)
        env = subprocess.Popen.call_args.kwargs['env']
        self.assertEqual(env['WINEPREFIX'], '/prefix/game/pfx')
        self.assertEqual(env['STEAM_COMPAT_DATA_PATH'], '/prefix/game')
        self.assertEqual(env['PROTONPATH'], '/GE-Proton')
        self.assertEqual(env['DISPLAY'], ':0')
        self.assertEqual(install.call_args.args[0], '/prefix/game/pfx')


if __name__ == '__main__':
    unittest.main()
