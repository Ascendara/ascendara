const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readLinuxMachineId } = require("../electron/modules/core/machine-id.js");

test("the Linux machine id matches node-machine-id's cat | head -n 1", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "machine-id-"));
  const dbus = path.join(dir, "dbus");
  const etc = path.join(dir, "etc");
  const missing = path.join(dir, "missing");
  fs.writeFileSync(etc, "ABCDEF0123456789abcdef0123456789\n");
  fs.writeFileSync(dbus, "11112222333344445555666677778888\nsecond line\n");

  // The dbus copy comes first, only its first line counts, lowercased
  assert.equal(readLinuxMachineId([dbus, etc]), "11112222333344445555666677778888");
  assert.equal(readLinuxMachineId([missing, etc]), "abcdef0123456789abcdef0123456789");
  // Nothing readable: the caller falls back to node-machine-id
  assert.equal(readLinuxMachineId([missing]), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
