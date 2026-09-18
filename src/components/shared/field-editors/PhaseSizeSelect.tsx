"use client";

// Phase-size <select> (wayframe#t33's field-editor extraction) — built on
// SelectField, options fixed to the three PhaseSize values.
import type { PhaseSize } from "@/components/timeline/types";
import { SelectField } from "./SelectField";

const PHASE_SIZE_OPTIONS: { value: PhaseSize; label: string }[] = [
  { value: "lean", label: "lean" },
  { value: "normal", label: "normal" },
  { value: "tall", label: "tall" },
];

export function PhaseSizeSelect({
  value,
  onChange,
  label = "Phase size",
  placeholder,
  ariaLabel,
}: {
  value: PhaseSize | "";
  onChange: (size: PhaseSize) => void;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return <SelectField label={label} value={value} onChange={onChange} options={PHASE_SIZE_OPTIONS} placeholder={placeholder} ariaLabel={ariaLabel} />;
}
