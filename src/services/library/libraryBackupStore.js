import { create } from "zustand";

// Session state survives dialog dismissal and Library route unmounts.
// The running async batch writes here rather than to a mounted component.
export const useLibraryBackupStore = create((set, get) => ({
  open: false,
  busy: false,
  screen: "backup",
  progress: null,
  results: [],
  setOpen: open => set({ open }),
  setScreen: screen => set({ screen }),
  setProgress: progress => set({ progress }),
  setResults: results => set({ results }),
  begin: (screen, total) => {
    if (get().busy) return false;
    set({ busy: true, screen, results: [], progress: { current: 0, total, game: "" } });
    return true;
  },
  finish: () => set({ busy: false, progress: null }),
}));
