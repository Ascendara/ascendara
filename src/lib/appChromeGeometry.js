export const MENU_BAR_HEIGHT_PX = 48;

// MenuBar and routed content must consume the same vertical chrome contract.
export const MENU_BAR_HEIGHT_STYLE = Object.freeze({ height: MENU_BAR_HEIGHT_PX });

// Routed pages bring their own top padding, so their offset tucks slightly into
// the menu bar's empty lower edge instead of stacking a full bar height on it.
export const PAGE_CONTENT_TOP_OFFSET_PX = MENU_BAR_HEIGHT_PX - 8;
export const PAGE_CONTENT_TOP_OFFSET_STYLE = Object.freeze({
  height: PAGE_CONTENT_TOP_OFFSET_PX,
});
