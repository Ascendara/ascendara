import { useEffect, useState } from "react";

export const columnsForWidth = (width) =>
  width < 1000 ? 3 : width >= 2400 ? 6 : width >= 1800 ? 5 : 4;

// The rendered grid and controller rows must always use the same column count.
export function useGridColumns(forWidth = columnsForWidth) {
  const [columns, setColumns] = useState(() => forWidth(window.innerWidth));
  useEffect(() => {
    const update = () => setColumns(forWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [forWidth]);
  return columns;
}
