/**
 * Verify, install and clean up a finished FitGirl pack. Every step logs with
 * [autoinstall]; a failure stops the chain and returns the reason so the UI can
 * fall back to the manual "Run Installer as Admin" card.
 */
const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const fitgirl = require("./fitgirlInstall");

const UAC_DECLINED = 1223;
const log = (...args) => console.log("[autoinstall]", ...args);

/** Run setup.exe elevated with arguments and wait; resolves the exit code or null. */
function runElevatedSetup(installerPath, args, spawnProcess = spawn) {
  const quote = value => `'${String(value).replace(/'/g, "''")}'`;
  const list = args.map(quote).join(",");
  const script =
    `try { $p = Start-Process -FilePath ${quote(installerPath)} -ArgumentList ${list} ` +
    `-Verb RunAs -Wait -PassThru -ErrorAction Stop; ` +
    `if ($null -eq $p.ExitCode) { exit 259 } else { exit $p.ExitCode } } ` +
    `catch { exit ${UAC_DECLINED} }`;
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
    // 259 means PowerShell could not read the code through elevation.
    child.once("exit", code => resolve(code === 259 ? null : code));
  });
}

const hasExe = (dir, fsApi) => {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let items = [];
    try {
      items = fsApi.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) stack.push(full);
      else if (/\.exe$/i.test(item.name) && !/^unins/i.test(item.name)) return true;
    }
  }
  return false;
};

/**
 * deps: { gameDirectory, gameName, installerPath, options, fsApi, runSetup,
 *         completeInstall, onStage, signal }
 * Resolves { success, stage, error?, verify?, removed?, cleanupErrors? }.
 */
async function runAutoInstall({
  gameDirectory,
  gameName,
  installerPath,
  options,
  fsApi = fs,
  runSetup = runElevatedSetup,
  completeInstall,
  onStage = () => {},
  signal,
}) {
  let stage = "checking";
  const fail = error => {
    log(`${gameName}: failed while ${stage}: ${error}`);
    onStage({ stage: "failed", error });
    return { success: false, stage, error };
  };
  try {
    const packDir = fitgirl.checkInstaller(installerPath, gameDirectory);
    if (!fitgirl.isFitgirlPack(packDir, fsApi)) return fail("Not a FitGirl pack");
    const entries = fitgirl.parseMd5List(
      fsApi.readFileSync(fitgirl.md5ListPath(packDir), "utf8"),
      packDir
    );
    log(`${gameName}: pack ${packDir}, ${entries.length} listed files`);

    let verify;
    if (options.verify) {
      stage = "verifying";
      onStage({ stage, percent: 0 });
      verify = await fitgirl.verifyPack(entries, {
        fsApi,
        signal,
        onProgress: ({ bytesDone, bytesTotal }) =>
          onStage({
            stage,
            percent: bytesTotal ? Math.floor((bytesDone / bytesTotal) * 100) : 100,
          }),
      });
      log(
        `${gameName}: verify passed ${verify.passed.length}, bad ${verify.bad.length}, ` +
          `missing ${verify.missing.length}, skipped ${verify.skipped.length}`
      );
      if (!verify.ok) {
        const names = [...verify.bad, ...verify.missing].slice(0, 5).join(", ");
        return { ...fail(`Files failed the MD5 check: ${names}`), verify };
      }
    }

    stage = "installing";
    fitgirl.checkInstaller(installerPath, gameDirectory);
    if (!fsApi.existsSync(installerPath)) return fail("Installer not found");
    const installDir = fitgirl.chooseInstallDir(gameDirectory, packDir, gameName);
    const args = fitgirl.buildSetupArgs({
      silent: options.silent,
      limitRam: options.limitRam,
      installDir,
      logPath: path.join(packDir, "ascendara-install.log"),
    });
    onStage({ stage });
    log(`${gameName}: running setup into ${installDir}`);
    const code = await runSetup(installerPath, args);
    log(`${gameName}: setup exit code ${code === null ? "unknown" : code}`);
    if (code === UAC_DECLINED) return fail("The admin prompt was declined");
    if (code !== null && code !== 0) return fail(`Setup exited with code ${code}`);
    if (!hasExe(installDir, fsApi)) return fail(`No game found in ${installDir}`);

    const completed = await completeInstall();
    if (!completed?.success) return fail(completed?.error || "Could not finish install");

    const result = { success: true, stage: "done", verify, removed: [], cleanupErrors: [] };
    if (options.deletePack) {
      stage = "cleaning";
      onStage({ stage });
      for (const file of fitgirl.selectCleanup({
        packDir,
        entries,
        installerPath,
        installDir,
        fsApi,
      })) {
        try {
          await fsApi.remove(file);
          result.removed.push(file);
        } catch (error) {
          result.cleanupErrors.push(`${file}: ${error.message}`);
        }
      }
      log(
        `${gameName}: removed ${result.removed.length} pack files, ` +
          `${result.cleanupErrors.length} errors`
      );
    }
    onStage({ stage: "done" });
    log(`${gameName}: done`);
    return result;
  } catch (error) {
    return fail(error.message);
  }
}

module.exports = { runAutoInstall, runElevatedSetup, UAC_DECLINED };
