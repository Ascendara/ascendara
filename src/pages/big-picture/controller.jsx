import { X, Circle, Square, Triangle } from "lucide-react";

// PlayStation button component
const PSButton = ({ type, className = "" }) => {
  const buttonStyles = "inline-flex items-center justify-center";

  switch (type) {
    case "cross":
      return <X className={`${buttonStyles} ${className}`} strokeWidth={3} />;
    case "circle":
      return <Circle className={`${buttonStyles} ${className}`} strokeWidth={2.5} />;
    case "square":
      return <Square className={`${buttonStyles} ${className}`} strokeWidth={2.5} />;
    case "triangle":
      return <Triangle className={`${buttonStyles} ${className}`} strokeWidth={2.5} />;
    default:
      return null;
  }
};

// Get controller button labels based on controller type
const getControllerButtons = (controllerType = "xbox") => {
  const buttonMaps = {
    xbox: {
      confirm: "A",
      cancel: "B",
      delete: "X",
      space: "Y",
      menu: "Start",
    },
    playstation: {
      confirm: <PSButton type="cross" className="h-4 w-4" />,
      cancel: <PSButton type="circle" className="h-4 w-4" />,
      delete: <PSButton type="square" className="h-4 w-4" />,
      space: <PSButton type="triangle" className="h-4 w-4" />,
      menu: "Options",
    },
    generic: {
      confirm: "A",
      cancel: "B",
      delete: "X",
      space: "Y",
      menu: "Menu",
    },
    keyboard: {
      confirm: "Enter",
      cancel: "Esc",
      delete: "Del",
      space: "Space",
      menu: "Tab",
    },
  };

  return buttonMaps[controllerType] || buttonMaps.xbox;
};

// Get button badge border radius based on controller type
const getButtonBadgeClass = (controllerType = "xbox") => {
  return controllerType === "keyboard" ? "rounded-md" : "rounded-full";
};

// Get button width class based on button text (for keyboard keys)
const getButtonWidthClass = (buttonText, baseSize = "w-8") => {
  if (
    typeof buttonText === "string" &&
    (buttonText === "Enter" || buttonText === "Space")
  ) {
    return baseSize === "w-8" ? "w-14" : baseSize === "w-10" ? "w-16" : "w-14";
  }
  return baseSize;
};

export { PSButton, getControllerButtons, getButtonBadgeClass, getButtonWidthClass };
