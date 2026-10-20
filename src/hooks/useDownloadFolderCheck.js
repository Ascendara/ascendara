import { useCallback, useEffect, useRef, useState } from "react";

// Download folder check: basic file operations, then two test files that
// antivirus software often flags in game downloads.
const FILE_COUNT = 2;
const idleChecks = () => ({
  basic: { status: "idle" },
  files: Array.from({ length: FILE_COUNT }, () => ({ status: "idle" })),
});

// The bar eases toward each stage's value; the watch stages last about five
// seconds, so the bar creeps linearly across them instead of jumping.
const watchBar = "[&>div]:duration-[5000ms] [&>div]:ease-linear";
const stepBar = "[&>div]:duration-700";
const STAGES = {
  basic: { value: 12, message: "basic", barClass: stepBar },
  testDownloading: { value: 25, message: "testing", barClass: stepBar },
  testWatching: { value: 50, message: "watching", barClass: watchBar },
  testCleanup: { value: 55, message: "cleanup", barClass: stepBar },
  doubleDownloading: { value: 62, message: "doubleChecking", barClass: stepBar },
  doubleWatching: { value: 92, message: "doubleWatching", barClass: watchBar },
  doubleCleanup: { value: 97, message: "cleanup", barClass: stepBar },
  passed: { value: 100, message: "passed", barClass: stepBar },
  issues: { value: 100, message: "issues", barClass: stepBar },
};

/**
 * Runs the main process download folder check and tracks its progress.
 * state is idle, running or done; stage drives the progress bar and message.
 */
export function useDownloadFolderCheck() {
  const [checks, setChecks] = useState(idleChecks);
  const [state, setState] = useState("idle");
  // Bumped on every run or reset so results from an older run are ignored
  const runRef = useRef(0);

  useEffect(
    () =>
      window.electron.onDownloadDirectoryVerifyProgress(progress => {
        if (progress.runId !== runRef.current) return;
        const check = {
          status: progress.status,
          phase: progress.phase,
          reason: progress.reason,
        };
        setChecks(prev => {
          if (progress.stage === "basic") return { ...prev, basic: check };
          const files = [...prev.files];
          files[progress.index] = check;
          return { ...prev, files };
        });
      }),
    []
  );

  const reset = useCallback(() => {
    runRef.current += 1;
    setChecks(idleChecks());
    setState("idle");
  }, []);

  const run = useCallback(async directory => {
    const runId = ++runRef.current;
    setChecks(idleChecks());
    setState("running");
    try {
      const result = await window.electron.verifyDownloadDirectory(directory, runId);
      if (runId !== runRef.current) return;
      // The final result wins over progress events, in case one went missing
      setChecks({
        basic: {
          status: result.basic.ok ? "ok" : "failed",
          error: result.basic.error,
        },
        files: idleChecks().files.map((_, index) => {
          const file = result.files[index];
          if (!file) return { status: "skipped" };
          return {
            status: file.ok ? "ok" : "failed",
            reason: file.reason,
            error: file.error,
          };
        }),
      });
    } catch (error) {
      if (runId !== runRef.current) return;
      console.error("Failed to check download folder:", error);
      setChecks({
        basic: { status: "failed", error: error.message },
        files: idleChecks().files.map(() => ({ status: "skipped" })),
      });
    } finally {
      if (runId === runRef.current) setState("done");
    }
  }, []);

  const all = [checks.basic, ...checks.files];
  const passed = state === "done" && all.every(check => check.status === "ok");
  const basicFailed = checks.basic.status === "failed";
  // Blocked, removed or locked test files point at an antivirus; a failed
  // download alone only means the check couldn't finish.
  const antivirusIssue = checks.files.some(
    check => check.status === "failed" && check.reason !== "downloadFailed"
  );
  const errors = all
    .map(check => check.error)
    .filter(Boolean)
    .join("\n");

  // The first test file is the test, the second double-checks it.
  const stage = (() => {
    if (state === "done") return STAGES[passed ? "passed" : "issues"];
    if (checks.basic.status !== "ok") return STAGES.basic;
    const index = checks.files.findIndex(check => check.status !== "ok");
    const file = checks.files[index];
    const prefix = index === 0 ? "test" : "double";
    if (!file) return STAGES.doubleCleanup;
    if (file.status !== "running") return STAGES[`${prefix}Downloading`];
    if (file.phase === "watching") return STAGES[`${prefix}Watching`];
    if (file.phase === "cleanup") return STAGES[`${prefix}Cleanup`];
    return STAGES[`${prefix}Downloading`];
  })();

  return { state, stage, passed, basicFailed, antivirusIssue, errors, run, reset };
}
