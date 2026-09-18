import { useContext, memo } from "react";
import { SettingsContext } from "@/context/SettingsContext";

const PageTransition = memo(({ children }) => {
  const context = useContext(SettingsContext);
  const smoothTransitions = context?.settings?.smoothTransitions ?? true;

  return <div className={smoothTransitions ? "animate-page-fade" : undefined}>{children}</div>;
});

PageTransition.displayName = "PageTransition";

export default PageTransition;
