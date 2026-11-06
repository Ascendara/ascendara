import icon from "@/assets/icons/debrid-link.png";
import { cn } from "@/lib/utils";

// The official icon is a full-bleed square, so round it to sit beside the other logos.
export default function DebridLinkIcon({ className, ...props }) {
  return (
    <img
      src={icon}
      alt=""
      draggable={false}
      className={cn("rounded-[22%]", className)}
      {...props}
    />
  );
}
