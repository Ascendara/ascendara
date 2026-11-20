import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPluginSettings, setPluginSetting } from "@/lib/plugins";

// The options a plugin declares in its manifest's "settings", shown under its
// card. Running plugins hear about changes through ascendara.settings.onChange.
export default function PluginOptions({ plugin }) {
  const schema = plugin.settings || [];
  const [values, setValues] = useState(() => getPluginSettings(plugin.id, schema));
  // Text and numbers save when the field loses focus, not on every key
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    setValues(getPluginSettings(plugin.id, plugin.settings || []));
  }, [plugin.id, plugin.settings]);

  const save = (key, value) => {
    setPluginSetting(plugin.id, key, value);
    setValues(previous => ({ ...previous, [key]: value }));
  };

  const commitDraft = setting => {
    if (!Object.hasOwn(drafts, setting.key)) return;
    let value = drafts[setting.key];
    if (setting.type === "number") {
      value = Number(value);
      if (!Number.isFinite(value)) value = setting.default;
      if (setting.min !== undefined) value = Math.max(setting.min, value);
      if (setting.max !== undefined) value = Math.min(setting.max, value);
    }
    setDrafts(previous => {
      const next = { ...previous };
      delete next[setting.key];
      return next;
    });
    save(setting.key, value);
  };

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-border/60 bg-muted/30 p-4">
      {schema.map(setting => {
        const inputId = `plugin-${plugin.id}-${setting.key}`;
        const description = setting.description && (
          <p className="text-xs text-muted-foreground">{setting.description}</p>
        );

        if (setting.type === "boolean") {
          return (
            <div key={setting.key} className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor={inputId}>{setting.label}</Label>
                {description}
              </div>
              <Switch
                id={inputId}
                checked={values[setting.key] === true}
                onCheckedChange={checked => save(setting.key, checked)}
              />
            </div>
          );
        }

        if (setting.type === "select") {
          return (
            <div key={setting.key} className="space-y-1.5">
              <Label htmlFor={inputId}>{setting.label}</Label>
              {description}
              <Select
                value={String(values[setting.key])}
                onValueChange={value => save(setting.key, value)}
              >
                <SelectTrigger id={inputId} className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {setting.options.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        return (
          <div key={setting.key} className="space-y-1.5">
            <Label htmlFor={inputId}>{setting.label}</Label>
            {description}
            <Input
              id={inputId}
              type={setting.type === "number" ? "number" : "text"}
              min={setting.min}
              max={setting.max}
              placeholder={setting.placeholder || undefined}
              className={setting.type === "number" ? "max-w-[10rem]" : ""}
              value={
                Object.hasOwn(drafts, setting.key)
                  ? drafts[setting.key]
                  : String(values[setting.key] ?? "")
              }
              onChange={event =>
                setDrafts(previous => ({
                  ...previous,
                  [setting.key]: event.target.value,
                }))
              }
              onBlur={() => commitDraft(setting)}
              onKeyDown={event => {
                if (event.key === "Enter") commitDraft(setting);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
