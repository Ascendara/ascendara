import { useEffect, useState } from "react";

export const columnsForWidth = (width) =>
  width < 1000 ? 3 : width >= 2400 ? 6 : width >= 1800 ? 5 : 4;

// The rendered grid and controller rows must always use the same column count.
export function useGridColumns() {
  const [columns, setColumns] = useState(() =>
    columnsForWidth(window.innerWidth),
  );
  useEffect(() => {
    const update = () => setColumns(columnsForWidth(window.innerWidth));
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return columns;
}
