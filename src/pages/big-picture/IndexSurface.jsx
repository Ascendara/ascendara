import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LocalRefresh from "../LocalRefresh";
import { IndexManager } from "./IndexManager";
import { VirtualKeyboard } from "./VirtualKeyboard";
import "./index-surface.css";

const controls =
  'button, a[href], input, textarea, select, [role="switch"], [role="combobox"], [role="option"], [tabindex]';
const visible = (element) =>
  element.getClientRects().length > 0 &&
  getComputedStyle(element).visibility !== "hidden" &&
  !element.closest('[aria-hidden="true"], [inert]') &&
  !element.matches(':disabled, [aria-disabled="true"]');
const textField = (element) =>
  element?.matches(
    'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([readonly])',
  );

// Share refresh operations and dialogs while rendering a dedicated Big Picture manager.
export function IndexSurface({
  navigation,
  onBack,
  t,
  controllerType,
  keyboardLayout,
}) {
  const root = useRef(null);
  const [keyboard, setKeyboard] = useState(null);
  const [value, setValue] = useState("");
  const scope = useCallback(() => {
    const overlays = [
      ...document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [role="listbox"]',
      ),
    ].filter(visible);
    return overlays.at(-1) || root.current;
  }, []);
  const closeKeyboard = () => {
    keyboard?.element.focus();
    setKeyboard(null);
  };
  const handleInput = useCallback(
    (action) => {
      if (keyboard) return;
      const container = scope();
      if (!container) return;
      const items = [...container.querySelectorAll(controls)].filter(visible);
      const focused = document.activeElement;
      const index = items.indexOf(focused);
      if (["UP", "DOWN", "LEFT", "RIGHT"].includes(action)) {
        const step = action === "UP" || action === "LEFT" ? -1 : 1;
        const horizontal = action === "LEFT" || action === "RIGHT";
        const origin = focused?.getBoundingClientRect();
        const candidates =
          index < 0 || !origin?.width
            ? []
            : items
                .filter((item) => item !== focused)
                .map((item) => {
                  const rect = item.getBoundingClientRect();
                  const dx =
                    rect.x + rect.width / 2 - origin.x - origin.width / 2;
                  const dy =
                    rect.y + rect.height / 2 - origin.y - origin.height / 2;
                  return {
                    item,
                    distance: horizontal ? dx : dy,
                    offset: Math.abs(horizontal ? dy : dx),
                  };
                })
                .filter((candidate) => candidate.distance * step > 4)
                .sort(
                  (a, b) =>
                    Math.abs(a.distance) +
                    a.offset * 3 -
                    (Math.abs(b.distance) + b.offset * 3),
                );
        const next =
          candidates[0]?.item ||
          (origin?.width && index >= 0
            ? focused
            : items[
                index < 0 ? 0 : (index + step + items.length) % items.length
              ]);
        next?.focus();
        next?.scrollIntoView({ block: "nearest" });
      } else if (action === "CONFIRM") {
        const target = index < 0 ? items[0] : focused;
        if (textField(target)) {
          setValue(target.value);
          setKeyboard({ element: target, container });
        } else if (target?.getAttribute("role") === "option") {
          target.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
          );
        } else target?.click();
      } else if (action === "BACK") {
        if (container !== root.current) {
          // Radix listens on document; this event bypasses the fullscreen Escape guard.
          const event = new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
          });
          event.bigPictureIndexEscape = true;
          document.dispatchEvent(event);
        } else {
          const dismiss = container.querySelector("[data-index-dismiss]");
          if (dismiss) dismiss.click();
          else onBack();
        }
      }
    },
    [keyboard, onBack, scope],
  );

  useEffect(() => {
    navigation.current = handleInput;
    return () => {
      navigation.current = null;
    };
  }, [navigation, handleInput]);

  useEffect(() => {
    document.body.classList.add("bp-index-open");
    root.current?.querySelector("button")?.focus();
    return () => document.body.classList.remove("bp-index-open");
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.bigPictureIndexEscape) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (keyboard) {
          keyboard.element.focus();
          setKeyboard(null);
        } else handleInput("BACK");
        return;
      }
      if (keyboard) return;
      // Preserve native typing, Tab navigation, and Radix select keyboard behavior.
      if (textField(event.target) || scope() !== root.current) return;
      const action = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
      }[event.key];
      if (action) {
        event.preventDefault();
        handleInput(action);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleInput, keyboard, scope]);

  return (
    <div
      ref={root}
      className="bp-index-surface absolute inset-0 overflow-y-auto"
    >
      <LocalRefresh
        embedded
        onBack={onBack}
        renderManager={(model) => (
          <IndexManager
            model={model}
            onBack={onBack}
            controllerType={controllerType}
          />
        )}
      />
      {keyboard &&
        createPortal(
          <div className="bp-index-keyboard">
            <VirtualKeyboard
              value={value}
              onChange={setValue}
              onClose={closeKeyboard}
              onConfirm={() => {
                const element = keyboard.element;
                const prototype =
                  element.tagName === "TEXTAREA"
                    ? HTMLTextAreaElement.prototype
                    : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(prototype, "value").set.call(
                  element,
                  value,
                );
                element.dispatchEvent(new Event("input", { bubbles: true }));
                element.dispatchEvent(new Event("change", { bubbles: true }));
                closeKeyboard();
              }}
              suggestions={[]}
              t={t}
              layout={keyboardLayout}
              controllerType={controllerType}
            />
          </div>,
          keyboard.container,
        )}
    </div>
  );
}
