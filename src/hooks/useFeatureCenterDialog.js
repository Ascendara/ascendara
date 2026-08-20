import { useEffect, useState } from "react";

export function useFeatureCenterDialog(eventName, onOpenEvent) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleOpen = event => {
      onOpenEvent?.(event?.detail || {});
      setOpen(true);
    };

    window.addEventListener(eventName, handleOpen);
    return () => window.removeEventListener(eventName, handleOpen);
  }, [eventName, onOpenEvent]);

  return [open, setOpen];
}
