import { useState } from "react";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASCEND_CROWN_URL } from "@/services/ascend/ascendCelebration";

/** The Ascend logo from the website, or a crown when it can't load (offline). */
export default function AscendLogo({ className }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Crown className={cn("text-primary", className)} />;
  return (
    <img
      src={ASCEND_CROWN_URL}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("object-contain", className)}
    />
  );
}
