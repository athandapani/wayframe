// Wayframe wordmark.
//
// The mark is the product drawn small: a frame holding three swimlanes with
// a milestone diamond sitting on the middle one, and the lane it sits on
// carried through in the accent colour — the "way" through the "frame".
// Built from the same primitives the chart uses (rounded-square rotated to
// a diamond, horizontal lane rules) so the brand and the artifact are
// obviously the same thing, rather than a logo bolted onto a chart.
//
// currentColor for the frame and lanes means it inherits the surrounding
// text colour and works on any of the three themes without a variant.

export function WayframeMark({ size = 22, accent }: { size?: number; accent: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1.5" y="3.5" width="21" height="17" rx="3.5" stroke="currentColor" strokeWidth="1.6" opacity="0.75" />
      {/* three lanes; the middle one is the path the milestone sits on */}
      <line x1="5" y1="8.5" x2="19" y2="8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.32" />
      <line x1="5" y1="12" x2="19" y2="12" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="5" y1="15.5" x2="19" y2="15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.32" />
      <rect x="10.1" y="10.1" width="3.8" height="3.8" rx="0.8" fill={accent} transform="rotate(45 12 12)" stroke="var(--wf-panel, #fff)" strokeWidth="1.1" />
    </svg>
  );
}

export function WayframeLogo({ accent, caption }: { accent: string; caption?: string }) {
  return (
    <div className="flex items-center gap-2">
      <WayframeMark accent={accent} />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">Wayframe</div>
        {caption && <div className="text-[10.5px] opacity-60">{caption}</div>}
      </div>
    </div>
  );
}
