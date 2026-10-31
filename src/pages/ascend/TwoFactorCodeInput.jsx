import { useRef } from "react";

const LENGTH = 6;

// Six single-digit boxes. Typing moves forward, Backspace moves back, and
// pasting a whole code fills every box. onComplete fires once all are filled.
const TwoFactorCodeInput = ({ value, onChange, onComplete, disabled, autoFocus }) => {
  const inputs = useRef([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] || "");

  const focus = index =>
    inputs.current[Math.max(0, Math.min(index, LENGTH - 1))]?.focus();

  const update = (next, focusIndex) => {
    const code = next.slice(0, LENGTH);
    onChange(code);
    focus(focusIndex);
    if (code.length === LENGTH) onComplete?.(code);
  };

  const handleChange = (index, raw) => {
    let typed = raw.replace(/\D/g, "");
    // Typing into a filled box replaces its digit
    if (digits[index] && typed.length > 1) typed = typed.replace(digits[index], "");
    if (!typed) return;
    // Autofill or a fast typist can deliver several digits into one box
    const next = (
      value.slice(0, index) +
      typed +
      value.slice(index + typed.length)
    ).slice(0, LENGTH);
    update(next, index + typed.length);
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const cut = digits[index] ? index : index - 1;
      if (cut < 0) return;
      onChange(value.slice(0, cut));
      focus(cut);
    } else if (event.key === "ArrowLeft") {
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      focus(index + 1);
    }
  };

  const handlePaste = event => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();
    update(pasted, pasted.length);
  };

  return (
    <div className="flex justify-between gap-2" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={node => (inputs.current[index] = node)}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          maxLength={LENGTH}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          // Only the next empty box takes focus, so digits can't be skipped
          onFocus={() => index > value.length && focus(value.length)}
          onChange={event => handleChange(index, event.target.value)}
          onKeyDown={event => handleKeyDown(index, event)}
          className="h-14 w-full min-w-0 rounded-xl border border-border/70 bg-background/60 text-center font-mono text-2xl font-semibold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        />
      ))}
    </div>
  );
};

export default TwoFactorCodeInput;
