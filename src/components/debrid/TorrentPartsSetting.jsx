import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  DEFAULT_TORRENT_PART_MODE,
  TORRENT_PART_MODES,
} from "@/services/downloads/debridParts";

// Settings > Debrid, under the routes line: what to do when a torrent has more than one part.
export default function TorrentPartsSetting() {
  const { settings, setSettings } = useSettings();
  const { t } = useLanguage();
  return (
    <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor="debrid-torrent-parts" className="text-sm">
          {t("debrid.torrentParts.label")}
        </Label>
        <p className="text-xs text-muted-foreground">
          {t("debrid.torrentParts.description")}
        </p>
      </div>
      <Select
        value={settings.debridTorrentParts || DEFAULT_TORRENT_PART_MODE}
        onValueChange={value =>
          setSettings(current => ({ ...current, debridTorrentParts: value }))
        }
      >
        <SelectTrigger id="debrid-torrent-parts" className="w-full bg-background sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TORRENT_PART_MODES.map(mode => (
            <SelectItem key={mode} value={mode}>
              {t(`debrid.torrentParts.${mode}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
