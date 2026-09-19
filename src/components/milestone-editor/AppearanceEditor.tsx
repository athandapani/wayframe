"use client";

// Shared Appearance-section building blocks (wayframe UX-2026-09-18 §2) —
// extracted from MilestoneEditorModal.tsx so TopLevelItemEditorModal.tsx can
// offer the same styleOverride editing surface for Program-band phases and
// milestones, not just lane items. Every control here still reads its live
// resolved value through style-resolution.ts's real ladder functions (never
// re-derived) so this can never drift from what RoadmapTimeline.tsx draws.
//
// Which controls actually render is driven by an explicit `AppearanceCapabilities`
// object per call site rather than a single hasEndDate/kind flag — the four
// call sites (lane point milestone, lane duration pill, TopLevelItem
// milestone, TopLevelItem phase) each honor a genuinely different subset of
// StyleOverride's fields on the real chart (confirmed by reading each
// renderer, not assumed): a lane pill's shape/size are the only fields the
// in-lane pill renderer reads; a TopLevelItem phase/milestone additionally
// honors color (RoadmapTimeline.tsx's Program-band render now applies it,
// wayframe UX-2026-09-18 §2) and, for the milestone kind, no date label
// exists to position at all. Showing a control for a field the chart
// wouldn't actually apply is exactly the "preview lies about the real
// chart" failure mode this editor exists to avoid — so an unsupported field
// is simply not rendered, never rendered-with-a-warning.
import { useState } from "react";
import type { LabelPosition, RenderableProgram, Status, StyleOverride } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import {
  resolveDateLabelPosition,
  resolveFontScale,
  resolveHidden,
  resolveMarkerColor,
  resolveMarkerScale,
  resolveMarkerShape,
  resolvePhaseShape,
  resolvePhaseSize,
  resolveTitleLabelPosition,
} from "@/components/timeline/style-resolution";
import { MarkerShapePicker } from "@/components/shared/field-editors/MarkerShapePicker";
import { RangeSlider } from "@/components/shared/field-editors/RangeSlider";
import { LabelPositionPicker } from "@/components/shared/field-editors/LabelPositionPicker";
import { ColorSwatchPicker } from "@/components/shared/field-editors/ColorSwatchPicker";
import { CheckboxField } from "@/components/shared/field-editors/CheckboxField";
import { PhaseShapeSelect } from "@/components/shared/field-editors/PhaseShapeSelect";
import { PhaseSizeSelect } from "@/components/shared/field-editors/PhaseSizeSelect";

/** Which StyleOverride fields a given item kind's real chart render actually reads — see this module's own header doc for why this is explicit per call site instead of a single shape/kind switch. */
export interface AppearanceCapabilities {
  markerShape: boolean;
  markerScale: boolean;
  fontScale: boolean;
  titleLabelPosition: boolean;
  dateLabelPosition: boolean;
  color: boolean;
  hidden: boolean;
  phaseShapeSize: boolean;
}

/** Full marker set — lane point milestone (Milestone with no endDate) and TopLevelItem milestone both resolve every one of these on the real chart, except a TopLevelItem milestone has no separate date label to position. */
export const POINT_CAPABILITIES: AppearanceCapabilities = {
  markerShape: true,
  markerScale: true,
  fontScale: true,
  titleLabelPosition: true,
  dateLabelPosition: true,
  color: true,
  hidden: true,
  phaseShapeSize: false,
};

export const TOP_LEVEL_MILESTONE_CAPABILITIES: AppearanceCapabilities = { ...POINT_CAPABILITIES, dateLabelPosition: false };

/** A lane duration pill only ever reads phaseShape/phaseSize (+ hidden, wayframe UX-2026-09-18 §2 fix) from styleOverride — see the in-lane pill renderer in RoadmapTimeline.tsx, which fills from the lane's own tint and a fixed viewer-global font scale regardless of any per-item override. */
export const LANE_PILL_CAPABILITIES: AppearanceCapabilities = {
  markerShape: false,
  markerScale: false,
  fontScale: false,
  titleLabelPosition: false,
  dateLabelPosition: false,
  color: false,
  hidden: true,
  phaseShapeSize: true,
};

/** A TopLevelItem phase's own render (RoadmapTimeline.tsx) honors phaseShape/phaseSize, fontScale, color, and hidden — no marker shape/scale or label position, a span has one combined label. */
export const TOP_LEVEL_PHASE_CAPABILITIES: AppearanceCapabilities = {
  markerShape: false,
  markerScale: false,
  fontScale: true,
  titleLabelPosition: false,
  dateLabelPosition: false,
  color: true,
  hidden: true,
  phaseShapeSize: true,
};

