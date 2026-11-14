export const SIDE_SCROLLBAR_CLASS = "custom-scrollbar";
export const LEGACY_SIDE_SCROLLBAR_KEY = "sideScrollBar";

export function applySideScrollbarPreference(rootElement, enabled) {
  if (!rootElement?.classList) return;
  rootElement.classList.toggle(SIDE_SCROLLBAR_CLASS, Boolean(enabled));
}

export function readLegacySideScrollbarPreference(storage) {
  try {
    const value = storage?.getItem?.(LEGACY_SIDE_SCROLLBAR_KEY);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    // Legacy storage is optional; authoritative settings still load normally.
  }
  return null;
}

export function clearLegacySideScrollbarPreference(storage) {
  try {
    storage?.removeItem?.(LEGACY_SIDE_SCROLLBAR_KEY);
  } catch {
    // Best-effort cleanup after the authoritative setting has already saved.
  }
}

export async function migrateLegacySideScrollbarPreference(storage, persist) {
  const value = readLegacySideScrollbarPreference(storage);
  if (value === null) return null;

  let persisted = false;
  try {
    persisted = Boolean(await persist(value));
  } catch {
    // Keep the legacy value so a later launch can retry the migration.
  }

  if (persisted) clearLegacySideScrollbarPreference(storage);

  return { value, persisted };
}
