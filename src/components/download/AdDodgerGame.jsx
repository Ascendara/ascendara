import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * A small endless runner shown while a Magic Link download is being prepared:
 * a cat jumps over ads, fake buttons and the odd cucumber. It starts right
 * away on autopilot; Space, arrow up or a click takes over and jumps.
 */

const HEIGHT = 164; // room for the title above the top of a jump
const GROUND = 22; // ground line, from the bottom
// Cat sprite: one character per pixel, drawn at PIXEL scale.
// B body, E eye, X eye after a hit, P nose, C collar
const PIXEL = 2;
const CAT = {
  runA: [
    "..........B...B.",
    "..........BB.BB.",
    "B.........BBBBB.",
    "B.........BEBEB.",
    ".B........BBPBB.",
    ".B..BBBBBBBBBBB.",
    "..BBBBBBBBBCCB..",
    "..BBBBBBBBBBB...",
    "..BBBBBBBBBB....",
    "..B..B...B..B...",
    "..B..B...B..B...",
  ],
  runB: [
    "..........B...B.",
    "..........BB.BB.",
    "..........BBBBB.",
    "B.........BEBEB.",
    "B.........BBPBB.",
    ".B..BBBBBBBBBBB.",
    "..BBBBBBBBBCCB..",
    "..BBBBBBBBBBB...",
    "..BBBBBBBBBB....",
    "...BB.....BB....",
    "....B......B....",
  ],
  jump: [
    "B.........B...B.",
    "B.........BB.BB.",
    ".B........BBBBB.",
    ".B........BEBEB.",
    "..B.......BBPBB.",
    "..B.BBBBBBBBBBB.",
    "..BBBBBBBBBCCB..",
    "..BBBBBBBBBBB...",
    ".BBBBBBBBBBB....",
    "BB.........BB...",
    "............B...",
  ],
};
const CAT_W = CAT.runA[0].length * PIXEL;
const CAT_H = CAT.runA.length * PIXEL;
const GRAVITY = 2100;
const JUMP = 560; // peaks about 75px up
const START_SPEED = 230;
const MAX_SPEED = 520;
const BEST_KEY = "ascendara.adDodger.best";

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const saveBest = value => {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Best score is a nicety; nothing to do without storage
  }
};

