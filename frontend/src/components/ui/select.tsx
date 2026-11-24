import { cn } from "@/lib/utils";
import * as React from "react";

interface OptionLike {
  id: string;
  label: string;
}

interface NativeSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  options: OptionLike[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ value, onChange, options, placeholder, disabled, className, id, ...aria }, ref) => (
    <select
      ref={ref}
      id={id}
      aria-label={aria["aria-label"]}
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      className={cn(
        "h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--card)] px-3 text-sm shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-innotech",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <option value="" disabled>
        {placeholder ?? "Select…"}
      </option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";
