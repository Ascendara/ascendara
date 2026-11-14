export const MENU_BAR_MIN_WIDTH_PX = 600;
export const MENU_BAR_BALANCED_WIDTH_PX = 1280;
export const MENU_BAR_FULL_WIDTH_PX = 1536;

export const MENU_BAR_MODE = Object.freeze({
  COMPACT: "compact",
  BALANCED: "balanced",
  FULL: "full",
});

export const MENU_BAR_PRIORITY = Object.freeze({
  CRITICAL: "critical",
  ACTIVITY: "activity",
  SECONDARY: "secondary",
});

const MODE_POLICIES = Object.freeze({
  [MENU_BAR_MODE.COMPACT]: Object.freeze({
    showBrandLabel: false,
    showCriticalLabels: false,
    showActivityLabels: false,
    showBranchIdentity: true,
    showSecondary: false,
    showSecondaryLabels: false,
    showSearchLabel: false,
    showSearchShortcut: false,
  }),
  [MENU_BAR_MODE.BALANCED]: Object.freeze({
    showBrandLabel: true,
    showCriticalLabels: true,
    showActivityLabels: false,
    showBranchIdentity: true,
    showSecondary: true,
    showSecondaryLabels: false,
    showSearchLabel: false,
    showSearchShortcut: true,
  }),
  [MENU_BAR_MODE.FULL]: Object.freeze({
    showBrandLabel: true,
    showCriticalLabels: true,
    showActivityLabels: true,
    showBranchIdentity: true,
    showSecondary: true,
    showSecondaryLabels: true,
    showSearchLabel: true,
    showSearchShortcut: true,
  }),
});

export function getMenuBarMode(width) {
  const safeWidth = Number.isFinite(width) ? Math.max(width, 0) : MENU_BAR_MIN_WIDTH_PX;
  if (safeWidth < MENU_BAR_BALANCED_WIDTH_PX) return MENU_BAR_MODE.COMPACT;
  if (safeWidth < MENU_BAR_FULL_WIDTH_PX) return MENU_BAR_MODE.BALANCED;
  return MENU_BAR_MODE.FULL;
}

export function getMenuBarResponsivePolicyForMode(mode) {
  return MODE_POLICIES[mode] ?? MODE_POLICIES[MENU_BAR_MODE.COMPACT];
}

export function getMenuBarResponsivePolicy(width) {
  return getMenuBarResponsivePolicyForMode(getMenuBarMode(width));
}

export function getMenuBarItemPresentation(width, priority) {
  const policy = getMenuBarResponsivePolicy(width);
  if (priority === MENU_BAR_PRIORITY.SECONDARY) {
    return {
      visible: policy.showSecondary,
      showLabel: policy.showSecondaryLabels,
    };
  }
  if (priority === MENU_BAR_PRIORITY.ACTIVITY) {
    return {
      visible: true,
      showLabel: policy.showActivityLabels,
    };
  }
  return {
    visible: true,
    showLabel: policy.showCriticalLabels,
  };
}
