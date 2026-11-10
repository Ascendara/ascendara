const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { TIMESTAMP_FILE } = require("./config");

// Background helpers also rewrite TIMESTAMP_FILE. Keep setup completion in a
// separate file so their read/modify/write cycles cannot reset onboarding.
const completionFile = path.join(
  path.dirname(TIMESTAMP_FILE),
  "onboarding.ascendara.json",
);
// Used when the home folder refuses writes (EPERM from AV, read-only, etc.)
const fallbackCompletionFile = path.join(
  app.getPath("userData"),
  "onboarding.ascendara.json",
);

function writeCompletion(file) {
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify({ v7: true }));
  fs.renameSync(temporaryFile, file);
}

function completeOnboarding() {
  try {
    writeCompletion(completionFile);
  } catch (error) {
    console.error("Failed to write onboarding completion, using fallback:", error);
    writeCompletion(fallbackCompletionFile);
  }
}

function hasCompletedOnboarding() {
  if (fs.existsSync(completionFile) || fs.existsSync(fallbackCompletionFile)) {
    return true;
  }

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
  fs.rmSync(fallbackCompletionFile, { force: true });
  fs.rmSync(TIMESTAMP_FILE, { force: true });
}

module.exports = {
  completeOnboarding,
  hasCompletedOnboarding,
  resetOnboarding,
};
