/**
 * Verify, install and clean up a finished FitGirl pack. Every step logs with
 * [autoinstall]; a failure stops the chain and returns the reason so the UI can
 * fall back to the manual "Run Installer as Admin" card.
 */
const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const fitgirl = require("./fitgirlInstall");
const {
  buildTakeoverScript,
  parseTakeoverResult,
  extraOk,
} = require("./fitgirlTakeover");

const UAC_DECLINED = 1223;
const log = (...args) => console.log("[autoinstall]", ...args);

/**
 * Run setup.exe elevated with arguments and wait; resolves the exit code or null.
 * The path and arguments reach PowerShell through environment variables, so no
 * game name or path is ever parsed as script text.
 */
function runElevatedSetup(installerPath, args, spawnProcess = spawn) {
  for (const value of [installerPath, ...args]) {
    if ([...String(value)].some(char => char < " " || char === "\u007f")) {
      return Promise.reject(new Error("Installer path has control characters"));
    }
  }
  const script =
    "try { $p = Start-Process -FilePath $env:ASCENDARA_FG_SETUP " +
    "-ArgumentList ($env:ASCENDARA_FG_ARGS -split [char]10) " +
    "-Verb RunAs -Wait -PassThru -ErrorAction Stop; " +
    "if ($null -eq $p.ExitCode) { exit 259 } else { exit $p.ExitCode } } " +
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
      {
        windowsHide: true,
        stdio: "ignore",
        env: {
          ...process.env,
          ASCENDARA_FG_SETUP: installerPath,
          ASCENDARA_FG_ARGS: args.join("\n"),
        },
      }
    );
    child.once("error", reject);
    // 259 means PowerShell could not read the code through elevation.
    child.once("exit", code => resolve(code === 259 ? null : code));
  });
}

const encodePs = script => Buffer.from(script, "utf16le").toString("base64");

/**
 * Silent takeover: one UAC prompt runs the takeover script elevated (see
 * fitgirlTakeover.js). Resolves { code, result }: code 1223 when the prompt was
 * declined, result null when the script left no readable result file.
 */
async function runElevatedTakeover(
  installerPath,
  args,
  { logPath, resultPath, installDir, redists, hostsRedirect },
  { spawnProcess = spawn, fsApi = fs } = {}
) {
  for (const value of [installerPath, ...args, logPath, resultPath, installDir]) {
    if ([...String(value)].some(char => char < " " || char === "\u007f")) {
      throw new Error("Installer path has control characters");
    }
  }
  const inner = encodePs(
    buildTakeoverScript({
      setup: installerPath,
      args,
      logPath,
      resultPath,
      installDir,
      redists,
      hostsRedirect,
    })
  );
  // The outer, non-elevated shell only forwards the inner command (base64 text).
  const outer =
    "try { $p = Start-Process -FilePath 'powershell.exe' -ArgumentList " +
    "('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ' + $env:ASCENDARA_FG_TAKEOVER) " +
    "-Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop; exit 0 } " +
    `catch { exit ${UAC_DECLINED} }`;
  try {
    fsApi.removeSync(resultPath);
  } catch {}
  const code = await new Promise((resolve, reject) => {
    const child = spawnProcess(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePs(outer)],
      {
        windowsHide: true,
        stdio: "ignore",
        env: { ...process.env, ASCENDARA_FG_TAKEOVER: inner },
      }
    );
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code === UAC_DECLINED) return { code, result: null };
  try {
    return { code, result: parseTakeoverResult(fsApi.readFileSync(resultPath, "utf8")) };
  } catch {
    return { code, result: null };
  }
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
 *         runTakeover, completeInstall, onStage, signal }
 * Resolves { success, stage, error?, verify?, removed?, cleanupErrors? }.
 */
async function runAutoInstall({
  gameDirectory,
  gameName,
  installerPath,
  options,
  fsApi = fs,
  runSetup = runElevatedSetup,
  runTakeover = runElevatedTakeover,
  completeInstall,
  onStage = () => {},
  signal,
}) {
  let stage = "checking";
  const fail = error => {
    log(`${gameName}: failed while ${stage}: ${error}`);
    onStage({ stage: "failed", failedStage: stage, error });
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
    const logPath = path.join(packDir, "ascendara-install.log");
    const args = fitgirl.buildSetupArgs({
      silent: options.silent,
      limitRam: options.limitRam,
      installDir,
      logPath,
    });
    onStage({ stage });
    // Silent setup is taken over so FitGirl's Run entries never start; a visible
    // wizard (silent off or the RAM limit) shows FitGirl's own finish checkboxes.
    const takeover = args.includes("/SILENT");
    let takeoverResult;
    if (takeover) {
      log(`${gameName}: silent takeover into ${installDir}`);
      const { code, result } = await runTakeover(installerPath, args, {
        logPath,
        resultPath: path.join(packDir, "ascendara-install-result.json"),
        installDir,
        redists: options.redists === true,
        hostsRedirect: options.hostsRedirect === true,
      });
      if (code === UAC_DECLINED) return fail("The admin prompt was declined");
      if (!result) return fail("Setup gave no result");
      log(
        `${gameName}: takeover succeeded ${result.succeeded}, killed after success ` +
          `${result.killedAfterSuccess}, run entry started ${result.runEntrySeen}, ` +
          `exit code ${result.exitCode}, temp ${result.tempDir}`
      );
      for (const extra of result.extras) {
        log(
          `${gameName}: extra ${extra.name} ${extra.error || `exit ${extra.exitCode}`}`
        );
      }
      if (result.error) return fail(`Setup script failed: ${result.error}`);
      if (!result.succeeded) {
        return fail(`Setup exited with code ${result.exitCode ?? "unknown"}`);
      }
      takeoverResult = result;
    } else {
      log(`${gameName}: running setup with its window into ${installDir}`);
      const code = await runSetup(installerPath, args);
      log(`${gameName}: setup exit code ${code === null ? "unknown" : code}`);
      if (code === UAC_DECLINED) return fail("The admin prompt was declined");
      if (code !== null && code !== 0) return fail(`Setup exited with code ${code}`);
    }
    if (!hasExe(installDir, fsApi)) return fail(`No game found in ${installDir}`);

    const completed = await completeInstall();
    if (!completed?.success) return fail(completed?.error || "Could not finish install");

    const result = {
      success: true,
      stage: "done",
      verify,
      takeover: takeoverResult,
      extrasFailed: (takeoverResult?.extras || []).filter(extra => !extraOk(extra)),
      removed: [],
      cleanupErrors: [],
    };
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

module.exports = { runAutoInstall, runElevatedSetup, runElevatedTakeover, UAC_DECLINED };
