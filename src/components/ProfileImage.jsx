import { useState } from "react";

export const getInitial = (...names) =>
  names.find(name => typeof name === "string" && name.trim())?.trim()[0].toUpperCase() ||
  "U";

// A profile picture that falls back to the person's initial when there is no
// URL or the image fails to load, instead of the browser's broken image
export default function ProfileImage({ src, fallback, className, alt = "", ...props }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) return fallback;
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailedSrc(src)}
      {...props}
    />
  );
}
