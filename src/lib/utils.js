import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function sanitizeText(text) {
  if (!text) return "";

  return text
    .replace(/ŌĆÖ/g, "'")
    .replace(/ŌĆō/g, "-")
    .replace(/├Č/g, "ö")
    .replace(/ŌĆ£/g, '"')
    .replace(/ŌĆØ/g, '"')
    .replace(/ŌĆ"/g, "...")
    .replace(/ŌĆś/g, "'")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\//g, "-")
    .replace(/:/g, "")
    .replace(/[<>"\\|?*]/g, "")
    .replace(/\.$/, "")
    .trim();
}

export function formatLatestUpdate(latest_update) {
  if (!latest_update) return null;
  const now = new Date();
  const updateDate = new Date(latest_update);
  const diffMs = now - updateDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  if (diffDays < 14) {
    return diffDays === 0 ? "Today" : `${diffDays} Day${diffDays > 1 ? "s" : ""} ago`;
  } else {
    // Format as 'Month Day, Year'
    const options = { year: "numeric", month: "long", day: "numeric" };
    return updateDate.toLocaleDateString(undefined, options);
  }
}
