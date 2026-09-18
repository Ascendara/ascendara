import { useMemo } from "react";
import sanitizeHtml from "@/lib/sanitizeHtml";

// Remote descriptions must not execute code with access to the preload bridge.
export default function SafeHtml({ html, ...props }) {
  const sanitized = useMemo(() => sanitizeHtml(html), [html]);
  return <div {...props} dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
