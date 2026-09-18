import { forwardRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const Checkbox = forwardRef(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    const handleClick = () => {
      if (!disabled && onCheckedChange) {
        onCheckedChange(!checked);
      }
    };

    return (
      <motion.div
        ref={ref}
        role="checkbox"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            handleClick();
          }
        }}
        className={cn(
          "relative h-5 w-5 cursor-pointer select-none rounded-md",
          "border-2 transition-colors duration-200",
          checked ? "border-primary bg-primary/10" : "border-primary/40 bg-transparent",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
        {...props}
      >
        <motion.div
          initial={false}
          animate={{
            scale: checked ? 1 : 0,
            opacity: checked ? 1 : 0,
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 20,
          }}
          className="absolute inset-0 flex items-center justify-center text-primary"
        >
          <svg
            width="12"
            height="10"
            viewBox="0 0 12 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M1.5 5.5L4.5 8.5L10.5 1.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: checked ? 1 : 0 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
                delay: checked ? 0.1 : 0,
              }}
            />
          </svg>
        </motion.div>
      </motion.div>
    );
  }
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
