import { useEffect, useRef, useState } from "react";

const FADE_MS = 420;

// Stacks image layers so a new source fades in over the previous one instead of
// replacing it outright. A source is preloaded before it is shown; a null source
// fades every layer out.
export function CrossfadeImage({ src, className = "" }) {
  const [layers, setLayers] = useState([]);
  const counter = useRef(0);
  useEffect(() => {
    let live = true;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(() => live && fn(), ms));
    if (!src) {
      setLayers(previous => previous.map(layer => ({ ...layer, shown: false })));
      later(() => setLayers([]), FADE_MS);
    } else {
      const image = new Image();
      const show = () => {
        if (!live) return;
        const key = ++counter.current;
        setLayers(previous => [
          ...previous.filter(layer => layer.shown).slice(-1),
          { src, key, shown: false },
        ]);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (!live) return;
            setLayers(previous =>
              previous.map(layer => (layer.key === key ? { ...layer, shown: true } : layer))
            );
            later(() => setLayers(previous => previous.filter(layer => layer.key === key)), FADE_MS);
          })
        );
      };
      image.onload = show;
      image.src = src;
    }
    return () => {
      live = false;
      timers.forEach(clearTimeout);
    };
  }, [src]);
  return layers.map(layer => (
    <img
      key={layer.key}
      src={layer.src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`bp-crossfade ${className}`}
      data-shown={layer.shown}
    />
  ));
}
