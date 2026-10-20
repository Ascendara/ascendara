import { useEffect, useRef, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { getAscendArtworkCandidates } from "@/services/ascendArtworkService";

export default function AscendGameImage({ name, slot = "header", fallback: Fallback = Gamepad2 }) {
  const host = useRef(null);
  const advance = useRef(null);
  const [artwork, setArtwork] = useState(null);

  useEffect(() => {
    let alive = true;
    let started = false;
    const candidates = getAscendArtworkCandidates(name, slot);
    setArtwork(null);
    const next = async () => {
      const result = await candidates.next();
      if (alive) setArtwork(result.done ? null : result.value);
    };
    advance.current = next;
    const start = () => {
      if (started) return;
      started = true;
      void next();
    };
    const observer = typeof IntersectionObserver === "undefined" ? null :
      new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      }, { rootMargin: "200px" });
    if (observer && host.current) observer.observe(host.current);
    else start();
    return () => {
      alive = false;
      advance.current = null;
      observer?.disconnect();
      void candidates.return();
    };
  }, [name, slot]);

  return (
    <div ref={host} className="flex h-full w-full items-center justify-center">
      {artwork ? (
        <img
          key={artwork.url}
          src={artwork.url}
          alt={name || ""}
          decoding="async"
          className={`h-full w-full ${artwork.type === "logo" ? "object-contain p-2" : "object-cover"}`}
          onError={() => { setArtwork(null); void advance.current?.(); }}
        />
      ) : <Fallback className="h-6 w-6 text-muted-foreground/50" />}
    </div>
  );
}
