export const NAVIGATION_EDGE_PADDING_PX = 24;

export const NAVIGATION_COMPACT_ITEM_HEIGHT_PX = 8;
export const NAVIGATION_COMPACT_SEPARATOR_HEIGHT_PX = 12;
export const NAVIGATION_COMPACT_PADDING_Y_PX = 10;

export const NAVIGATION_EXPANDED_ITEM_HEIGHT_PX = 48;
export const NAVIGATION_EXPANDED_SEPARATOR_HEIGHT_PX = 32;
export const NAVIGATION_EXPANDED_PADDING_Y_PX = 12;

export const NAVIGATION_SHELL_BORDER_PX = 1;
export const NAVIGATION_SAFE_GAP_PX = 6;

function shellFootprint(itemHeight, separatorHeight, paddingY) {
  return (
    NAVIGATION_EDGE_PADDING_PX +
    Math.max(itemHeight, separatorHeight) +
    paddingY * 2 +
    NAVIGATION_SHELL_BORDER_PX * 2
  );
}

export const NAVIGATION_COMPACT_FOOTPRINT_PX = shellFootprint(
  NAVIGATION_COMPACT_ITEM_HEIGHT_PX,
  NAVIGATION_COMPACT_SEPARATOR_HEIGHT_PX,
  NAVIGATION_COMPACT_PADDING_Y_PX
);

export const NAVIGATION_EXPANDED_FOOTPRINT_PX = shellFootprint(
  NAVIGATION_EXPANDED_ITEM_HEIGHT_PX,
  NAVIGATION_EXPANDED_SEPARATOR_HEIGHT_PX,
  NAVIGATION_EXPANDED_PADDING_Y_PX
);

// Settings uses a bounded route scrollport. Reserve the largest dock state,
// because a compact dock expands on hover/focus and compact mode can be disabled.
export const NAVIGATION_SETTINGS_SAFE_AREA_PX =
  Math.max(NAVIGATION_COMPACT_FOOTPRINT_PX, NAVIGATION_EXPANDED_FOOTPRINT_PX) +
  NAVIGATION_SAFE_GAP_PX;

export function getNavigationBottomSafeArea(pathname) {
  return pathname === "/settings" ? NAVIGATION_SETTINGS_SAFE_AREA_PX : 0;
}
