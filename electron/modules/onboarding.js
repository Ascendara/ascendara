const fs = require("fs");
const path = require("path");
const { TIMESTAMP_FILE } = require("./config");

// Background helpers also rewrite TIMESTAMP_FILE. Keep setup completion in a
// separate file so their read/modify/write cycles cannot reset onboarding.
const completionFile = path.join(
  path.dirname(TIMESTAMP_FILE),
  "onboarding.ascendara.json",
);

function completeOnboarding() {
  const temporaryFile = `${completionFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify({ v7: true }));
  fs.renameSync(temporaryFile, completionFile);
}

function hasCompletedOnboarding() {
  if (fs.existsSync(completionFile)) return true;

  let completed = false;
  try {
    completed = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8")).v7 === true;
  } catch {
    return false;
  }
  if (completed) {
    try {
      completeOnboarding();
    } catch (error) {
      console.error("Failed to migrate onboarding completion:", error);
    }
  }
  return completed;
}

function resetOnboarding() {
  fs.rmSync(completionFile, { force: true });
  fs.rmSync(TIMESTAMP_FILE, { force: true });
}

module.exports = {
  completeOnboarding,
  hasCompletedOnboarding,
  resetOnboarding,
};
