import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";
import "@/components/LevelCard.css";

const LevelingCard = ({ level, currentXP, nextLevelXp, totalXP }) => {
  const { t } = useLanguage();
  const [prevLevel, setPrevLevel] = useState(level);
  const [isLevelUp, setIsLevelUp] = useState(false);
  const [isMilestone, setIsMilestone] = useState(false);
  const [isMajorMilestone, setIsMajorMilestone] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [localLevel, setLocalLevel] = useState(level);
  const [localCurrentXP, setLocalCurrentXP] = useState(currentXP);
  const [localNextLevelXp, setLocalNextLevelXp] = useState(nextLevelXp);
  const [localTotalXP, setLocalTotalXP] = useState(totalXP);
  const progressRef = useRef(null);

  // Check if in development mode
  useEffect(() => {
    const checkDevMode = async () => {
      try {
        const isDevMode = await window.electron.isDev();
        setIsDev(isDevMode);
      } catch (error) {
        console.error("Error checking dev mode:", error);
        setIsDev(false);
      }
    };

    checkDevMode();
  }, []);

  // Update local state when props change
  useEffect(() => {
    setLocalLevel(level);
    setLocalCurrentXP(currentXP);
    setLocalNextLevelXp(nextLevelXp);
    setLocalTotalXP(totalXP);
  }, [level, currentXP, nextLevelXp, totalXP]);

  // Calculate progress percentage with safeguards
  const progressPercentage = (() => {
    // Handle special cases
    if (localLevel >= 999) return 100; // Max level always shows 100%

    // Handle undefined/null/invalid values
    const safeCurrentXP = Number(localCurrentXP) || 0;
    const safeNextLevelXp = Number(localNextLevelXp) || 1;

    if (safeNextLevelXp <= 0) {
      console.warn("LevelingCard: Invalid nextLevelXp value:", localNextLevelXp);
      return 0; // Prevent division by zero
    }

    // Normal case: calculate percentage with a cap at 100%
    const percentage = Math.min((safeCurrentXP / safeNextLevelXp) * 100, 100);

    // Debug logging
    console.log("LevelingCard Progress:", {
      currentXP: safeCurrentXP,
      nextLevelXp: safeNextLevelXp,
      percentage: percentage.toFixed(2) + "%",
    });

    return percentage;
  })();

  // Format large numbers for display with improved readability
  const formatNumber = num => {
    // Ensure we're working with a valid number
    if (num === undefined || num === null || isNaN(num)) {
      return "0";
    }

    // Convert to integer to avoid decimal places and scientific notation
    const safeNum = Math.round(Number(num));

    // Format based on magnitude
    if (safeNum >= 1000000) {
      return `${(safeNum / 1000000).toFixed(1)}M`.replace(".0", "");
    } else if (safeNum >= 1000) {
      return `${(safeNum / 1000).toFixed(1)}K`.replace(".0", "");
    }

    // For smaller numbers, use simple formatting without decimals
    return safeNum.toLocaleString();
  };

  // Check for level up animation
  useEffect(() => {
    if (localLevel > prevLevel) {
      setIsLevelUp(true);
      setTimeout(() => setIsLevelUp(false), 2000);
    }

    // Check if current level is a milestone (multiple of 10)
    setIsMilestone(localLevel % 10 === 0 && localLevel > 0);

    // Check if current level is a major milestone (100, 200, etc.)
    setIsMajorMilestone(localLevel % 100 === 0 && localLevel > 0);

    setPrevLevel(localLevel);
  }, [localLevel, prevLevel]);

  // Generate the appropriate badge class based on level
  const getBadgeClass = () => {
    if (localLevel >= 100) {
      return "legendary-badge";
    } else if (localLevel >= 50) {
      return "epic-badge";
    } else if (localLevel >= 20) {
      return "rare-badge";
    } else {
      return "common-badge";
    }
  };

  // Get level-specific color scheme
  const getLevelColorScheme = () => {
    // Base colors for different level ranges
    if (localLevel >= 100) {
      return {
        primary: "from-yellow-400 via-amber-500 to-yellow-600",
        secondary: "from-amber-300 to-yellow-500",
        glow: "rgba(255, 215, 0, 0.6)",
        text: "text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600",
      };
    } else if (localLevel >= 90) {
      return {
        primary: "from-violet-500 via-purple-500 to-fuchsia-500",
        secondary: "from-fuchsia-400 to-violet-600",
        glow: "rgba(167, 139, 250, 0.6)",
        text: "text-violet-500",
      };
    } else if (localLevel >= 80) {
      return {
        primary: "from-purple-500 via-fuchsia-500 to-pink-500",
        secondary: "from-fuchsia-400 to-purple-600",
        glow: "rgba(186, 104, 200, 0.6)",
        text: "text-fuchsia-500",
      };
    } else if (localLevel >= 70) {
      return {
        primary: "from-indigo-500 via-blue-500 to-sky-500",
        secondary: "from-blue-400 to-indigo-600",
        glow: "rgba(99, 102, 241, 0.6)",
        text: "text-indigo-500",
      };
    } else if (localLevel >= 60) {
      return {
        primary: "from-blue-500 via-sky-500 to-cyan-500",
        secondary: "from-sky-400 to-blue-600",
        glow: "rgba(56, 189, 248, 0.6)",
        text: "text-blue-500",
      };
    } else if (localLevel >= 50) {
      return {
        primary: "from-cyan-500 via-teal-500 to-emerald-500",
        secondary: "from-teal-400 to-cyan-600",
        glow: "rgba(20, 184, 166, 0.6)",
        text: "text-teal-500",
      };
    } else if (localLevel >= 40) {
      return {
        primary: "from-emerald-500 via-green-500 to-lime-500",
        secondary: "from-green-400 to-emerald-600",
        glow: "rgba(16, 185, 129, 0.6)",
        text: "text-emerald-500",
      };
    } else if (localLevel >= 30) {
      return {
        primary: "from-lime-500 via-yellow-500 to-amber-500",
        secondary: "from-yellow-400 to-lime-600",
        glow: "rgba(234, 179, 8, 0.6)",
        text: "text-yellow-500",
      };
    } else if (localLevel >= 20) {
      return {
        primary: "from-amber-500 via-orange-500 to-red-500",
        secondary: "from-orange-400 to-amber-600",
        glow: "rgba(245, 158, 11, 0.6)",
        text: "text-amber-500",
      };
    } else if (localLevel >= 10) {
      return {
        primary: "from-red-500 via-rose-500 to-pink-500",
        secondary: "from-rose-400 to-red-600",
        glow: "rgba(244, 63, 94, 0.6)",
        text: "text-rose-500",
      };
    } else {
      return {
        primary: "from-indigo-500 via-purple-500 to-pink-500",
        secondary: "from-purple-400 to-indigo-600",
        glow: "rgba(129, 140, 248, 0.6)",
        text: "text-indigo-500",
      };
    }
  };

  // Get tier-specific effect based on level range
  const getTierEffect = () => {
    // Effects for each 10-level tier
    if (localLevel >= 100) {
      return "legendary-effect";
    } else if (localLevel >= 90) {
      return "cosmic-effect";
    } else if (localLevel >= 80) {
      return "aurora-effect";
    } else if (localLevel >= 70) {
      return "nebula-effect";
    } else if (localLevel >= 60) {
      return "ocean-effect";
    } else if (localLevel >= 50) {
      return "crystal-effect";
    } else if (localLevel >= 40) {
      return "nature-effect";
    } else if (localLevel >= 30) {
      return "solar-effect";
    } else if (localLevel >= 20) {
      return "fire-effect";
    } else if (localLevel >= 10) {
      return "energy-effect";
    } else {
      return "novice-effect";
    }
  };

  // Dev mode handlers for adjusting levels
  const handleAddLevel = amount => {
    const newLevel = localLevel + amount;
    setLocalLevel(newLevel);

    // Simulate XP changes
    const newNextLevelXp = Math.floor(100 * Math.pow(1.2, newLevel - 1));
    setLocalNextLevelXp(newNextLevelXp);
    setLocalCurrentXP(Math.floor(newNextLevelXp * 0.3)); // Set to 30% of next level for testing
    setLocalTotalXP(localTotalXP + amount * 100); // Add some XP for each level
  };

  const handleRemoveLevel = amount => {
    const newLevel = Math.max(1, localLevel - amount);
    setLocalLevel(newLevel);

    // Simulate XP changes
    const newNextLevelXp = Math.floor(100 * Math.pow(1.2, newLevel - 1));
    setLocalNextLevelXp(newNextLevelXp);
    setLocalCurrentXP(Math.floor(newNextLevelXp * 0.7)); // Set to 70% of next level for testing
    setLocalTotalXP(Math.max(0, localTotalXP - amount * 100)); // Remove some XP for each level
  };

  const colorScheme = getLevelColorScheme();
  const tierEffect = getTierEffect();

  return (
    <Card
      className={`border-border bg-card/50 backdrop-blur transition-all duration-500 ${isMajorMilestone ? "major-milestone" : ""} ${localLevel >= 100 ? "legendary-card" : ""}`}
    >
      <CardHeader>
        <CardTitle
          className={`flex items-center gap-2 ${localLevel >= 100 ? colorScheme.text : ""}`}
        >
          {t("ascend.profile.yourLevel")}
        </CardTitle>
        <CardDescription>{t("profile.levelProgress")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <AnimatePresence>
            <motion.div
              className={`relative flex items-center justify-center ${getBadgeClass()} ${tierEffect}`}
              initial={{ scale: 1 }}
              animate={{
                scale: isLevelUp ? [1, 1.2, 1] : 1,
                rotate: isLevelUp ? [0, 10, -10, 0] : 0,
              }}
              transition={{
                duration: isLevelUp ? 0.5 : 0.3,
                type: "spring",
                stiffness: 260,
                damping: 20,
              }}
            >
              {/* Level badge container */}
              <div className="relative flex h-24 w-24 items-center justify-center overflow-visible">
                {/* Base circle */}
                <div className="absolute inset-0 z-0 rounded-full bg-background"></div>

                {/* Animated gradient rings */}
                <motion.div
                  className={`absolute inset-0 rounded-full bg-gradient-to-tr ${colorScheme.primary} z-1 opacity-20`}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                ></motion.div>

                <motion.div
                  className={`absolute inset-0 rounded-full bg-gradient-to-bl ${colorScheme.secondary} z-1 opacity-10`}
                  animate={{ rotate: -360 }}
                  transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                ></motion.div>
                {/* Milestone effects */}
                {isMilestone && (
                  <motion.div
                    className="absolute inset-[-8px] rounded-full"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity: [0, 0.8, 0],
                      scale: [0.8, 1.2, 1.4],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatType: "loop",
                      ease: "easeOut",
                    }}
                    style={{
                      background: `radial-gradient(circle, ${colorScheme.glow} 0%, rgba(255,255,255,0) 70%)`,
                    }}
                  />
                )}

                {/* Major milestone effects (level 100+) */}
                {isMajorMilestone && (
                  <>
                    <motion.div
                      className="absolute inset-[-12px] overflow-hidden rounded-full"
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: [0, 0.6, 0],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        repeatType: "loop",
                        ease: "easeInOut",
                      }}
                      style={{
                        background:
                          "radial-gradient(circle, rgba(255,215,0,0.6) 0%, rgba(255,215,0,0) 70%)",
                        filter: "blur(1.5px)",
                      }}
                    />
                    <motion.div
                      className="absolute inset-[-4px] overflow-hidden rounded-full"
                      animate={{
                        boxShadow: [
                          "0 0 10px rgba(255,215,0,0.5)",
                          "0 0 20px rgba(255,215,0,0.8)",
                          "0 0 10px rgba(255,215,0,0.5)",
                        ],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        repeatType: "mirror",
                        ease: "easeInOut",
                      }}
                      style={{
                        border: "2px solid rgba(255,215,0,0.6)",
                        filter: "blur(0.5px)",
                      }}
                    />
                  </>
                )}

                {/* Inner content area */}
                <div className="absolute inset-1 z-10 flex items-center justify-center rounded-full bg-background">
                  <motion.span
                    className={`text-3xl font-bold ${colorScheme.text}`}
                    key={localLevel}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    {localLevel}
                  </motion.span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex-1 space-y-4">
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">{formatNumber(localCurrentXP)} XP</span>
                <span className="text-muted-foreground">
                  {formatNumber(localNextLevelXp)} XP
                </span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted/30">
                <motion.div
                  ref={progressRef}
                  className={`flex h-full rounded-full bg-gradient-to-r ${colorScheme.primary}`}
                  initial={{ width: "0%" }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{
                    type: "spring",
                    stiffness: 50,
                    damping: 20,
                  }}
                >
                  <div className="relative h-full w-full">
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent"></div>
                    <motion.div
                      className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.1)_10px,rgba(255,255,255,0.1)_20px)]"
                      animate={{ x: ["-100%", "0%"] }}
                      transition={{
                        duration: 15,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    ></motion.div>
                  </div>
                </motion.div>
                <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/5"></div>
              </div>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t("profile.totalXP", { xp: formatNumber(localTotalXP) })}</span>
              <span>{t("profile.nextLevel", { level: localLevel + 1 })}</span>
            </div>

            {/* Developer controls */}
            {isDev && (
              <div className="mt-4 border-t border-border/30 pt-4">
                <p className="mb-2 text-xs font-medium text-yellow-500">
                  Developer Controls
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => handleRemoveLevel(10)}
                  >
                    <Minus className="mr-1 h-3 w-3" /> 10
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => handleRemoveLevel(1)}
                  >
                    <Minus className="mr-1 h-3 w-3" /> 1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => handleAddLevel(1)}
                  >
                    <Plus className="mr-1 h-3 w-3" /> 1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => handleAddLevel(10)}
                  >
                    <Plus className="mr-1 h-3 w-3" /> 10
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LevelingCard;
