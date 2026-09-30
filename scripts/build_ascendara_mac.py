#!/usr/bin/env python3
"""Build macOS DMG/ZIP artifacts for arm64, x64, or both architectures."""
import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from setup_macos_tools import TOOL_DIR, validate_tool

ROOT = Path(__file__).resolve().parents[1]
HELPERS = (
    'AscendaraDownloader', 'AscendaraGameHandler', 'AscendaraLanguageTranslation',
    'AscendaraLocalRefresh', 'AscendaraTorrentHandler', 'AscendaraNotificationHelper',
)


MACH_ARCH = {'arm64': 'arm64', 'x64': 'x86_64'}
RUST_TARGET = {'arm64': 'aarch64-apple-darwin', 'x64': 'x86_64-apple-darwin'}


def selected_arches(selection):
    if selection == 'both':
        return ['arm64', 'x64']
    if selection != 'host':
        return [selection]
    host = {'arm64': 'arm64', 'x86_64': 'x64'}.get(platform.machine())
    if host is None:
        raise RuntimeError(f'Unsupported build host: {platform.machine()}')
    return [host]


def python_command(arch, executable=None):
    executable = executable or os.environ.get(f'ASCENDARA_MAC_PYTHON_{arch.upper()}', sys.executable)
    return ['/usr/bin/arch', '-' + MACH_ARCH[arch], str(executable)]


def rust_command(tool):
    rustup = shutil.which('rustup')
    if not rustup:
        rustup = next((str(p) for p in (
            Path('/opt/homebrew/opt/rustup/bin/rustup'),
            Path('/usr/local/opt/rustup/bin/rustup')) if p.is_file()), None)
    if rustup:
        return [rustup, 'run', os.environ.get('ASCENDARA_MAC_RUST_TOOLCHAIN', 'stable'), tool]
    return [tool]


def run(args, cwd=ROOT, env=None):
    subprocess.run([str(arg) for arg in args], cwd=cwd, env=env, check=True)


def rust_environment():
    # rustup's Cargo can otherwise find an unrelated Homebrew rustc on PATH.
    sysroot = Path(subprocess.check_output(
        rust_command('rustc') + ['--print', 'sysroot'], text=True).strip())
    binary_dir = sysroot / 'bin'
    return {**os.environ,
            'RUSTC': str(binary_dir / 'rustc'),
            'RUSTDOC': str(binary_dir / 'rustdoc'),
            'PATH': str(binary_dir) + os.pathsep + os.environ.get('PATH', '')}


def preflight(arch):
    errors = []
    if sys.platform != 'darwin':
        return ['Build on macOS; native helper compilation requires the macOS SDK.']
    for command in ('node', 'yarn', 'xcrun', 'lipo'):
        if not shutil.which(command):
            errors.append(f'Missing build dependency: {command}')
    try:
        validate_tool(architecture=MACH_ARCH[arch])
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        errors.append(str(error))
    try:
        actual = subprocess.check_output(python_command(arch) +
            ['-c', 'import platform; print(platform.machine())'], text=True, stderr=subprocess.PIPE).strip()
        if actual != MACH_ARCH[arch]:
            raise RuntimeError(f'Python is running as {actual}')
    except (OSError, RuntimeError, subprocess.CalledProcessError):
        errors.append(f'{arch}: Python must run as {MACH_ARCH[arch]}. Use a universal2 Python from python.org '
                      f'or set ASCENDARA_MAC_PYTHON_{arch.upper()}. Intel builds on Apple Silicon also require Rosetta 2.')
    try:
        libdir = subprocess.check_output(rust_command('rustc') +
            ['--print', 'target-libdir', '--target', RUST_TARGET[arch]], text=True, stderr=subprocess.PIPE).strip()
        if not Path(libdir).is_dir():
            raise RuntimeError('Missing Rust standard library')
    except (OSError, RuntimeError, subprocess.CalledProcessError):
        errors.append(f'{arch}: install Rust with rustup, then run: rustup target add --toolchain stable {RUST_TARGET[arch]}')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arch', choices=('host', 'arm64', 'x64', 'both'), default='host',
                        help='CPU target; both produces separate Apple Silicon and Intel artifacts')
    parser.add_argument('--check', action='store_true', help='Only check prerequisites')
    parser.add_argument('--dir', action='store_true', help='Build an unpacked .app')
    parser.add_argument('--release', action='store_true', help='Require signing and notarization credentials')
    args = parser.parse_args()
    arches = selected_arches(args.arch)
    errors = [error for arch in arches for error in preflight(arch)]
    identity = os.environ.get('ASCENDARA_MAC_SIGN_IDENTITY')
    if args.release:
        if not identity:
            errors.append('Set ASCENDARA_MAC_SIGN_IDENTITY to the installed Developer ID Application identity.')
        if not (all(os.environ.get(k) for k in ('APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID')) or
                all(os.environ.get(k) for k in ('APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'))):
            errors.append('Provide Apple notarization credentials for --release.')
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    if args.check:
        print(f'macOS build prerequisites are available for: {", ".join(arches)}')
        return 0

    # Build the renderer and signature once so both artifacts belong to one release.
    run(['yarn', 'build'])
    shutil.copy2(ROOT / 'build/index.html', ROOT / 'electron/index.html')
    shutil.copytree(ROOT / 'build/assets', ROOT / 'electron/assets', dirs_exist_ok=True)
    run(['node', 'scripts/generate_build_signature.js'])
    for arch in arches:
        build_arch(arch, args, identity)
    print('macOS build complete. Register electron/build-signature.json with your release backend before distribution.')
    return 0


