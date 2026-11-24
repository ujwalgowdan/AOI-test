import { ChevronDown, Monitor, ShieldCheck, User, Video } from "lucide-react";

import type { UseCameraResult } from "@/hooks/useCamera";
import { STATION } from "@/lib/console";
import type { Person } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface ChipOption {
  id: string;
  label: string;
}

/**
 * A one-line chip that shows rich text but is a real `<select>` underneath
 * (transparent, stretched over the chip), so keyboard, screen readers and
 * the OS picker all behave natively.
 */
function ChipSelect({
  label,
  icon,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: ChipOption[];
  placeholder: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const empty = !value;
  return (
    <div
      className={cn(
        "relative flex min-h-8 min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition",
        empty
          ? "border-dashed border-[var(--line-strong)] bg-[var(--card)] text-[var(--faint)]"
          : "border-[var(--line)] bg-[var(--card)] text-[var(--ink)] shadow-sm",
        disabled
          ? "opacity-80"
          : "focus-within:ring-2 focus-within:ring-innotech hover:border-[var(--line-strong)]",
      )}
    >
      <span className={cn("shrink-0", empty ? "text-[var(--faint)]" : "text-innotech")}>{icon}</span>
      <span className="min-w-0 break-words leading-snug">{empty ? placeholder : children}</span>
      {!disabled && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PersonText({ person, kind }: { person: Person; kind: string }) {
  return (
    <>
      <span className="font-semibold">{person.name}</span>{" "}
      <span className="text-[var(--faint)]">
        {person.id} · {kind}
      </span>
    </>
  );
}

interface Props {
  employees: Person[];
  inspectors: Person[];
  employeeId: string;
  inspectorId: string;
  onEmployee: (id: string) => void;
  onInspector: (id: string) => void;
  unit: string;
  onUnit: (unit: string) => void;
  locked: boolean;
  camera: UseCameraResult;
}

export function ContextBar({
  employees,
  inspectors,
  employeeId,
  inspectorId,
  onEmployee,
  onInspector,
  unit,
  onUnit,
  locked,
  camera,
}: Props) {
  const employee = employees.find((e) => e.id === employeeId);
  const inspector = inspectors.find((i) => i.id === inspectorId);
  const cameras = camera.devices.map((d, i) => ({
    id: d.deviceId,
    label: d.label || `Camera ${i + 1}`,
  }));
  const cameraLabel = cameras.find((c) => c.id === camera.deviceId)?.label;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <section aria-label="Session setup" className="flex flex-col gap-2">
      <Field caption="Unit">
        <ChipSelect
          label="Unit"
          icon={<Monitor className="h-3.5 w-3.5" />}
          value={unit}
          onChange={onUnit}
          options={[
            { id: "1", label: "Unit 1" },
            { id: "2", label: "Unit 2" },
          ]}
          placeholder="Select unit"
          disabled={locked}
        >
          <span className="font-semibold">Unit {unit}</span>
        </ChipSelect>
      </Field>
      <Field caption="Operator">
        <ChipSelect
          label="Operator"
          icon={<User className="h-3.5 w-3.5" />}
          value={employee ? employeeId : ""}
          onChange={onEmployee}
          options={employees.map((e) => ({ id: e.id, label: `${e.name} (${e.id})` }))}
          placeholder="Select operator"
          disabled={locked}
        >
          {employee && <PersonText person={employee} kind="operator" />}
        </ChipSelect>
      </Field>
      <Field caption="First-piece inspector">
        <ChipSelect
          label="First-piece inspector"
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          value={inspector ? inspectorId : ""}
          onChange={onInspector}
          options={inspectors.map((i) => ({ id: i.id, label: `${i.name} (${i.id})` }))}
          placeholder="Select first-piece inspector"
          disabled={locked}
        >
          {inspector && <PersonText person={inspector} kind="first-piece inspector" />}
        </ChipSelect>
      </Field>
      <div className="px-1 text-xs text-[var(--ink2)]">
        {STATION.shift} · {STATION.line} · {today}
      </div>
      {cameras.length > 0 && (
        <Field caption="Camera">
          <ChipSelect
            label="Camera"
            icon={<Video className="h-3.5 w-3.5" />}
            value={camera.deviceId ?? ""}
            onChange={camera.setDeviceId}
            options={cameras}
            placeholder="Select camera"
          >
            <span className="font-semibold text-innotech">{cameraLabel}</span>
          </ChipSelect>
        </Field>
      )}
    </section>
  );
}

function Field({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)]">
        {caption}
      </span>
      {children}
    </div>
  );
}
