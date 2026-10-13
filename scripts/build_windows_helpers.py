#!/usr/bin/env python3
"""Compile the Windows helpers required by package.json on a native x64 host.

The historical .bat/.spec files are not in Git; this is the checked-in recipe.
"""
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from build_support import ROOT, validate_resources


def run(args, cwd=ROOT):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def main():
    if sys.platform != 'win32' or platform.machine().lower() not in ('amd64', 'x86_64'):
        raise RuntimeError('Use a native Windows x64 host')
    for command in ('cargo', 'yarn.cmd'):
        if not shutil.which(command):
            raise RuntimeError(f'Missing dependency: {command}')
    seven = Path(os.environ['ProgramFiles']) / '7-Zip'
    for name in ('7z.exe', '7z.dll', 'License.txt'):
        if not (seven / name).is_file():
            raise RuntimeError(f'Install 7-Zip x64: missing {seven / name}')
    names = ('AscendaraDownloader', 'AscendaraGameHandler', 'AscendaraNotificationHelper',
             'AscendaraTorrentHandler')
    venv = ROOT / '.build_venv' / 'Scripts/python.exe'
    run([sys.executable, '-m', 'venv', venv.parent.parent])
    run([venv, '-m', 'pip', 'install', 'pyinstaller==6.16.0'])
    for name in names:
        run([venv, '-m', 'pip', 'install', '-r', ROOT / 'binaries' / name / 'requirements.txt'])
    for name in names:
        folder = ROOT / 'binaries' / name
        command = [venv, '-m', 'PyInstaller', '--onefile', '--noconfirm', '--clean',
                   '--name', name, '--icon', folder / 'src/ascendara.ico',
                   '--distpath', folder / 'dist', '--workpath', folder / 'build',
                   '--specpath', folder / 'build',
                   '--add-data', f'{folder / "src/ascendara.ico"};.']
        if name == 'AscendaraNotificationHelper':
            command += ['--windowed']
        if name in ('AscendaraDownloader', 'AscendaraTorrentHandler'):
            for file in ('7z.exe', '7z.dll'):
                command += ['--add-binary', f'{seven / file};.']
            command += ['--add-data', f'{seven / "License.txt"};licenses/7zip']
        if name == 'AscendaraDownloader':
            command += ['--add-binary', f'{folder / "src/UnRAR.dll"};.', '--hidden-import', 'unrar.unrarlib']
        run([*command, folder / 'src' / f'{name}.py'])
    run(['cargo', 'build', '--release', '--locked'], ROOT / 'binaries/AscendaraCrashReporter')
    watcher = ROOT / 'binaries/AscendaraAchievementWatcher'
    run(['yarn.cmd', 'install', '--frozen-lockfile'], watcher)
    run(['yarn.cmd', 'build-win'], watcher)
    validate_resources('win')


if __name__ == '__main__':
    main()