def build_arch(arch, args, identity):
    print(f'Building macOS {arch}...', flush=True)
    staging = ROOT / 'dist' / f'mac-helpers-{arch}'
    staging.mkdir(parents=True, exist_ok=True)
    venv = ROOT / '.build_venv_mac' / arch
    if not (venv / 'bin/python3').exists():
        run(python_command(arch) + ['-m', 'venv', venv])
    python = python_command(arch, venv / 'bin/python3')
    env = {**os.environ, 'ARCHFLAGS': '-arch ' + MACH_ARCH[arch]}
    # Separate caches prevent mixing native libraries between CPU targets.
    env['PYINSTALLER_CONFIG_DIR'] = str(staging / 'pyinstaller-cache')
    run([*python, '-m', 'pip', 'install', 'pyinstaller'], env=env)
    for name in HELPERS:
        run([*python, '-m', 'pip', 'install', '-r', ROOT / 'binaries' / name / 'requirements.txt'], env=env)
    for name in HELPERS:
        command = [*python, '-m', 'PyInstaller', '--onefile', '--noconfirm', '--clean',
                   '--target-arch', MACH_ARCH[arch], '--name', name,
                   '--distpath', staging, '--workpath', staging / 'work', '--specpath', staging / 'spec']
        if identity:
            # Onefile payloads must be signed before they are embedded.
            command += ['--codesign-identity', identity]
        if name in ('AscendaraDownloader', 'AscendaraTorrentHandler'):
            command += ['--add-binary', f'{TOOL_DIR / "7zz"}:.',
                        '--add-data', f'{TOOL_DIR / "License.txt"}:licenses/7zip',
                        '--add-data', f'{TOOL_DIR / "readme.txt"}:licenses/7zip']
        command += [ROOT / 'binaries' / name / 'src' / f'{name}.py']
        run(command, env=env)
    crash = ROOT / 'binaries/AscendaraCrashReporter'
    run(rust_command('cargo') + ['build', '--release', '--locked', '--target', RUST_TARGET[arch], '--target-dir', crash / 'target'],
        cwd=crash, env=rust_environment())
    shutil.copy2(crash / 'target' / RUST_TARGET[arch] / 'release/AscendaraCrashReporter', staging)
    watcher = ROOT / 'binaries/AscendaraAchievementWatcher'
    run(['yarn', 'install', '--frozen-lockfile'], cwd=watcher)
    run(['yarn', 'pkg', 'src/watchdog.js', '--target', f'node18-macos-{arch}',
         '--output', staging / 'AscendaraAchievementWatcher'], cwd=watcher)
    names = [*HELPERS, 'AscendaraCrashReporter', 'AscendaraAchievementWatcher']
    for name in names:
        binary = staging / name
        run(['lipo', binary, '-verify_arch', MACH_ARCH[arch]])
        binary.chmod(0o755)
    config = json.loads((ROOT / 'package.json').read_text())['build']
    config['mac']['extraResources'] = [
        {'from': 'readme/logo/png/ascendara_512x.png', 'to': 'icon.png'},
        {'from': str(TOOL_DIR / 'License.txt'), 'to': 'licenses/7zip/License.txt'},
        {'from': str(TOOL_DIR / 'readme.txt'), 'to': 'licenses/7zip/readme.txt'},
        *({'from': str(staging / name), 'to': name} for name in names),
    ]
    config['mac']['binaries'] = [f'Contents/Resources/{name}' for name in names]
    if identity:
        config['mac']['identity'] = identity
    config['mac']['notarize'] = args.release
    config['forceCodeSigning'] = args.release
    config_path = staging / 'builder.json'
    config_path.write_text(json.dumps(config, indent=2))
    command = ['yarn', 'electron-builder', '--config', config_path, '--mac', f'--{arch}', '--publish', 'never']
    if args.dir:
        command += ['--dir']
    run(command)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (subprocess.CalledProcessError, OSError, RuntimeError) as error:
        print(f'macOS build failed: {error}', file=sys.stderr)
        sys.exit(1)
