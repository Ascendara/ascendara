import React, { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const WINDOW_SECONDS = 60;
const SAMPLE_MS = 250;
const POINTS = (WINDOW_SECONDS * 1000) / SAMPLE_MS + 1;
const PLOT_TOP = 22;
const PLOT_RIGHT = 14;

// Download speed, then extraction: its overall speed, or disk read and write when
// the downloader reports them.
const SERIES = [
  { key: "download", color: "rgb(var(--color-primary))" },
  { key: "extract", color: "rgb(245 158 11)" },
  { key: "read", color: "rgb(56 189 248)" },
  { key: "write", color: "rgb(245 158 11)" },
];

// Kept outside the component so the curves survive leaving and reopening the page.
const history = Object.fromEntries(SERIES.map(s => [s.key, new Array(POINTS).fill(0)]));
const live = Object.fromEntries(SERIES.map(s => [s.key, 0]));
let lastSampleAt = 0;

// Where new downloads began, newest last. `age` is in samples back from the live edge.
const MAX_MARKERS = 4;
const markers = [];

/** Set the activity so far apart from the download that is starting now. */
export const markDownloadStart = label => {
  const now = performance.now();
  let busy = false;
  for (const { key } of SERIES) busy = busy || history[key].some(value => value > 0.0005);
  // Nothing drawn yet means nothing to separate from.
  if (!busy) return;
  // End the old curves at the divider; whatever is still running eases back in.
  for (const { key } of SERIES) live[key] = 0;
  // While the graph was away it resumes with a single sample, so the divider
  // lands at the live edge.
  const age = now - lastSampleAt > 1000 ? -1 : -(now - lastSampleAt) / SAMPLE_MS;
  markers.push({ age, label, created: now });
  if (markers.length > MAX_MARKERS) markers.shift();
};

/** Split a speed in MB/s into a display value and unit. */
export const formatSpeed = mbps => {
  const speed = Number.isFinite(mbps) && mbps > 0 ? mbps : 0;
  if (speed >= 1024) return { value: (speed / 1024).toFixed(2), unit: "GB/s" };
  if (speed >= 100) return { value: speed.toFixed(0), unit: "MB/s" };
  if (speed >= 1 || speed === 0) return { value: speed.toFixed(1), unit: "MB/s" };
  return { value: (speed * 1024).toFixed(0), unit: "KB/s" };
};

const speedLabel = mbps => {
  const { value, unit } = formatSpeed(mbps);
  return `${value} ${unit}`;
};

const countLabel = (count, unit) => `${count.toFixed(count < 10 ? 1 : 0)} ${unit}`;

// Round the axis up to a round number in the unit it is labelled in.
const niceCeil = value => {
  if (value < 1) return niceCeil(Math.max(value * 1024, 100)) / 1024;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return [1, 1.5, 2, 3, 5, 7.5, 10].find(step => step * magnitude >= value) * magnitude;
};

// First sample that belongs to the newest download; earlier ones are the past.
const currentStart = () =>
  markers.length ? Math.max(0, POINTS - 1 - markers[markers.length - 1].age) : 0;

const highest = (from, to) => {
  let top = 0;
  for (const { key } of SERIES) {
    if (to === POINTS) top = Math.max(top, live[key]);
    for (let i = Math.ceil(from); i < to; i++) top = Math.max(top, history[key][i]);
  }
  return top;
};

/**
 * Live activity over the last minute. Reads the current values (MB/s) from
 * speedRef (download) and diskRef ({ extract, read, write }) and draws straight
 * to the SVG on every frame, so the page around it never re-renders for the
 * animation. A series is only drawn while it has something to show, so the
 * download curve scrolls out as the curves of an extraction scroll in.
 * diskRef's extract value counts files per second when its `files` flag is set.
 */
const SpeedGraph = memo(
  ({ speedRef, diskRef, labels = {}, peak = 0, high = false, className }) => {
    const containerRef = useRef(null);
    const lineRefs = useRef({});
    const areaRefs = useRef({});
    const headRefs = useRef({});
    const dotRefs = useRef({});
    const peakRef = useRef(null);
    const gridRefs = useRef([]);
    const labelRefs = useRef([]);
    const hoverLineRef = useRef(null);
    const pastRefs = useRef([]);
    const markerLineRefs = useRef([]);
    const markerLabelRefs = useRef([]);
    const tooltipRef = useRef(null);
    const hoverX = useRef(null);
    const latest = useRef({});
    latest.current = { peak, labels };

    useEffect(() => {
      const container = containerRef.current;
      let width = container.clientWidth;
      let height = container.clientHeight;
      const observer = new ResizeObserver(() => {
        width = container.clientWidth;
        height = container.clientHeight;
      });
      observer.observe(container);

      let scale = niceCeil(Math.max(highest(currentStart(), POINTS) * 1.15, 0.1));
      let previous = performance.now();
      let frame;

      const draw = now => {
        frame = requestAnimationFrame(draw);
        const elapsed = Math.min(100, now - previous);
        previous = now;

        // Ease toward the reported values so one-second updates read as a curve.
        const targets = {
          download: speedRef?.current,
          extract: diskRef?.current?.extract,
          read: diskRef?.current?.read,
          write: diskRef?.current?.write,
        };
        for (const { key } of SERIES) {
          const target = Math.max(0, targets[key] || 0);
          live[key] += (target - live[key]) * (1 - Math.exp(-elapsed / 350));
          if (Math.abs(target - live[key]) < 0.001) live[key] = target;
        }

        // After a gap (page closed, window hidden) keep the old curves as they were.
        if (now - lastSampleAt > 1000) lastSampleAt = now - SAMPLE_MS;
        while (now - lastSampleAt >= SAMPLE_MS) {
          for (const { key } of SERIES) {
            history[key].shift();
            history[key].push(live[key]);
          }
          lastSampleAt += SAMPLE_MS;
          for (const marker of markers) marker.age++;
          while (markers.length && markers[0].age > POINTS) markers.shift();
        }
        if (!width || !height) return;

        const shift = (now - lastSampleAt) / SAMPLE_MS;
        const right = width - PLOT_RIGHT;
        const plotHeight = height - PLOT_TOP - 1;
        const step = right / (POINTS - 2);

        // The axis fits the current download; taller earlier activity is drawn
        // shrunk to fit instead of flattening what is happening now.
        const start = currentStart();
        const targetScale = niceCeil(Math.max(highest(start, POINTS) * 1.15, 0.1));
        scale += (targetScale - scale) * (1 - Math.exp(-elapsed / 300));
        const pastTop = highest(0, start);
        const shrink = Math.min(1, (scale * 0.8) / Math.max(pastTop, 0.0001));
        const y = value =>
          PLOT_TOP + plotHeight - (Math.min(value, scale) / scale) * plotHeight;

        const pointer = hoverX.current;
        const hovering = pointer !== null && pointer <= right;
        const stepsBack = hovering ? (right - pointer) / step : 0;
        const hoverIndex = Math.max(
          0,
          Math.min(POINTS - 1, Math.round(POINTS - 1 - stepsBack + shift))
        );
        const readout = [];
        let readoutTop = height;
        const filesUnit = diskRef?.current?.files && latest.current.labels.filesUnit;
        const format = (key, value) =>
          key === "extract" && filesUnit
            ? countLabel(value, filesUnit)
            : speedLabel(value);
        let onlyExtract = true;

        for (const { key } of SERIES) {
          const values = history[key];
          let shown = live[key] > 0.0005;
          for (let i = 0; i < POINTS && !shown; i++) shown = values[i] > 0.0005;
          const display = shown ? "" : "none";
          lineRefs.current[key].style.display = display;
          areaRefs.current[key].style.display = display;
          // A finished series keeps its curve while it scrolls out, but not its live dot.
          headRefs.current[key].style.display = live[key] > 0.0005 ? "" : "none";
          dotRefs.current[key].style.opacity = shown && hovering ? 1 : 0;
          if (!shown) continue;
          if (key !== "extract") onlyExtract = false;

          let path = "";
          for (let i = 0; i < POINTS; i++) {
            const x = right - (POINTS - 1 - i + shift) * step;
            path += `${i ? "L" : "M"}${x.toFixed(1)} ${y(values[i] * (i < start ? shrink : 1)).toFixed(1)}`;
          }
          const headY = y(live[key]);
          path += `L${right} ${headY.toFixed(1)}`;
          lineRefs.current[key].setAttribute("d", path);
          areaRefs.current[key].setAttribute(
            "d",
            `${path}L${right} ${height}L${-step} ${height}Z`
          );
          headRefs.current[key].setAttribute(
            "transform",
            `translate(${right} ${headY.toFixed(1)})`
          );

          if (hovering) {
            const value = stepsBack < 0.5 ? live[key] : values[hoverIndex];
            dotRefs.current[key].setAttribute("cx", pointer);
            dotRefs.current[key].setAttribute(
              "cy",
              y(value * (stepsBack >= 0.5 && hoverIndex < start ? shrink : 1))
            );
            readoutTop = Math.min(readoutTop, y(value));
            const label = latest.current.labels[key];
            readout.push(`${label ? `${label} ` : ""}${format(key, value)}`);
          }
        }

        [targetScale / 2, targetScale].forEach((value, i) => {
          const lineY = y(value);
          const visible = value <= scale * 1.02;
          gridRefs.current[i].setAttribute("y1", lineY);
          gridRefs.current[i].setAttribute("y2", lineY);
          gridRefs.current[i].style.opacity = visible ? 1 : 0;
          labelRefs.current[i].style.transform = `translateY(${lineY - 15}px)`;
          labelRefs.current[i].style.opacity = visible ? 1 : 0;
          labelRefs.current[i].textContent = format(onlyExtract ? "extract" : "", value);
        });

        // Everything before a download's start dims behind a divider that slides in.
        for (let i = 0; i < MAX_MARKERS; i++) {
          const marker = markers[i];
          const past = pastRefs.current[i];
          const line = markerLineRefs.current[i];
          const label = markerLabelRefs.current[i];
          if (!marker) {
            past.style.opacity = line.style.opacity = label.style.opacity = 0;
            continue;
          }
          const x = right - (marker.age + shift) * step;
          const appear = 1 - Math.exp(-(now - marker.created) / 450);
          // Fade out with the graph's left edge.
          const edge = Math.max(0, Math.min(1, (x / width - 0.06) / 0.12));
          past.setAttribute("width", Math.max(0, x));
          past.style.opacity = 0.5 * appear;
          line.setAttribute("x1", x);
          line.setAttribute("x2", x);
          line.setAttribute("y1", height - (height - 4) * appear);
          line.style.opacity = appear * edge;
          if (label.textContent !== marker.label) label.textContent = marker.label;
          const left = Math.min(x + 7, width - label.offsetWidth - 8);
          label.style.transform = `translate(${left}px, ${(1 - appear) * 6}px)`;
          label.style.opacity = appear * edge;
        }

        const peakNow = latest.current.peak;
        const showPeak =
          peakNow > 0 && peakNow <= scale && peakNow > live.download * 1.05;
        peakRef.current.style.opacity = showPeak ? 1 : 0;
        if (showPeak) {
          peakRef.current.setAttribute("y1", y(peakNow));
          peakRef.current.setAttribute("y2", y(peakNow));
        }

        hoverLineRef.current.style.opacity = hovering ? 1 : 0;
        tooltipRef.current.style.opacity = hovering && readout.length ? 1 : 0;
        if (hovering) {
          const seconds = Math.round((stepsBack * SAMPLE_MS) / 1000);
          hoverLineRef.current.setAttribute("x1", pointer);
          hoverLineRef.current.setAttribute("x2", pointer);
          tooltipRef.current.textContent = `${readout.join(" · ")} · ${seconds ? `-${seconds}s` : "now"}`;
          const half = tooltipRef.current.offsetWidth / 2 + 8;
          const left = Math.max(half, Math.min(width - half, pointer));
          tooltipRef.current.style.transform = `translate(${left}px, ${Math.max(0, readoutTop - 34)}px) translateX(-50%)`;
        }
      };
      frame = requestAnimationFrame(draw);

      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
      };
    }, [speedRef, diskRef]);

    return (
      <div
        ref={containerRef}
        className={cn("relative select-none", className)}
        onMouseMove={event => {
          hoverX.current =
            event.clientX - event.currentTarget.getBoundingClientRect().left;
        }}
        onMouseLeave={() => {
          hoverX.current = null;
        }}
      >
        <svg
          className="absolute inset-0 h-full w-full overflow-hidden"
          style={{
            maskImage: "linear-gradient(to right, transparent, black 14%)",
            WebkitMaskImage: "linear-gradient(to right, transparent, black 14%)",
          }}
        >
          <defs>
            {SERIES.map(({ key, color }) => (
              <linearGradient
                key={key}
                id={`speedGraphFill-${key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={color}
                  stopOpacity={key !== "download" ? 0.22 : high ? 0.45 : 0.3}
                />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {[0, 1].map(i => (
            <line
              key={i}
              ref={element => (gridRefs.current[i] = element)}
              x1="0"
              x2="100%"
              className="stroke-border transition-opacity duration-300"
              strokeDasharray="2 6"
            />
          ))}
          <line
            ref={peakRef}
            x1="0"
            x2="100%"
            className="stroke-primary/40 transition-opacity duration-300"
            strokeDasharray="6 6"
          />
          {SERIES.map(({ key }) => (
            <path
              key={key}
              ref={element => (areaRefs.current[key] = element)}
              fill={`url(#speedGraphFill-${key})`}
            />
          ))}
          {SERIES.map(({ key, color }) => {
            const glow = key === "download" && high;
            return (
              <path
                key={key}
                ref={element => (lineRefs.current[key] = element)}
                fill="none"
                stroke={color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 ${glow ? 10 : 5}px ${color.slice(0, -1)} / ${glow ? 0.8 : 0.45}))`,
                  transition: "filter 400ms",
                }}
              />
            );
          })}
          {Array.from({ length: MAX_MARKERS }, (_, i) => (
            <React.Fragment key={i}>
              <rect
                ref={element => (pastRefs.current[i] = element)}
                x="0"
                y="0"
                height="100%"
                className="fill-card"
                style={{ opacity: 0 }}
              />
              <line
                ref={element => (markerLineRefs.current[i] = element)}
                y2="100%"
                className="stroke-primary/60"
                strokeDasharray="3 4"
                style={{ opacity: 0 }}
              />
            </React.Fragment>
          ))}
          <line
            ref={hoverLineRef}
            y1={PLOT_TOP}
            y2="100%"
            className="stroke-foreground/25"
            style={{ opacity: 0 }}
          />
          {SERIES.map(({ key, color }) => (
            <circle
              key={key}
              ref={element => (dotRefs.current[key] = element)}
              r="4"
              className="fill-background"
              stroke={color}
              strokeWidth={2}
              style={{ opacity: 0 }}
            />
          ))}
          {SERIES.map(({ key, color }) => {
            const duration = key === "download" && high ? "0.9s" : "1.8s";
            return (
              <g key={key} ref={element => (headRefs.current[key] = element)}>
                <circle r="4" fill={color} opacity="0.4">
                  <animate
                    attributeName="r"
                    values="4;11;4"
                    dur={duration}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.45;0;0.45"
                    dur={duration}
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  r="4"
                  className="fill-background"
                  stroke={color}
                  strokeWidth={2.25}
                />
              </g>
            );
          })}
        </svg>
        {[0, 1].map(i => (
          <span
            key={i}
            ref={element => (labelRefs.current[i] = element)}
            className="pointer-events-none absolute left-3 top-0 text-[10px] font-medium tabular-nums text-muted-foreground/70 transition-opacity duration-300"
          />
        ))}
        {Array.from({ length: MAX_MARKERS }, (_, i) => (
          <span
            key={i}
            ref={element => (markerLabelRefs.current[i] = element)}
            className="pointer-events-none absolute left-0 top-1 max-w-[11rem] truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            style={{ opacity: 0 }}
          />
        ))}
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-md border border-border bg-card/95 px-2 py-1 text-xs font-semibold tabular-nums text-foreground shadow-lg backdrop-blur-sm"
          style={{ opacity: 0 }}
        />
      </div>
    );
  }
);

SpeedGraph.displayName = "SpeedGraph";

export default SpeedGraph;
