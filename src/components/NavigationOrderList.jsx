import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  AtSign,
  CircleArrowDown,
  GripVertical,
  Home,
  Library,
  Package,
  Search,
  ServerIcon,
  Settings2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { normalizeNavigationOrder } from "@/lib/navigationOrder";

const items = [
  { path: "/", labelKey: "common.home", icon: Home },
  { path: "/search", labelKey: "common.search", icon: Search },
  { path: "/library", labelKey: "common.library", icon: Library },
  { path: "/downloads", labelKey: "common.downloads", icon: CircleArrowDown },
  {
    path: "/debriddownloads",
    labelKey: "debrid.downloadsTitle",
    icon: ServerIcon,
    optional: true,
  },
  { path: "/profile", labelKey: "common.profile", icon: User },
  { path: "/ascend", labelKey: "common.ascend", icon: AtSign },
  {
    path: "/workshopdownloader",
    labelKey: "common.workshopDownloader",
    icon: Package,
    optional: true,
  },
  { path: "/settings", labelKey: "common.preferences", icon: Settings2 },
];

function NavigationOrderRow({ item, index, count, constraintsRef, onMove, onDragEnd }) {
  const { t } = useLanguage();
  const controls = useDragControls();
  const Icon = item.icon;
  const label = t(item.labelKey);

  return (
    <Reorder.Item
      value={item.path}
      dragListener={false}
      dragControls={controls}
      dragConstraints={constraintsRef}
      dragElastic={0}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      className="flex items-center gap-3 px-3 py-2.5"
    >
      <button
        type="button"
        onPointerDown={event => controls.start(event)}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={t("settings.navigationOrderDrag", {
          defaultValue: "Drag to reorder {{name}}",
          name: label,
        })}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {item.optional && (
        <span className="text-xs text-muted-foreground">
          {t("settings.navigationOrderOptional", { defaultValue: "Optional" })}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={index === 0}
          onClick={() => onMove(index, index - 1)}
          aria-label={t("settings.navigationOrderMoveUp", {
            defaultValue: "Move {{name}} up",
            name: label,
          })}
          title={t("settings.navigationOrderMoveUp", {
            defaultValue: "Move {{name}} up",
            name: label,
          })}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={index === count - 1}
          onClick={() => onMove(index, index + 1)}
          aria-label={t("settings.navigationOrderMoveDown", {
            defaultValue: "Move {{name}} down",
            name: label,
          })}
          title={t("settings.navigationOrderMoveDown", {
            defaultValue: "Move {{name}} down",
            name: label,
          })}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>
    </Reorder.Item>
  );
}

export default function NavigationOrderList() {
  const { settings, updateSetting } = useSettings();
  const constraintsRef = useRef(null);
  const savedOrder = normalizeNavigationOrder(settings.navigationOrder);
  const savedSignature = savedOrder.join("|");
  const [order, setOrder] = useState(savedOrder);
  const orderRef = useRef(order);
  const byPath = new Map(items.map(item => [item.path, item]));
  const shown = order.map(path => byPath.get(path)).filter(Boolean);

  const arrange = next => {
    orderRef.current = next;
    setOrder(next);
  };

  useEffect(() => {
    const next = savedSignature.split("|");
    orderRef.current = next;
    setOrder(next);
  }, [savedSignature]);

  const save = next => {
    const normalized = normalizeNavigationOrder(next);
    arrange(normalized);
    if (normalized.join("|") !== savedSignature) {
      updateSetting("navigationOrder", normalized);
    }
  };

  const move = (from, to) => {
    if (to < 0 || to >= shown.length || from === to) return;
    const next = [...orderRef.current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    save(next);
  };

  return (
    <Reorder.Group
      ref={constraintsRef}
      axis="y"
      values={order}
      onReorder={arrange}
      className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/40"
    >
      {shown.map((item, index) => (
        <NavigationOrderRow
          key={item.path}
          item={item}
          index={index}
          count={shown.length}
          constraintsRef={constraintsRef}
          onMove={move}
          onDragEnd={() => save(orderRef.current)}
        />
      ))}
    </Reorder.Group>
  );
}
