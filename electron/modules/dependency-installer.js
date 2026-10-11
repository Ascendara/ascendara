const { spawn } = require("child_process");

// Windows Installer success, restart, and existing-version results, including
// HRESULT_FROM_WIN32(ERROR_PRODUCT_VERSION) returned by VC++ bootstrap installers.
function isSuccessfulDependencyExit(code) {
  return [0, 1638, 1641, 3010, 0x80070666].includes(code >>> 0) && code != null;
}

function runDependencyInstaller(installerPath, spawnProcess = spawn) {
  const quote = value => `'${value.replace(/'/g, "''")}'`;
  const isMsi = installerPath.toLowerCase().endsWith(".msi");
  const command = isMsi
    ? `Start-Process -FilePath 'msiexec.exe' -ArgumentList ${quote(`/i "${installerPath}" /passive /norestart`)} -Verb RunAs -Wait -PassThru -ErrorAction Stop`
    : `Start-Process -FilePath ${quote(installerPath)} -Verb RunAs -Wait -PassThru -ErrorAction Stop`;
  const script = `try { $installer = ${command}; exit $installer.ExitCode } catch { exit 1 }`;

  return new Promise((resolve, reject) => {
    const child = spawnProcess(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      { windowsHide: true, stdio: "ignore" }
    );
    child.once("error", reject);
    child.once("exit", code => {
      if (isSuccessfulDependencyExit(code)) resolve();
      else reject(new Error(`Dependency installer exited with code ${code}`));
    });
  });
}

module.exports = { isSuccessfulDependencyExit, runDependencyInstaller };
