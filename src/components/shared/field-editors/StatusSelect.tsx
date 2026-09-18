"use client";

// Status <select> (wayframe#t33's field-editor extraction) — built on
// SelectField, options fixed to every Status value. Used both by
// MilestoneEditorModal.tsx (single-item, always a concrete `value`) and
// SelectionToolbar.tsx's bulk value-editor (`value=""` + `placeholder`,
// see SelectField's own doc).
import type { Status } from "@/components/timeline/types";
import { SelectField } from "./SelectField";

export const STATUS_OPTIONS: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];

export function StatusSelect({
  value,
  onChange,
  label = "Status",
  placeholder,
  ariaLabel,
  className,
}: {
  value: Status | "";
  onChange: (status: Status) => void;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      selectClassName={className ?? "w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"}
    />
  );
}
