import { useEffect, useState } from "react";
export default function usePrivateArtwork(source, revision = 0) {
  const [image, setImage] = useState(null);
  const sourceId = source?.sourceId, entryId = source?.entryId;
  useEffect(() => {
    let alive = true; setImage(null);
    if (sourceId && entryId) window.electron.privateSources.artwork(sourceId, entryId, "cover")
      .then(value => { if (alive) setImage(value); }).catch(() => {});
    return () => { alive = false; };
  }, [sourceId, entryId, revision]);
  return image;
}
