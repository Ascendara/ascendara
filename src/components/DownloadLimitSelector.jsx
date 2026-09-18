import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DownloadLimitSelector({
  downloadLimit,
  isDownloaderRunning,
  onChange,
  t,
}) {
  // Local state for value and unit
  const getInitialUnit = val => (val % 1024 === 0 && val !== 0 ? "MB" : "KB");
  const [unit, setUnit] = useState(getInitialUnit(downloadLimit || 0));
  const [value, setValue] = useState(() => {
    if (downloadLimit === 0) return 0;
    return unit === "MB" ? Math.round(downloadLimit / 1024) : downloadLimit;
  });

  // Sync local state if parent changes (e.g. reset)
  useEffect(() => {
    setUnit(getInitialUnit(downloadLimit || 0));
    setValue(() => {
      if (downloadLimit === 0) return 0;
      return getInitialUnit(downloadLimit || 0) === "MB"
        ? Math.round(downloadLimit / 1024)
        : downloadLimit;
    });
    // eslint-disable-next-line
  }, [downloadLimit]);

  // Handle unit switch
  const handleUnitSwitch = newUnit => {
    if (unit === newUnit) return;
    let newValue = value;
    if (newUnit === "MB") {
      // Convert KB to MB
      newValue = Math.max(0, Math.round(value / 1024));
    } else {
      // Convert MB to KB
      newValue = Math.max(0, value * 1024);
    }
    setUnit(newUnit);
    setValue(newValue);
    onChange(newUnit === "MB" ? newValue * 1024 : newValue);
  };

  // Handle manual input
  const handleInputChange = e => {
    let v = e.target.value;
    // Allow empty string for controlled input
    if (v === "") {
      setValue("");
      return;
    }
    v = parseInt(v, 10);
    if (isNaN(v) || v < 0) v = 0;
    setValue(v);
  };

  // Commit value on blur or Enter
  const commitValue = () => {
    let v = value === "" ? 0 : value;
    onChange(unit === "MB" ? v * 1024 : v);
  };

  const handleInputKeyDown = e => {
    if (e.key === "Enter") {
      commitValue();
      e.target.blur();
    }
  };

  // If parent changes, update local value
  useEffect(() => {
    setValue(() => {
      if (downloadLimit === 0) return 0;
      return getInitialUnit(downloadLimit || 0) === "MB"
        ? Math.round(downloadLimit / 1024)
        : downloadLimit;
    });
  }, [downloadLimit, unit]);

  return (
    <div className="mt-2 flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        {/* Unit Toggle to the left of input */}
        <div className="flex items-center gap-1">
          <Button
            variant={unit === "KB" ? "default" : "outline"}
            size="sm"
            onClick={() => handleUnitSwitch("KB")}
            className={`px-2 ${unit === "KB" ? "text-secondary" : "text-primary-foreground"}`}
            disabled={isDownloaderRunning}
          >
            KB/s
          </Button>
          <Button
            variant={unit === "MB" ? "default" : "outline"}
            size="sm"
            onClick={() => handleUnitSwitch("MB")}
            className={`px-2 ${unit === "MB" ? "text-secondary" : "text-primary-foreground"}`}
            disabled={isDownloaderRunning}
          >
            MB/s
          </Button>
        </div>
        <Input
          id="downloadLimit"
          type="number"
          min="0"
          step={unit === "MB" ? 1 : 100}
          value={value}
          onChange={handleInputChange}
          onBlur={commitValue}
          onKeyDown={handleInputKeyDown}
          className="mx-2 w-32"
          disabled={isDownloaderRunning}
        />
        <span className="text-sm text-muted-foreground">{unit}/s</span>
      </div>
    </div>
  );
}
