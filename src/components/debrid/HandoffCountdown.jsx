import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { readRecords } from "@/services/downloads/debridRecords";
import { describeHandoffWait } from "@/services/downloads/handoffCountdown";

// Live "Starting on your PC in N s" line for one torrent record. It reads the record
// every second, since the background hand-off rewrites it between list refreshes.
export default function HandoffCountdown({ storageKey, recordKey, className }) {
  const { t } = useLanguage();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const wait = describeHandoffWait(readRecords(storageKey)[recordKey], now, t);
  if (!wait) return null;
  return (
    <p className={className ?? "text-xs tabular-nums text-muted-foreground"}>
      {wait.text}
    </p>
  );
}
