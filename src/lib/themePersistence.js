export async function persistThemeSelection(
  newTheme,
  { persist, clearCustomTheme, applyTheme, syncSettings }
) {
  const success = await persist(newTheme);
  if (!success) return false;

  if (newTheme !== "custom") clearCustomTheme();
  applyTheme(newTheme);
  syncSettings(newTheme);
  return true;
}
