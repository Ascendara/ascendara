// Switches Windows to a faster power plan while a game is running, and back to
// the previous plan when the last game closes. Windows only.
const POWERCFG = "C:\\Windows\\System32\\powercfg.exe";
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Built-in GUIDs, and names for copies with their own GUID (Ultimate
// Performance is always a copy). Names only match on English Windows.
const PLANS = {
  high: { guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", name: /high performance/i },
  ultimate: { guid: "e9a42b02-d5df-448d-aa00-03f14749eb61", name: /ultimate/i },
};

module.exports = {
  start(ascendara) {
    if (ascendara.platform !== "win32") {
      ascendara.log("Gaming Power Plan only works on Windows");
      return;
    }

    // Plugins restart whenever one is toggled; keep the running games across that
    window.__ascendaraPowerPlan ??= { running: new Set() };
    const { running } = window.__ascendaraPowerPlan;

    async function activePlan() {
      const result = await ascendara.exec(POWERCFG, ["/getactivescheme"]);
      return result.stdout.match(GUID)?.[0] || null;
    }

    async function targetPlan() {
      const custom = String(ascendara.settings.get("customGuid") || "").match(GUID);
      if (custom) return custom[0];
      const wanted = PLANS[ascendara.settings.get("plan")] || PLANS.high;
      const result = await ascendara.exec(POWERCFG, ["/list"]);
      const plans = result.stdout
        .split("\n")
        .map(line => ({ guid: line.match(GUID)?.[0], name: line }))
        .filter(plan => plan.guid);
      const match =
        plans.find(plan => plan.guid.toLowerCase() === wanted.guid) ||
        plans.find(plan => wanted.name.test(plan.name));
      return match?.guid || null;
    }

    async function switchToGaming() {
      const target = await targetPlan();
      if (!target) {
        ascendara.toast(
          "The power plan picked in Gaming Power Plan's options doesn't exist on this PC.",
          "error"
        );
        return;
      }
      const current = await activePlan();
      if (!current || current.toLowerCase() === target.toLowerCase()) return;
      const result = await ascendara.exec(POWERCFG, ["/setactive", target]);
      if (result.code !== 0) {
        ascendara.toast("Couldn't switch the power plan", "error");
        return;
      }
      ascendara.storage.set("previous", current);
    }

    async function restore() {
      const previous = ascendara.storage.get("previous", null);
      if (!previous) return;
      ascendara.storage.remove("previous");
      await ascendara.exec(POWERCFG, ["/setactive", previous]);
    }

    ascendara.games.onLaunch(name => {
      const first = running.size === 0;
      running.add(name);
      if (first)
        switchToGaming().catch(error => ascendara.log("Switching failed", error));
    });

    ascendara.games.onExit(name => {
      running.delete(name);
      if (running.size === 0)
        restore().catch(error => ascendara.log("Restoring failed", error));
    });
  },
};
