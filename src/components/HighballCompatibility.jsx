import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  XCircle,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

const TONES = {
  good: {
    className: "text-green-500 bg-green-500/10 ring-green-500/25",
    icon: CheckCircle2,
  },
  info: { className: "text-blue-500 bg-blue-500/10 ring-blue-500/25", icon: HelpCircle },
  warn: {
    className: "text-amber-500 bg-amber-500/10 ring-amber-500/25",
    icon: AlertTriangle,
  },
  bad: { className: "text-red-500 bg-red-500/10 ring-red-500/25", icon: XCircle },
};

const STATUS_TONES = {
  "verified-local": "good",
  community: "good",
  "reported-upstream": "info",
  "blocked-anticheat": "bad",
  "blocked-publisher": "bad",
};

// Whether Highball is bundled never changes while the app runs, so check it once
let supportedPromise = null;
function highballSupported() {
  if (window.electron?.getPlatform?.() !== "darwin") return Promise.resolve(false);
  supportedPromise ??= window.electron
    .highballGetStatus()
    .then(status => !!status?.supported)
    .catch(() => false);
  return supportedPromise;
}

/**
 * Look up a game in highball-db on Apple Silicon Macs where Highball is
 * bundled. Returns undefined while loading and null when nothing is known.
 */
export function useHighballCompat({ steamAppId, title, detail = false, enabled = true }) {
  const [result, setResult] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || (!steamAppId && !title)) {
      setResult(null);
      return;
    }
    highballSupported()
      .then(supported =>
        supported
          ? window.electron.highballDbLookup({ steamAppId, title }, { detail })
          : null
      )
      .then(found => !cancelled && setResult(found || null))
      .catch(() => !cancelled && setResult(null));
    return () => {
      cancelled = true;
    };
  }, [steamAppId, title, detail, enabled]);

  return result;
}

/** Plain-text status, for places like tooltips that bring their own colors. */
export function compatLabel(compat, t) {
  return compat ? describe(compat, t).label : "";
}

function describe(compat, t) {
  if (compat.kind === "curated") {
    return {
      tone: STATUS_TONES[compat.status] || "info",
      label: t(`settings.macCompat.db.status.${compat.status}`, {
        defaultValue: compat.status,
      }),
    };
  }
  return {
    tone: compat.verdict === "good" ? "info" : compat.verdict === "warn" ? "warn" : "bad",
    label: t(`settings.macCompat.db.prediction.${compat.verdict}`),
  };
}

/** Status pill; `short` gives the card-sized label ("Mac: Works"). */
export function HighballCompatBadge({ compat, short = false, className }) {
  const { t } = useLanguage();
  if (!compat) return null;
  const { tone, label: longLabel } = describe(compat, t);
  const { className: toneClass, icon: Icon } = TONES[tone];
  const label = short ? t(`settings.macCompat.db.short.${tone}`) : longLabel;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        toneClass,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}

/** Status, recommended translator, known issues and the source of a lookup. */
export default function HighballCompatibility({ compat }) {
  const { t } = useLanguage();
  if (!compat) return null;

  return (
    <div className="space-y-2">
      <HighballCompatBadge compat={compat} />

      {compat.downloadWarning && (
        <p className="text-xs text-red-500">
          {t(`settings.macCompat.db.warning.${compat.downloadWarning}`)}
        </p>
      )}

      {compat.kind === "curated" && compat.renderer && !compat.downloadWarning && (
        <p className="text-xs text-muted-foreground">
          {t("settings.macCompat.db.recommended", {
            renderer: t(`settings.macCompat.renderers.${compat.renderer}`),
          })}
        </p>
      )}

      {compat.knownIssues?.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {t("settings.macCompat.db.knownIssues", { count: compat.knownIssues.length })}
          </summary>
          <ul className="mt-2 space-y-2">
            {compat.knownIssues.map(issue => (
              <li key={issue.symptom} className="rounded-md bg-muted/50 p-2">
                <p className="font-medium text-foreground">{issue.symptom}</p>
                {issue.fix && <p className="mt-1 text-muted-foreground">{issue.fix}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {compat.kind === "prediction" && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {compat.attribution}
        </p>
      )}

      <button
        type="button"
        onClick={() => window.electron.openURL(compat.url)}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {t("settings.macCompat.db.viewDetails")}
        <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  );
}
