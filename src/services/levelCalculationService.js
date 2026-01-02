const LEVEL_XP_BASE = 1000;
const MAX_PROFILE_LEVEL = 999;

const XP_RULES = {
  basePerGame: 25,
  perHourPlayed: 10,
  perLaunch: 2,
  launchBonusCap: 50,
  completedBonus: 100,
  playtimeMilestones: [
    { hours: 10, bonus: 50 },
    { hours: 25, bonus: 100 },
    { hours: 50, bonus: 250 },
    { hours: 100, bonus: 500 },
  ],
};

const DEBUG_XP = false; // Set to true to enable XP calculation debugging

export const calculateLevelFromXP = totalXP => {
  const normalizedXP = typeof totalXP === "number" ? totalXP : 0;

  const rawLevel = 1 + Math.sqrt(normalizedXP / LEVEL_XP_BASE) * 1.5;
  let level = Math.max(1, Math.floor(rawLevel));
  level = Math.min(level, MAX_PROFILE_LEVEL);

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
