const LEVEL_XP_BASE = 50;
const MAX_PROFILE_LEVEL = 999;

const XP_RULES = {
  basePerGame: 100,
  perHourPlayed: 50,
  perLaunch: 10,
  launchBonusCap: 100,
  completedBonus: 150,
  playtimeMilestones: [
    { hours: 25, bonus: 100 },
    { hours: 50, bonus: 200 },
    { hours: 100, bonus: 300 },
    { hours: 200, bonus: 500 },
    { hours: 500, bonus: 1000 },
  ],
};

const DEBUG_XP = false;

export const calculateLevelFromXP = totalXP => {
  const normalizedXP = typeof totalXP === "number" ? totalXP : 0;

  if (DEBUG_XP) {
    console.log("[LevelCalc] Input XP:", totalXP, "Normalized:", normalizedXP);
  }

  const rawLevel = 1 + Math.sqrt(normalizedXP / LEVEL_XP_BASE) * 1.5;
  let level = Math.max(1, Math.floor(rawLevel));
  level = Math.min(level, MAX_PROFILE_LEVEL);

  if (DEBUG_XP) {
    console.log("[LevelCalc] Raw level:", rawLevel, "Final level:", level);
  }

  if (level >= MAX_PROFILE_LEVEL) {
    return {
      level: MAX_PROFILE_LEVEL,
      xp: normalizedXP,
      currentXP: 100,
      nextLevelXp: 100,
    };
  }

  const xpForCurrentLevel =
    level <= 1 ? 0 : LEVEL_XP_BASE * Math.pow((level - 1) / 1.5, 2);
  const xpForNextLevel = LEVEL_XP_BASE * Math.pow(level / 1.5, 2);
  const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
  const currentLevelProgress = Math.max(0, normalizedXP - xpForCurrentLevel);

  if (DEBUG_XP) {
    console.log("[LevelCalc] XP for current level:", xpForCurrentLevel);
    console.log("[LevelCalc] XP for next level:", xpForNextLevel);
    console.log("[LevelCalc] XP needed for next level:", xpNeededForNextLevel);
    console.log("[LevelCalc] Current level progress:", currentLevelProgress);
  }

  return {
    level,
    xp: normalizedXP,
    currentXP: currentLevelProgress,
    nextLevelXp: xpNeededForNextLevel,
  };
};

export const getLevelConstants = () => ({
  LEVEL_XP_BASE,
  MAX_PROFILE_LEVEL,
  XP_RULES,
});

export const formatNumber = num => {
  if (num === undefined || num === null || isNaN(num)) {
    return "0";
  }

  const safeNum = Math.round(Number(num));

  if (safeNum >= 1000000) {
    return `${(safeNum / 1000000).toFixed(1)}M`.replace(".0", "");
  } else if (safeNum >= 1000) {
    return `${(safeNum / 1000).toFixed(1)}K`.replace(".0", "");
  }

  return safeNum.toLocaleString();
};
