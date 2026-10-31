import { useEffect, useState, type InputHTMLAttributes } from "react";

// Keep partial keyboard input (including an empty field) until blur. Clamping
// every keystroke makes a minimum such as 12 prevent users from typing 40.
export default function NumberField({
  value,
  min,
  max,
  onValueChange,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "min" | "max" | "onChange"
> & {
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const number = e.target.valueAsNumber;
        if (Number.isFinite(number) && number >= min && number <= max)
          onValueChange(number);
      }}
      onBlur={() => {
        const number = draft.trim() ? Number(draft) : value;
        const next = Math.max(
          min,
          Math.min(max, Number.isFinite(number) ? number : value),
        );
        setDraft(String(next));
        onValueChange(next);
      }}
    />
  );
}
