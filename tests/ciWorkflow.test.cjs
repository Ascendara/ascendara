const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflow = fs.readFileSync(
  path.join(__dirname, "../.github/workflows/build.yml"),
  "utf8"
);

test("development pull requests and direct pushes run the source-check workflow", () => {
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main, development\]/);
  assert.match(
    workflow,
    /pull_request:\s*\n\s*branches:\s*\[main, development\]/
  );
});

test("the source-check job enforces the JavaScript regression suite", () => {
  const testStep = workflow.indexOf("- run: yarn test");
  const buildStep = workflow.indexOf("- run: yarn build");

  assert.notEqual(testStep, -1, "yarn test must be a PR gate");
  assert.notEqual(buildStep, -1, "yarn build must remain a PR gate");
  assert.ok(testStep < buildStep, "tests should run before the build step");
  assert.match(workflow, /- run: cargo test --locked/);
});
