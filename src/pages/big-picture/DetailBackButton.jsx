import { ChevronLeft } from "lucide-react";
import { getControllerButtons } from "./controller";

export function DetailBackButton({ onBack, controllerType, t }) {
  const buttons = getControllerButtons(controllerType);
  return (
    <button type="button" className="bp-detail-back" onClick={onBack}>
      <ChevronLeft size={20} aria-hidden="true" />
      <span>{t("bigPicture.back")}</span>
      <kbd aria-hidden="true">{buttons.cancel}</kbd>
    </button>
  );
}
