import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUp,
  ClipboardList,
  Database,
  Globe,
  GripVertical,
  ListOrdered,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { cn } from "@/lib/utils";
import { moveSource, orderedSources } from "@/lib/combinedSources";

const iconOf = entry =>
  entry.official
    ? Database
    : entry.source.isCustomList
      ? ClipboardList
      : entry.source.privateSourceId || entry.source.privateSourceIds
        ? Server
        : Globe;

function SourceRow({ entry, index, count, disabled, onMove, onDragEnd }) {
  const { t } = useLanguage();
  const controls = useDragControls();
  const Icon = iconOf(entry);
  const name = entry.official
    ? t("localRefresh.ascendaraIndex") || "Ascendara Index"
    : entry.source.name || entry.source.url;

  return (
    <Reorder.Item
      value={entry.key}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="flex items-center gap-3 bg-card px-5 py-3"
    >
      <button
        type="button"
        disabled={disabled}
        onPointerDown={event => !disabled && controls.start(event)}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t("externalSources.dragToReorder")}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          entry.official ? "text-primary" : "text-muted-foreground"
        )}
      />
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled || index === 0}
          onClick={() => onMove(entry.key, 0)}
          aria-label={t("externalSources.moveToTop", { name })}
          title={t("externalSources.moveToTop", { name })}
        >
          <ChevronsUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled || index === 0}
          onClick={() => onMove(entry.key, index - 1)}
          aria-label={t("externalSources.moveUp", { name })}
          title={t("externalSources.moveUp", { name })}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled || index === count - 1}
          onClick={() => onMove(entry.key, index + 1)}
          aria-label={t("externalSources.moveDown", { name })}
          title={t("externalSources.moveDown", { name })}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>
    </Reorder.Item>
  );
}

/**
 * The official index and each combined source, arranged by the user. Sources
 * higher up show first in search and on a game's download page.
 */
export default function SourceOrderList({ disabled = false, onChange }) {
  const { t } = useLanguage();
  const { settings, updateSetting } = useSettings();
  const entries = orderedSources(settings);
  const savedKeys = entries.map(entry => entry.key);
  const savedSignature = savedKeys.join("|");
  // Follows the pointer while dragging; saved once the row is dropped
  const [keys, setKeys] = useState(savedKeys);
  const keysRef = useRef(keys);
  const arrange = next => {
    keysRef.current = next;
    setKeys(next);
  };
  useEffect(() => arrange(savedSignature.split("|")), [savedSignature]);

  if (entries.length < 2) return null;
  const byKey = new Map(entries.map(entry => [entry.key, entry]));
  const shown = keys.map(key => byKey.get(key)).filter(Boolean);

  const save = async next => {
    if (next.join("|") === savedSignature) return;
    await updateSetting("sourceOrder", next);
    onChange?.();
  };

  return (
    <section className="overflow-hidden rounded-xl bg-card shadow">
      <div className="flex items-start gap-3 border-b border-border/50 px-5 py-4">
        <ListOrdered className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-0.5">
          <h2 className="mb-0 font-semibold">{t("externalSources.orderTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("externalSources.orderDesc")}
          </p>
        </div>
      </div>
      <Reorder.Group
        axis="y"
        values={keys}
        onReorder={arrange}
        className="divide-y divide-border/50"
      >
        {shown.map((entry, index) => (
          <SourceRow
            key={entry.key}
            entry={entry}
            index={index}
            count={shown.length}
            disabled={disabled}
            onMove={(key, to) => save(moveSource(settings, key, to))}
            onDragEnd={() => save(keysRef.current)}
          />
        ))}
      </Reorder.Group>
    </section>
  );
}