const themeColor = (name, alpha = 1) => {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${name}`)
    .trim();
  return value ? `rgb(${value} / ${alpha})` : `rgba(128,128,128,${alpha})`;
};

const roundRect = (g, x, y, w, h, r) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

const OBSTACLES = [
  { kind: "ad", w: 26, h: 30 },
  { kind: "ad", w: 30, h: 38 },
  { kind: "x", w: 18, h: 18 },
  { kind: "xx", w: 40, h: 18 },
  { kind: "cucumber", w: 34, h: 12 },
];

// How long a crash stays up before the autopilot picks the game back up
const OVER_HOLD_S = 2.5;

/** Jump if on the ground, with a puff of sparks from the feet. */
function launch(game) {
  if (game.y > 0) return;
  game.vy = JUMP;
  game.squash = 0;
  for (let i = 0; i < 6; i++) {
    game.particles.push({
      x: 28 + CAT_W / 2,
      y: HEIGHT - GROUND,
      kind: "spark",
      vx: -30 - Math.random() * 80,
      vy: -20 - Math.random() * 60,
      life: 0.4 + Math.random() * 0.25,
      age: 0,
    });
  }
}

function newGame(state = "demo") {
  return {
    state, // demo (autopilot) | playing | over
    overFor: 0,
    y: 0, // player height above ground
    vy: 0,
    speed: START_SPEED,
    distance: 0,
    obstacles: [],
    nextObstacle: 0.4,
    particles: [],
    groundOffset: 0,
    squash: 0,
    blinkIn: 2.5,
    blink: 0,
  };
}

export default function AdDodgerGame() {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const gameRef = useRef(newGame());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const [phase, setPhase] = useState("demo");

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const g = canvas.getContext("2d");
    let width = wrap.clientWidth;
    let frame = 0;
    let last = performance.now();
    let colors = {};
    let shownScore = -1;

    const readColors = () => {
      colors = {
        primary: themeColor("primary"),
        primarySoft: themeColor("primary", 0.18),
        fg: themeColor("foreground", 0.85),
        muted: themeColor("muted-foreground", 0.55),
        mutedSoft: themeColor("muted-foreground", 0.15),
        card: themeColor("card"),
        danger: "rgb(239 68 68 / 0.9)",
      };
    };

    const resize = () => {
      width = wrap.clientWidth;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(HEIGHT * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${HEIGHT}px`;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      readColors();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const groundY = () => HEIGHT - GROUND;
    const playerX = 28;

    // kind: "spark" (jumps, hits) or "dust" (landing)
    const burst = (x, y, count, kind = "spark") => {
      const game = gameRef.current;
      for (let i = 0; i < count; i++) {
        game.particles.push({
          x,
          y,
          kind,
          vx: kind === "dust" ? -20 - Math.random() * 70 : -40 - Math.random() * 90,
          vy: kind === "dust" ? -10 - Math.random() * 40 : -30 - Math.random() * 110,
          life: 0.45 + Math.random() * 0.3,
          age: 0,
        });
      }
    };

    const update = dt => {
      const game = gameRef.current;
      game.particles = game.particles.filter(p => {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 380 * dt;
        return p.age < p.life;
      });
      game.squash = Math.max(0, game.squash - dt * 6);
      game.blink = Math.max(0, game.blink - dt);
      game.blinkIn -= dt;
      if (game.blinkIn <= 0) {
        game.blink = 0.12;
        game.blinkIn = 2 + Math.random() * 3;
      }
      if (game.state === "over") {
        game.overFor += dt;
        if (game.overFor >= OVER_HOLD_S) {
          gameRef.current = newGame("demo");
          setPhase("demo");
        }
        return;
      }
      const demo = game.state === "demo";

      game.speed = Math.min(MAX_SPEED, game.speed + dt * 9);
      game.distance += game.speed * dt;
      game.groundOffset = (game.groundOffset + game.speed * dt) % 24;

      // Player
      const wasAirborne = game.y > 0;
      game.vy -= GRAVITY * dt;
      game.y = Math.max(0, game.y + game.vy * dt);
      if (game.y === 0) {
        if (wasAirborne) {
          game.squash = 1;
          burst(playerX + CAT_W / 2, groundY(), 6, "dust");
        }
        game.vy = 0;
      }

      // Obstacles
      game.nextObstacle -= dt;
      if (game.nextObstacle <= 0) {
        const pick = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
        game.obstacles.push({ ...pick, x: width + 10 });
        // Gaps shrink in time but always leave room to land and jump again
        const minGap = 0.75 * (START_SPEED / game.speed) + 0.35;
        game.nextObstacle = minGap + Math.random() * 0.9;
      }
      game.obstacles.forEach(o => (o.x -= game.speed * dt));
      game.obstacles = game.obstacles.filter(o => o.x + o.w > -10);

      // Autopilot: jump just before the next obstacle reaches the cat
      if (demo) {
        const next = game.obstacles.find(o => o.x + o.w > playerX + 6);
        const gap = next ? next.x - (playerX + CAT_W - 6) : Infinity;
        if (gap > 0 && gap < game.speed * 0.11 + 4) launch(game);
      }

      // Hits (a little forgiving on the edges)
      const px = playerX + 6;
      const pw = CAT_W - 10;
      const pBottom = groundY() - game.y;
      const pTop = pBottom - CAT_H + 4;
      const hit = game.obstacles.some(o => {
        const top = groundY() - o.h;
        return (
          px < o.x + o.w - 3 && px + pw > o.x + 3 && pBottom > top + 2 && pTop < groundY()
        );
      });
      if (hit && demo) {
        // The autopilot rarely misses; start it over quietly if it does
        gameRef.current = newGame("demo");
        return;
      }
      if (hit) {
        game.state = "over";
        burst(playerX + CAT_W / 2, pBottom - CAT_H / 2, 14);
        const final = Math.floor(game.distance / 25);
        setPhase("over");
        setBest(previous => {
          if (final <= previous) return previous;
          saveBest(final);
          return final;
        });
      }
    };

    const drawPlayer = game => {
      const bottom = groundY() - game.y;
      const airborne = game.y > 0.5;
      const over = game.state === "over";
      const sprite =
        airborne || over
          ? CAT.jump
          : game.state !== "over" && Math.floor(game.distance / 14) % 2
            ? CAT.runB
            : CAT.runA;
      const palette = {
        B: colors.fg,
        E: game.blink > 0 && !over ? colors.fg : colors.card,
        P: "rgb(244 114 182)",
        C: colors.primary,
      };

      // Pixel art stays on whole pixels: no tilt or stretch, just a short
      // squash from the feet on landing
      const squash = game.squash * 0.14;
      g.save();
      g.translate(playerX + CAT_W / 2, Math.round(bottom));
      g.scale(1 + squash, 1 - squash);
      g.translate(-CAT_W / 2, -CAT_H);
      sprite.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const key = row[x];
          if (key === ".") continue;
          if (key === "E" && over) {
            // Dazed X eyes
            g.fillStyle = colors.card;
            g.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
            g.fillStyle = colors.danger;
            g.fillRect(x * PIXEL, y * PIXEL, PIXEL / 2, PIXEL / 2);
            g.fillRect(
              x * PIXEL + PIXEL / 2,
              y * PIXEL + PIXEL / 2,
              PIXEL / 2,
              PIXEL / 2
            );
            continue;
          }
          g.fillStyle = palette[key];
          g.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
        }
      });
      g.restore();
    };

    const drawObstacle = o => {
      const top = groundY() - o.h;
      if (o.kind === "ad") {
        g.fillStyle = colors.mutedSoft;
        roundRect(g, o.x, top, o.w, o.h, 4);
        g.fill();
        g.strokeStyle = colors.muted;
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = colors.muted;
        g.fillRect(o.x + 3, top + 3, o.w - 6, 4);
        g.font = "bold 10px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("AD", o.x + o.w / 2, top + o.h / 2 + 3);
        return;
      }
      if (o.kind === "cucumber") {
        g.fillStyle = "rgb(34 197 94 / 0.85)";
        roundRect(g, o.x, top, o.w, o.h, o.h / 2);
        g.fill();
        g.fillStyle = "rgb(187 247 208 / 0.9)";
        for (let i = 0; i < 4; i++) {
          g.fillRect(o.x + 7 + i * 6, top + 3 + (i % 2) * 4, 2, 2);
        }
        g.fillStyle = "rgb(21 128 61)";
        g.fillRect(o.x + o.w - 3, top + o.h / 2 - 1.5, 4, 3);
        return;
      }
      const count = o.kind === "xx" ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const x = o.x + i * 22;
        g.fillStyle = colors.danger;
        g.beginPath();
        g.arc(x + 9, top + 9, 9, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "white";
        g.lineWidth = 2;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(x + 5.5, top + 5.5);
        g.lineTo(x + 12.5, top + 12.5);
        g.moveTo(x + 12.5, top + 5.5);
        g.lineTo(x + 5.5, top + 12.5);
        g.stroke();
      }
    };

    const draw = () => {
      const game = gameRef.current;
      g.clearRect(0, 0, width, HEIGHT);

      // Ground
      g.strokeStyle = colors.muted;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, groundY() + 0.5);
      g.lineTo(width, groundY() + 0.5);
      g.stroke();
      g.fillStyle = colors.mutedSoft;
      for (let x = -game.groundOffset; x < width; x += 24) {
        g.fillRect(x, groundY() + 6, 10, 2);
      }

      game.obstacles.forEach(drawObstacle);

      // Sparks
      game.particles.forEach(p => {
        const alpha = 1 - p.age / p.life;
        g.fillStyle = p.kind === "dust" ? colors.muted : colors.primary;
        g.globalAlpha = alpha;
        const size = p.kind === "dust" ? 2 : 3;
        g.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      });
      g.globalAlpha = 1;

      drawPlayer(game);
    };

    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      const current = Math.floor(gameRef.current.distance / 25);
      if (current !== shownScore) {
        shownScore = current;
        setScore(current);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // Theme changes swap the CSS variables the canvas paints with
    const themeObserver = new MutationObserver(readColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, []);

  const jump = () => {
    const game = gameRef.current;
    if (game.state === "over") {
      const fresh = newGame("playing");
      launch(fresh);
      gameRef.current = fresh;
      setPhase("playing");
      return;
    }
    if (game.state === "demo") {
      // Take over from the autopilot mid-run, with the score from zero
      game.state = "playing";
      game.distance = 0;
      game.speed = START_SPEED;
      setPhase("playing");
    }
    launch(game);
  };

  useEffect(() => {
    const onKey = event => {
      if (event.code !== "Space" && event.code !== "ArrowUp") return;
      // Don't steal keys from fields
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable)
        return;
      // Held keys repeat: block every one so the page never scrolls, but
      // only the first press jumps
      event.preventDefault();
      if (event.repeat) return;
      jump();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={wrapRef}
      role="button"
      tabIndex={-1}
      aria-label={t("download.miniGame.hint")}
      onPointerDown={event => {
        event.preventDefault();
        jump();
      }}
      className="relative cursor-pointer select-none overflow-hidden rounded-lg bg-muted/30"
    >
      <canvas ref={canvasRef} className="block" />

      <div className="pointer-events-none absolute right-3 top-2 flex gap-3 text-[11px] font-medium tabular-nums text-muted-foreground">
        {best > 0 && <span>{t("download.miniGame.best", { score: best })}</span>}
        {phase !== "demo" && (
          <span className="text-foreground">{String(score).padStart(4, "0")}</span>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-start px-3">
        {phase === "playing" ? (
          <span className="text-[11px] text-muted-foreground/80">
            {t("download.miniGame.jumpHint")}
          </span>
        ) : (
          <>
            <span className="text-xs font-semibold text-foreground">
              {phase === "over"
                ? t("download.miniGame.gameOver")
                : t("download.miniGame.title")}
            </span>
            <span
              className={cn(
                "text-[11px]",
                phase === "demo"
                  ? "animate-pulse font-medium text-primary"
                  : "text-muted-foreground"
              )}
            >
              {phase === "over"
                ? t("download.miniGame.retry")
                : t("download.miniGame.hint")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
