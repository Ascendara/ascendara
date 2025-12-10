import React, { useContext, useRef, useEffect } from "react";
import { SettingsContext } from "@/context/SettingsContext";

const PageTransition = ({ children }) => {
  const context = useContext(SettingsContext);
  const smoothTransitions = context?.settings?.smoothTransitions ?? true;
  const divRef = useRef(null);

  useEffect(() => {
    if (smoothTransitions && divRef.current) {
      const el = divRef.current;
      // Start invisible
      el.style.opacity = "0";
      // Force reflow
      el.offsetHeight;
      // Then animate to visible
      el.style.transition = "opacity 0.2s ease-out";
      el.style.opacity = "1";
    }
  }, [smoothTransitions]);

  if (!smoothTransitions) {
    return <div>{children}</div>;
  }

  return <div ref={divRef}>{children}</div>;
};

export default PageTransition;
