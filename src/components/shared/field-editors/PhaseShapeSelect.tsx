"use client";

// Phase-shape <select> (wayframe#t33's field-editor extraction) — built on
// SelectField, options fixed to the two PhaseShape values.
import type { PhaseShape } from "@/components/timeline/types";
import { SelectField } from "./SelectField";

const PHASE_SHAPE_OPTIONS: { value: PhaseShape; label: string }[] = [
  { value: "pill", label: "pill" },
  { value: "rectangle", label: "rectangle" },
];

export function PhaseShapeSelect({
  value,
  onChange,
  label = "Phase shape",
  placeholder,
  ariaLabel,
}: {
  value: PhaseShape | "";
  onChange: (shape: PhaseShape) => void;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return <SelectField label={label} value={value} onChange={onChange} options={PHASE_SHAPE_OPTIONS} placeholder={placeholder} ariaLabel={ariaLabel} />;
}
