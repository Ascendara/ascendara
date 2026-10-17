import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = ({
  variant = "default",
  size = "default",
  className = "",
} = {}) => {
  return cn(
    "press-sm inline-flex items-center justify-center rounded-md text-sm font-medium transition-[color,background-color,border-color,scale] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
    {
      "bg-primary text-primary-foreground hover:bg-primary/90": variant === "default",
      "bg-destructive text-destructive-foreground hover:bg-destructive/90":
        variant === "destructive",
      "border border-input hover:bg-accent hover:text-accent-foreground":
        variant === "outline",
      "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
      "bg-secondary text-secondary-foreground hover:bg-secondary/80":
        variant === "secondary",
      "h-10 py-2 px-4": size === "default",
      "h-9 px-3": size === "sm",
      "h-11 px-8": size === "lg",
    },
    className
  );
};

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return (
    <button
      className={buttonVariants({ variant, size, className })}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
