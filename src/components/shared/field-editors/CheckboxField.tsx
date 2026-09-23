"use client";

// Generic labeled checkbox (wayframe#t33's field-editor extraction) —
// pulled out of MilestoneEditorInspector.tsx's AppearanceBody "hidden" control.
// Contains only the checkbox+label pair; any override/reset chrome stays
// with the caller.
export function CheckboxField({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <>
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-xs font-medium text-zinc-500">
        {label}
      </label>
    </>
  );
}
