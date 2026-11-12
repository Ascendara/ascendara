const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const requiredParagraph = [
  "UnRAR source code may be used in any software to handle",
  "RAR archives without limitations free of charge, but cannot be",
  "used to develop RAR (WinRAR) compatible archiver and to",
  "re-create RAR compression algorithm, which is proprietary.",
  "Distribution of modified UnRAR source code in separate form",
  "or as a part of other software is permitted, provided that",
  'full text of this paragraph, starting from "UnRAR source code"',
  "words, is included in license, or in documentation if license",
  "is not available, and in source code comments of resulting package.",
].join(" ");

const normalize = value =>
  value
    .replace(/^\/\/!\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();

test("UnRAR distribution notice is documented and packaged on every platform", () => {
  const notice = fs.readFileSync(
    path.join(root, "THIRD_PARTY_NOTICES.md"),
    "utf8"
  );
  const archiveSource = fs.readFileSync(
    path.join(root, "binaries/AscendaraDownloader/src/archive.rs"),
    "utf8"
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );
  const macBuilder = fs.readFileSync(
    path.join(root, "scripts/build_ascendara_mac.py"),
    "utf8"
  );
  const ciBuild = fs.readFileSync(
    path.join(root, "scripts/ci_build.py"),
    "utf8"
  );
  const releaseWorkflow = fs.readFileSync(
    path.join(root, ".github/workflows/release.yml"),
    "utf8"
  );

  assert.ok(normalize(notice).includes(requiredParagraph));
  assert.ok(normalize(archiveSource).includes(requiredParagraph));

  for (const platform of ["win", "mac", "linux"]) {
    const resources = packageJson.build?.[platform]?.extraResources || [];
    assert.equal(
      resources.some(
        resource =>
          resource.from === "THIRD_PARTY_NOTICES.md" &&
          resource.to === "THIRD_PARTY_NOTICES.md"
      ),
      true,
      platform + " packaging must include THIRD_PARTY_NOTICES.md"
    );
  }

  assert.ok(
    macBuilder.includes(
      "{'from': 'THIRD_PARTY_NOTICES.md', 'to': 'THIRD_PARTY_NOTICES.md'}"
    ),
    "the custom macOS builder must preserve the notice when it replaces extraResources"
  );
  assert.ok(
    ciBuild.includes(
      "Packaged third-party notices missing: THIRD_PARTY_NOTICES.md"
    ),
    "release collection must reject a package that dropped the third-party notice"
  );
  assert.doesNotMatch(
    releaseWorkflow,
    /apt-get install[^\n]*(?:\bunrar\b|\bp7zip-full\b)/,
    "Linux release builds must not install external archive tools the Rust downloader no longer uses"
  );
});
