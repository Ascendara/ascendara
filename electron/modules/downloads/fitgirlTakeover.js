/**
 * Silent FitGirl takeover, pure parts. FitGirl's [Run] entries (QuickSFV,
 * DirectX, VC++ redists, a website, a hosts edit) all run under /SILENT and
 * have no switch. One elevated PowerShell script starts setup, watches its log,
 * kills setup right after "Installation process succeeded." so no Run entry
 * starts, runs only the extras the user turned on, and writes a JSON result.
 * Paths and options reach the script as base64 JSON, never as script text.
 */
const SUCCESS_LINE = "Installation process succeeded.";
const TEMP_DIR_LINE = "Created temporary directory:";
const RUN_ENTRY_LINE = "-- Run entry --";

// Name, file to check, program, arguments. Order follows FitGirl's [Run] list.
const REDISTS = [
  ["dxwebsetup", "dxwebsetup.exe", "/Q"],
  ["vcRedistX86", "vc_redist.x86.exe", "/install /quiet /norestart"],
  ["vcRedistX64", "vc_redist.x64.exe", "/install /quiet /norestart"],
];

// Inno Setup temp folders are named is-XXXXX.tmp; nothing else is ever deleted.
const TEMP_LEAF = "^is-[A-Za-z0-9]+\\.tmp$";

const psQuote = text => `'${String(text).replace(/'/g, "''")}'`;

/**
 * config: { setup, args[], logPath, resultPath, installDir, redists, hostsRedirect }
 * Returns the script text for powershell -EncodedCommand.
 */
function buildTakeoverScript(config) {
  const payload = {
    setup: config.setup,
    args: config.args,
    logPath: config.logPath,
    resultPath: config.resultPath,
    installDir: config.installDir,
  };
  for (const key of Object.keys(payload)) {
    if (!payload[key]) throw new Error(`Takeover needs ${key}`);
  }
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const extras = [];
  if (config.redists) {
    for (const [name, file, args] of REDISTS) {
      extras.push(
        `Run-Extra ${psQuote(name)} (Join-Path $rd ${psQuote(file)}) $null ${psQuote(args)}`
      );
    }
  }
  if (config.hostsRedirect) {
    extras.push(
      "$h=$null; if($r.tempDir){$h=Join-Path $r.tempDir 'host.cmd'}",
      "Run-Extra 'hostsRedirect' $h 'cmd.exe' ('/c \"'+$h+'\"')"
    );
  }
  return [
    "$ErrorActionPreference='Stop'",
    `$c=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json`,
    "$r=[ordered]@{succeeded=$false;killedAfterSuccess=$false;runEntrySeen=$false;exitCode=$null;tempDir=$null;tempDirsRemoved=@();extras=@();error=$null}",
    "function Save-Result{[IO.File]::WriteAllText($c.resultPath,($r|ConvertTo-Json -Depth 4),(New-Object Text.UTF8Encoding $false))}",
    "function Read-Log{if(-not(Test-Path -LiteralPath $c.logPath)){return ''};try{$f=[IO.File]::Open($c.logPath,'Open','Read','ReadWrite, Delete');try{(New-Object IO.StreamReader($f,[Text.Encoding]::UTF8,$true)).ReadToEnd()}finally{$f.Dispose()}}catch{''}}",
    "function Run-Extra($name,$check,$exe,$argList){$e=[ordered]@{name=$name;exitCode=$null;error=$null};try{if(-not $check -or -not(Test-Path -LiteralPath $check)){$e.error='missing'}else{if(-not $exe){$exe=$check};$q=Start-Process -FilePath $exe -ArgumentList $argList -Wait -PassThru -WindowStyle Hidden;$e.exitCode=$q.ExitCode}}catch{$e.error=$_.Exception.Message};$r.extras+=,$e}",
    "try{",
    "if(Test-Path -LiteralPath $c.logPath){Remove-Item -LiteralPath $c.logPath -Force}",
    "$p=Start-Process -FilePath $c.setup -ArgumentList @($c.args) -PassThru;$null=$p.Handle",
    "$own=@{}",
    "while($true){",
    // setup.exe unpacks setup.tmp into its own is-*.tmp folder; remember it to delete later.
    'if(-not $own.Count){Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" -ErrorAction SilentlyContinue|ForEach-Object{if($_.ExecutablePath){$own[(Split-Path -Parent $_.ExecutablePath)]=1}}}',
    "$exited=$p.HasExited;$log=Read-Log",
    `if(-not $r.tempDir -and $log -match '${TEMP_DIR_LINE}\\s*(.+?)\\r?\\n'){$r.tempDir=$Matches[1].Trim()}`,
    `$i=$log.IndexOf('${SUCCESS_LINE}')`,
    "if($i -ge 0){$r.succeeded=$true",
    "if(-not $exited){& taskkill.exe /PID $p.Id /T /F *>$null;$r.killedAfterSuccess=$true;$null=$p.WaitForExit(15000)}",
    `$r.runEntrySeen=(Read-Log).IndexOf('${RUN_ENTRY_LINE}',$i) -ge 0;break}`,
    "if($exited){break}",
    "Start-Sleep -Milliseconds 100}",
    "if($p.HasExited){$r.exitCode=$p.ExitCode}",
    "if($r.succeeded){$rd=Join-Path $c.installDir '_Redist'",
    ...extras,
    "if($r.killedAfterSuccess){foreach($d in @($r.tempDir)+@($own.Keys)){",
    `if($d -and (Split-Path -Leaf $d) -match '${TEMP_LEAF}' -and (Test-Path -LiteralPath $d)){try{Remove-Item -LiteralPath $d -Recurse -Force;$r.tempDirsRemoved+=,$d}catch{}}}}}`,
    "}catch{$r.error=$_.Exception.Message}",
    "Save-Result",
  ].join("\n");
}

/** Read the script's JSON result (PowerShell may add a BOM). Throws when unreadable. */
function parseTakeoverResult(text) {
  const data = JSON.parse(String(text).replace(/^﻿/, ""));
  const list = value => (Array.isArray(value) ? value : value ? [value] : []);
  const number = value => (Number.isInteger(value) ? value : null);
  return {
    succeeded: data.succeeded === true,
    killedAfterSuccess: data.killedAfterSuccess === true,
    runEntrySeen: data.runEntrySeen === true,
    exitCode: number(data.exitCode),
    tempDir: typeof data.tempDir === "string" ? data.tempDir : null,
    tempDirsRemoved: list(data.tempDirsRemoved).map(String),
    extras: list(data.extras).map(item => ({
      name: String(item?.name || ""),
      exitCode: number(item?.exitCode),
      error: item?.error ? String(item.error) : null,
    })),
    error: data.error ? String(data.error) : null,
  };
}

// vc_redist: 1638 = a newer version is installed, 3010 = reboot needed.
const extraOk = extra => !extra.error && [0, 1638, 3010].includes(extra.exitCode);

module.exports = {
  SUCCESS_LINE,
  TEMP_DIR_LINE,
  RUN_ENTRY_LINE,
  REDISTS,
  buildTakeoverScript,
  parseTakeoverResult,
  extraOk,
};
