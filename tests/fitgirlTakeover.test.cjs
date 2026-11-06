const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTakeoverScript,
  parseTakeoverResult,
  extraOk,
} = require("../electron/modules/downloads/fitgirlTakeover");

const base = {
  setup: "C:\\Games\\Bob's Game'; calc\\setup.exe",
  args: ["/SP-", "/SILENT", '/DIR="C:\\Games\\Bob\'s Game"'],
  logPath: "C:\\Games\\pack\\ascendara-install.log",
  resultPath: "C:\\Games\\pack\\ascendara-install-result.json",
  installDir: "C:\\Games\\Bob's Game",
};

const configOf = script => {
  const encoded = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)[1];
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
};

test("takeover watches the success line, kills setup and reads the temp dir", () => {
  const script = buildTakeoverScript(base);
  assert.match(script, /IndexOf\('Installation process succeeded\.'\)/);
  assert.match(script, /taskkill\.exe \/PID \$p\.Id \/T \/F/);
  assert.match(script, /Created temporary directory:\\s\*\(\.\+\?\)/);
  assert.match(script, /'-- Run entry --'/);
  assert.match(script, /\^is-\[A-Za-z0-9\]\+\\\.tmp\$/);
  assert.match(script, /Save-Result$/);
  // The kill must come before any extra and before the temp dir is removed.
  assert.ok(script.indexOf("taskkill") < script.indexOf("Remove-Item -LiteralPath $d"));
});

test("paths only reach the script as base64 JSON", () => {
  const script = buildTakeoverScript(base);
  assert.equal(script.includes("Bob"), false);
  assert.deepEqual(configOf(script), base);
});

test("only the extras turned on are in the script, in FitGirl's order", () => {
  const none = buildTakeoverScript(base);
  assert.equal(/Run-Extra '/.test(none), false);

  const redists = buildTakeoverScript({ ...base, redists: true });
  const names = [...redists.matchAll(/Run-Extra '(\w+)'/g)].map(m => m[1]);
  assert.deepEqual(names, ["dxwebsetup", "vcRedistX86", "vcRedistX64"]);
  assert.match(redists, /'dxwebsetup\.exe'\) \$null '\/Q'/);
  assert.match(redists, /'vc_redist\.x64\.exe'\) \$null '\/install \/quiet \/norestart'/);
  assert.equal(redists.includes("host.cmd"), false);

  const both = buildTakeoverScript({ ...base, redists: true, hostsRedirect: true });
  const order = [...both.matchAll(/Run-Extra '(\w+)'/g)].map(m => m[1]);
  assert.deepEqual(order, ["dxwebsetup", "vcRedistX86", "vcRedistX64", "hostsRedirect"]);
  assert.match(both, /Join-Path \$r\.tempDir 'host\.cmd'/);
  // Extras run only after setup succeeded, temp dirs go after the extras.
  assert.ok(both.indexOf("if($r.succeeded)") < both.indexOf("Run-Extra 'dxwebsetup'"));
  assert.ok(
    both.indexOf("Run-Extra 'hostsRedirect'") <
      both.indexOf("Remove-Item -LiteralPath $d")
  );
});

test("a missing path stops the script from being built", () => {
  assert.throws(() => buildTakeoverScript({ ...base, logPath: "" }), /logPath/);
});

test("result file parsing tolerates a BOM, single items and junk", () => {
  const result = parseTakeoverResult(
    "\uFEFF" +
      JSON.stringify({
        succeeded: true,
        killedAfterSuccess: true,
        runEntrySeen: false,
        exitCode: 1,
        tempDir: "C:\\T\\is-AB12.tmp",
        tempDirsRemoved: "C:\\T\\is-AB12.tmp",
        extras: { name: "hostsRedirect", exitCode: null, error: "missing" },
        error: null,
      })
  );
  assert.equal(result.succeeded, true);
  assert.equal(result.killedAfterSuccess, true);
  assert.deepEqual(result.tempDirsRemoved, ["C:\\T\\is-AB12.tmp"]);
  assert.deepEqual(result.extras, [
    { name: "hostsRedirect", exitCode: null, error: "missing" },
  ]);
  assert.equal(parseTakeoverResult('{"succeeded":"yes"}').succeeded, false);
  assert.throws(() => parseTakeoverResult("not json"));
});

test("redist exit codes for already installed or reboot count as fine", () => {
  for (const code of [0, 1638, 3010]) assert.equal(extraOk({ exitCode: code }), true);
  assert.equal(extraOk({ exitCode: 1 }), false);
  assert.equal(extraOk({ exitCode: null, error: "missing" }), false);
});
