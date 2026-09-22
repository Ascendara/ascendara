import { useContext, memo } from "react";
import { SettingsContext } from "@/context/SettingsContext";

const PageTransition = memo(({ children, disabled = false }) => {
  const context = useContext(SettingsContext);
  const smoothTransitions = context?.settings?.smoothTransitions ?? true;

  return <div className={smoothTransitions && !disabled ? "animate-page-fade" : undefined}>{children}</div>;
});

PageTransition.displayName = "PageTransition";

export default PageTransition;