/** Structurally what AppearanceBody needs from an item — satisfied by both Milestone and TopLevelItem's milestone/phase variants (TopLevelItem simply has no `categoryId`, which is fine since it's optional here). */
export interface AppearanceEditableItem {
  id: string;
  status: Status;
  styleOverride?: StyleOverride;
  categoryId?: string | null;
}

/** Number of set keys in a styleOverride — the Appearance section's badge count. `hidden: false` is a meaningful explicit set, same as any other key, so it counts too. Counts every set key regardless of which capabilities this call site currently renders — a leftover override from before an item changed shape (e.g. a milestone converted to a pill) still reads as "set." */
export function overrideCount(styleOverride?: StyleOverride): number {
  if (!styleOverride) return 0;
  return Object.values(styleOverride).filter((v) => v !== undefined).length;
}

/**
 * Collapsible section shell (t34) — uppercase small-caps header, badge
 * pill, chevron that rotates open. Content always renders open (no Section
 * wrapper); only Appearance/Relationships use this, both defaulting closed.
 */
export function Section({
  title,
  badgeText,
  badgeActive,
  defaultOpen = false,
  children,
}: {
  title: string;
  badgeText: string;
  badgeActive: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between bg-zinc-50 px-3 py-2 text-left dark:bg-zinc-800/60"
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">{title}</span>
        <span className="flex items-center gap-2">
          <span
            className={
              badgeActive
                ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                : "rounded-full border border-zinc-300 px-2 py-0.5 text-[10px] font-semibold text-zinc-400 dark:border-zinc-600"
            }
          >
            {badgeText}
          </span>
          <span className={`text-[11px] text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        </span>
      </button>
      {open && <div className="space-y-3 p-3">{children}</div>}
    </div>
  );
}

/** Small "override / theme-program default" caption under an Appearance control — t34's answer to "the preview shouldn't lie about what's really active." */
export function SourceTag({ source, children }: { source: "override" | "category" | "default"; children?: React.ReactNode }) {
  const color = source === "override" ? "text-violet-600 dark:text-violet-400 font-semibold" : source === "category" ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-zinc-400";
  const label = children ?? (source === "override" ? "your override" : source === "category" ? "from category color" : "theme/program default");
  return <p className={`mt-1 text-[10px] ${color}`}>{label}</p>;
}

export function ResetButton({ onClick, children = "Reset" }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:border-zinc-500 dark:border-zinc-600 dark:text-zinc-300"
    >
      {children}
    </button>
  );
}

/**
 * Appearance section body — every control shows its live resolved value via
 * style-resolution.ts's real ladder functions and a source tag naming which
 * rung actually won. Which of the 8 StyleOverride fields render at all is
 * gated by `capabilities` (see this module's own header doc) — a field the
 * real chart doesn't read for this item kind is simply omitted, not shown
 * with a warning.
 */
export function AppearanceBody<T extends AppearanceEditableItem>({
  item,
  data,
  theme,
  legendCategoryFillEnabled,
  capabilities,
  onSetStyleOverride,
  onClearStyleOverride,
}: {
  item: T;
  data: RenderableProgram;
  theme: Theme;
  legendCategoryFillEnabled: boolean;
  capabilities: AppearanceCapabilities;
  onSetStyleOverride: (id: string, patch: Partial<StyleOverride>) => void;
  onClearStyleOverride: (id: string, field: keyof StyleOverride) => void;
}) {
  const so = item.styleOverride;
  const category = legendCategoryFillEnabled ? data.legendCategories?.find((c) => c.id === item.categoryId) : undefined;

  const markerShape = resolveMarkerShape(item, data, theme);
  const markerScale = resolveMarkerScale(item, data, theme);
  const fontScale = resolveFontScale(item, data);
  const titlePos = resolveTitleLabelPosition(item);
  const datePos = resolveDateLabelPosition(item);
  const hidden = resolveHidden(item, data);
  const { fill: resolvedFill } = resolveMarkerColor(item, theme, data, category);
  const phaseShape = resolvePhaseShape(item, data, theme);
  const phaseSize = resolvePhaseSize(item, data, theme);

  const colorSource: "override" | "category" | "default" = so?.color ? "override" : category ? "category" : "default";

  function positionField(label: string, field: "titleLabelPosition" | "dateLabelPosition", resolved: LabelPosition | undefined) {
    const display = resolved ?? (field === "titleLabelPosition" ? "top" : "bottom");
    const hasOverride = so?.[field] !== undefined;
    return (
      <div>
        <LabelPositionPicker label={label} value={so?.[field]} resolvedValue={display} onChange={(pos) => onSetStyleOverride(item.id, { [field]: pos })} />
        <SourceTag source={hasOverride ? "override" : "default"} />
        {hasOverride && <ResetButton onClick={() => onClearStyleOverride(item.id, field)} />}
      </div>
    );
  }

  return (
    <>
      {capabilities.markerShape && (
        <div>
          <MarkerShapePicker label="Marker shape" value={so?.markerShape} resolvedValue={markerShape} onChange={(shape) => onSetStyleOverride(item.id, { markerShape: shape })} />
          <SourceTag source={so?.markerShape !== undefined ? "override" : "default"} />
          {so?.markerShape !== undefined && <ResetButton onClick={() => onClearStyleOverride(item.id, "markerShape")}>Reset to default</ResetButton>}
        </div>
      )}

      {(capabilities.markerScale || capabilities.fontScale) && (
        <div className="grid grid-cols-2 gap-4">
          {capabilities.markerScale && (
            <div>
              <RangeSlider label="Marker scale" value={markerScale} onChange={(v) => onSetStyleOverride(item.id, { markerScale: v })} min={0.6} max={2} step={0.05} />
              <SourceTag source={so?.markerScale !== undefined ? "override" : "default"} />
              {so?.markerScale !== undefined && <ResetButton onClick={() => onClearStyleOverride(item.id, "markerScale")} />}
            </div>
          )}
          {capabilities.fontScale && (
            <div>
              <RangeSlider
                label="Font scale (composes w/ viewer scale)"
                value={fontScale}
                onChange={(v) => onSetStyleOverride(item.id, { fontScale: v })}
                min={0.6}
                max={2}
                step={0.05}
              />
              <SourceTag source={so?.fontScale !== undefined ? "override" : "default"} />
              {so?.fontScale !== undefined && <ResetButton onClick={() => onClearStyleOverride(item.id, "fontScale")} />}
            </div>
          )}
        </div>
      )}

      {(capabilities.titleLabelPosition || capabilities.dateLabelPosition) && (
        <div className="grid grid-cols-2 gap-4">
          {capabilities.titleLabelPosition && positionField("Title label position", "titleLabelPosition", titlePos)}
          {capabilities.dateLabelPosition && positionField("Date label position", "dateLabelPosition", datePos)}
        </div>
      )}

      {capabilities.color && (
        <div>
          <ColorSwatchPicker label="Color override" value={so?.color} resolvedValue={resolvedFill} onChange={(c) => onSetStyleOverride(item.id, { color: c })} />
          <SourceTag source={colorSource} />
          {so?.color !== undefined && <ResetButton onClick={() => onClearStyleOverride(item.id, "color")}>Clear override</ResetButton>}
        </div>
      )}

      {capabilities.hidden && (
        <div className="flex items-center gap-2">
          <CheckboxField
            id={`hidden-${item.id}`}
            checked={hidden}
            onChange={(checked) => onSetStyleOverride(item.id, { hidden: checked })}
            label="Hide from chart (soft-hide, not deleted)"
          />
          {so?.hidden !== undefined && <ResetButton onClick={() => onClearStyleOverride(item.id, "hidden")}>Reset to default</ResetButton>}
        </div>
      )}

      {capabilities.phaseShapeSize && (
        <div className={capabilities.color || capabilities.hidden ? "border-t border-dashed border-zinc-300 pt-3 dark:border-zinc-600" : ""}>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <PhaseShapeSelect value={phaseShape} onChange={(shape) => onSetStyleOverride(item.id, { phaseShape: shape })} />
              <SourceTag source={so?.phaseShape !== undefined ? "override" : "default"} />
              {so?.phaseShape !== undefined && <ResetButton onClick={() => onClearStyleOverride(item.id, "phaseShape")} />}
            </label>
            <label className="block">
              <PhaseSizeSelect value={phaseSize} onChange={(size) => onSetStyleOverride(item.id, { phaseSize: size })} />
              <SourceTag source={so?.phaseSize !== undefined ? "override" : "default"} />
              {so?.phaseSize !== undefined && <ResetButton onClick={() => onClearStyleOverride(item.id, "phaseSize")} />}
            </label>
          </div>
        </div>
      )}
    </>
  );
}
