import { useState } from "react";
import { defaultTheme } from "./theme";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoadmapTimeline } from "./RoadmapTimeline";
import { BlufCallout } from "./BlufCallout";
import { sampleRoadmap } from "./__fixtures__/sample-roadmap";
import { deriveShortLabel } from "./short-label";
import { ghostsForTopLevelItemPhase, layoutItemGhosts } from "./delta-ghosts";
import type { RenderableProgram } from "./types";

describe("RoadmapTimeline", () => {
  it("renders swimlanes, separators, and milestones", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByTestId("roadmap-timeline")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByText("Lane A")).toBeInTheDocument();
    expect(screen.getByText("Lane B")).toBeInTheDocument();
    expect(screen.getByText("Phase One")).toBeInTheDocument();
    expect(screen.getByText("Kickoff")).toBeInTheDocument();
    // Annotations render as reference lines, whose chip carries a short date
    // suffix (wayframe#51) — "Review" alone no longer matches.
    expect(screen.getByText("Review · 2/1")).toBeInTheDocument();
  });

  it("labels markers with the real title, not an initialism", () => {
    // The derived abbreviation is gone: it produced unreadable output
    // ("UL 3100 Certification Issued" -> "U3CI") and leaked punctuation
    // ("Hazard Analysis (Preliminary)" -> "HA("). The title appears twice
    // per marker — once as the label, once in the hover tooltip.
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getAllByText("First milestone").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Second milestone").length).toBeGreaterThan(0);
    expect(screen.queryByText(deriveShortLabel("First milestone"))).not.toBeInTheDocument();
  });

  it("hides marker labels when density is 'none', keeping the tooltip", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} labelDensity="none" />);
    // Only the tooltip copy survives, so the count drops rather than the
    // title disappearing outright.
    expect(screen.getAllByText("First milestone")).toHaveLength(1);
  });

  it("renders the today reference line, with its date, when today falls within the domain", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByText("Today · 1/20")).toBeInTheDocument();
  });

  it("omits the today reference line when today falls outside the domain", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2030-01-01T00:00:00Z")} />);
    expect(screen.queryByText(/^Today ·/)).not.toBeInTheDocument();
  });
});

describe("unified delta-annotation layer (t23, wayframe#96) — slip", () => {
  const slippedRoadmap: RenderableProgram = {
    ...sampleRoadmap,
    milestones: sampleRoadmap.milestones.map((m) => (m.id === "m2" ? { ...m, originalDate: "2026-01-25" } : m)),
  };

  it("renders nothing extra when annotations are off, even for a slipped milestone", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} deltaAnnotationsEnabled={false} />);
    expect(screen.queryByTestId("delta-ghost-slip-date-m2")).not.toBeInTheDocument();
  });

  it("renders nothing extra for a milestone that hasn't slipped, even with annotations on", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.queryByTestId("delta-ghost-slip-date-m1")).not.toBeInTheDocument();
  });

  it("shows a +/-Nd slip label next to the current marker plus a dashed outline at the old date", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const ghost = screen.getByTestId("delta-ghost-slip-date-m2");
    // The dashed outline marker at the old date (its own <rect>, via
    // CushionMarker's default diamond) is always rendered too, alongside
    // the label pill's own <rect> — the unified primitive merges what used
    // to be two mutually-exclusive "badge"/"outline" viewer styles into one
    // always-both treatment.
    expect(ghost.querySelectorAll("rect")).toHaveLength(2);
    expect(screen.getByText("+21d")).toBeInTheDocument();
  });

  it("shows the old→new date detail in the hover tooltip", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByText((_, el) => el?.textContent === "Jan 25 → Feb 15")).toBeInTheDocument();
  });
});

describe("unified delta-annotation layer (t23, wayframe#96) — at-risk", () => {
  const atRiskRoadmap: RenderableProgram = {
    ...sampleRoadmap,
    milestones: sampleRoadmap.milestones.map((m) => (m.id === "m2" ? { ...m, potentialDate: "2026-03-08" } : m)),
  };

  it("renders nothing extra when annotations are off, even for a projected milestone", () => {
    render(<RoadmapTimeline data={atRiskRoadmap} today={new Date("2026-01-20T00:00:00Z")} deltaAnnotationsEnabled={false} />);
    expect(screen.queryByTestId("delta-ghost-at-risk-date-m2")).not.toBeInTheDocument();
  });

  it("renders exactly one projection, only for the milestone that has a potentialDate", () => {
    render(<RoadmapTimeline data={atRiskRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    // m2 has potentialDate; m1 doesn't — only one projection should render, not one per milestone.
    expect(screen.getAllByTestId("delta-ghost-at-risk-date-m2")).toHaveLength(1);
    expect(screen.queryByTestId("delta-ghost-at-risk-date-m1")).not.toBeInTheDocument();
  });

  it("labels the at-risk projection with the risk delta and projected date", () => {
    render(<RoadmapTimeline data={atRiskRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const ghost = screen.getByTestId("delta-ghost-at-risk-date-m2");
    // The outline marker's own <rect> plus the label pill's <rect>.
    expect(ghost.querySelectorAll("rect")).toHaveLength(2);
    expect(screen.getByText("+21d risk · Mar 8")).toBeInTheDocument();
  });

  it("does not move the committed date or stamp originalDate", () => {
    render(<RoadmapTimeline data={atRiskRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByText("Feb 15")).toBeInTheDocument();
  });
});

describe("delta-ghost collision-avoidance (wayframe#47, unified under t23)", () => {
  function withGhostedMilestone(title: string): RenderableProgram {
    return {
      ...sampleRoadmap,
      milestones: [
        {
          id: "g1",
          laneId: "lane-a",
          title,
          date: "2026-01-10",
          originalDate: "2026-01-05",
          status: "delayed",
          dependsOn: [],
          linksToTopLevelMilestone: null,
          isCriticalPath: false,
        },
      ],
    };
  }

  it("keeps the original fixed cx+12/cy-18 offset (tier 0, no connector) when nothing collides", () => {
    render(<RoadmapTimeline data={withGhostedMilestone("OK")} today={new Date("2026-01-01T00:00:00Z")} />);
    const ghost = screen.getByTestId("delta-ghost-slip-date-g1");
    // No collision -> no leader line drawn back to the marker.
    expect(ghost.querySelector("line")).toBeNull();
  });

  it("folds into the tiered layout, escalating with a leader-line connector when it would land on a title", () => {
    // A long enough title's own tier-0 block reaches past the badge's
    // default cx+12 offset — the same "lands directly on top of a label"
    // case the ticket named, just against the marker's own label rather
    // than a neighbor's.
    render(<RoadmapTimeline data={withGhostedMilestone("Certification Submission Package Review")} today={new Date("2026-01-01T00:00:00Z")} />);
    const ghost = screen.getByTestId("delta-ghost-slip-date-g1");
    expect(ghost.querySelector("line")).not.toBeNull();
  });
});

describe("t9 collision fix (t23, wayframe#96): a milestone with both a slip and an at-risk ghost", () => {
  // The literal bug docs/research/t9-ghost-tier-inventory.md documents: two
  // independently-blind layoutGhostBadges passes could both land a label at
  // tier 0 for the same milestone. The unified layer resolves this via
  // KIND_PRIORITY (delta-ghosts.ts) before collision math ever runs — the
  // at-risk ghost outranks the slip ghost, so only it gets labeled/tier 0;
  // the slip ghost renders as an unlabeled outline at a higher tier.
  const bothRoadmap: RenderableProgram = {
    ...sampleRoadmap,
    milestones: sampleRoadmap.milestones.map((m) => (m.id === "m2" ? { ...m, originalDate: "2026-01-25", potentialDate: "2026-03-08" } : m)),
  };

  it("labels the at-risk ghost (tier 0) and demotes the slip ghost to an unlabeled outline", () => {
    render(<RoadmapTimeline data={bothRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const atRisk = screen.getByTestId("delta-ghost-at-risk-date-m2");
    // Labeled: its own outline <rect> plus the label pill's <rect>.
    expect(atRisk.querySelectorAll("rect")).toHaveLength(2);
    expect(screen.getByText("+21d risk · Mar 8")).toBeInTheDocument();

    const slip = screen.getByTestId("delta-ghost-slip-date-m2");
    // Unlabeled: only its own outline <rect>, no label pill.
    expect(slip.querySelectorAll("rect")).toHaveLength(1);
    // Not competing for the same label/tier as the at-risk ghost: no "+Nd"
    // slip text renders at all, only the at-risk's own label text does.
    expect(screen.queryByText("+21d")).not.toBeInTheDocument();
  });
});

describe("TopLevelItem phase delta ghosts (t23, wayframe#96)", () => {
  const phase = sampleRoadmap.topLevelItems.find((t) => t.id === "top-1")!;
  if (phase.type !== "phase") throw new Error("fixture assumption broken: top-1 must be a phase");

  const phaseRoadmap: RenderableProgram = {
    ...sampleRoadmap,
    topLevelItems: sampleRoadmap.topLevelItems.map((t) =>
      t.id === "top-1" && t.type === "phase"
        ? { ...t, originalStartDate: "2025-12-15", originalEndDate: "2026-02-15", potentialDate: "2026-03-20" }
        : t,
    ),
  };

  it("shows exactly 3 ghosts (both slip edges + at-risk), correctly priority-ordered, with no 4th tier invented", () => {
    render(<RoadmapTimeline data={phaseRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    // at-risk outranks slip (KIND_PRIORITY) — it's the labeled one.
    const atRisk = screen.getByTestId("delta-ghost-at-risk-endDate-top-1");
    expect(atRisk.querySelectorAll("rect")).toHaveLength(2);
    // Both slip edges render too, each its own unlabeled outline — real
    // ghost #2 and #3 sharing the item, exactly filling the 3-tier budget.
    const slipStart = screen.getByTestId("delta-ghost-slip-startDate-top-1");
    const slipEnd = screen.getByTestId("delta-ghost-slip-endDate-top-1");
    expect(slipStart.querySelectorAll("rect")).toHaveLength(1);
    expect(slipEnd.querySelectorAll("rect")).toHaveLength(1);
    // No overflow indicator — 3 real ghosts exactly fill MAX_DELTA_TIERS.
    expect(screen.queryByTestId("delta-ghost-overflow")).not.toBeInTheDocument();
  });

  it("overflows a 4th co-occurring ghost into a count rather than inventing a new tier", () => {
    // RoadmapTimeline's real phase render call site has no live scenario-diff
    // caller yet (t23's own scope — a future Scenario-switcher ticket wires
    // one), so a true 4-ghost render can't be reached through props alone.
    // delta-ghosts.ts's layoutItemGhosts is what actually computes
    // overflowCount, and it's already exercised directly with a scenario
    // diff here to prove the budget — MAX_DELTA_TIERS, not 4 — holds even
    // when a 4th real ghost exists, matching what the render path will do
    // the moment a scenario-diff caller exists.
    const ghosts = ghostsForTopLevelItemPhase(
      { ...phase, originalStartDate: "2025-12-15", originalEndDate: "2026-02-15", potentialDate: "2026-03-20" },
      [{ field: "endDate", from: "2026-03-01", to: "2026-04-10" }],
    );
    expect(ghosts).toHaveLength(4);
    const { placed, overflowCount } = layoutItemGhosts(ghosts);
    expect(placed).toHaveLength(3);
    expect(overflowCount).toBe(1);
    // scenario-diff outranks both at-risk and slip — it's the one that
    // would win the labeled/tier-0 slot were this wired into a live render.
    expect(placed[0].kind).toBe("scenario-diff");
  });
});

describe("font-scale system (wayframe#42/#50)", () => {
  it("defaults every scale to a no-op (1×)", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const chip = document.querySelector(`rect[fill="${defaultTheme.accent}"]`);
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute("width")).toBe(String("PROGRAM".length * 5.4 + 20));
    const label = screen.getAllByText("First milestone")[0];
    expect(label.getAttribute("font-size")).toBe("10");
  });

  it("scales rendered text size and the PROGRAM chip's box together, so the chip label doesn't clip", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} fontScale={1.5} metricsScale={1.5} />);
    const chip = document.querySelector(`rect[fill="${defaultTheme.accent}"]`);
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute("width")).toBe(String("PROGRAM".length * 5.4 * 1.5 + 20));
    const label = screen.getAllByText("First milestone")[0];
    expect(label.getAttribute("font-size")).toBe("15");
  });

  it("scales row height (boxScale) independently of text/metrics", () => {
    const { container: base } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const baseSvg = base.querySelector("svg")!;
    const { container: scaled } = render(
      <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} boxScale={1.5} />,
    );
    const scaledSvg = scaled.querySelector("svg")!;
    expect(Number(scaledSvg.getAttribute("height"))).toBeGreaterThan(Number(baseSvg.getAttribute("height")));
  });

  it("scales a wrapped marker label's line spacing with fontScale, so bigger text doesn't overlap its own second line", () => {
    // A tight metricsScale forces "First milestone" to wrap onto two lines
    // regardless of fontScale, isolating the line-pitch bug from wrapping
    // itself: RoadmapWorkspace never scales boxScale (this revision), so
    // nothing grows the row to make room — the two lines have to stay
    // legible on their own, which means their vertical gap must track
    // fontScale the same way the font size does.
    // A milestone's wrapped lines render as separate <text> elements, one
    // per line, not one element holding the joined title — "First" (the
    // top line) and "milestone" (the line closest to the marker), matched
    // by their shared x so a same-named line from the other milestone in
    // this fixture can't be picked up by mistake.
    const { container: base } = render(
      <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} metricsScale={3} fontScale={1} />,
    );
    const baseFirst = [...base.querySelectorAll("text")].find((t) => t.textContent === "First")!;
    expect(baseFirst).toBeTruthy();
    const baseSecond = [...base.querySelectorAll("text")].find(
      (t) => t.textContent === "milestone" && t.getAttribute("x") === baseFirst.getAttribute("x"),
    )!;
    expect(baseSecond).toBeTruthy();
    const baseGap = Math.abs(Number(baseSecond.getAttribute("y")) - Number(baseFirst.getAttribute("y")));

    const { container: scaled } = render(
      <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} metricsScale={3} fontScale={1.6} />,
    );
    const scaledFirst = [...scaled.querySelectorAll("text")].find((t) => t.textContent === "First")!;
    expect(scaledFirst).toBeTruthy();
    const scaledSecond = [...scaled.querySelectorAll("text")].find(
      (t) => t.textContent === "milestone" && t.getAttribute("x") === scaledFirst.getAttribute("x"),
    )!;
    expect(scaledSecond).toBeTruthy();
    const scaledGap = Math.abs(Number(scaledSecond.getAttribute("y")) - Number(scaledFirst.getAttribute("y")));

    expect(scaledGap).toBeCloseTo(baseGap * 1.6, 1);
  });

  it("truncates a top-band phase pill's label instead of letting it overrun its neighbour at high metricsScale", () => {
    const base = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} metricsScale={1} />);
    expect(base.getByText("Phase One")).toBeInTheDocument();
    base.unmount();

    // At metricsScale 1 the full title fits its pill; at metricsScale 100
    // the same pixel-wide pill can no longer fit any meaningful slice of
    // "Phase One", so the label is dropped rather than drawn past the
    // pill's own edge into whatever sits beside it.
    const scaled = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} metricsScale={100} />);
    expect(scaled.queryByText("Phase One")).not.toBeInTheDocument();
    expect(scaled.queryByText(/Phase/)).not.toBeInTheDocument();
  });
});

describe("swimlane density (\"normal vs lean\" row height)", () => {
  it("shrinks the chart's total height when a lane is marked lean", () => {
    const { container: base } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const baseHeight = Number(base.querySelector("svg")!.getAttribute("height"));

    const leanRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      swimlanes: sampleRoadmap.swimlanes.map((l) => (l.id === "lane-a" ? { ...l, density: "lean" as const } : l)),
    };
    const { container: leaned } = render(<RoadmapTimeline data={leanRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const leanedHeight = Number(leaned.querySelector("svg")!.getAttribute("height"));

    expect(leanedHeight).toBeLessThan(baseHeight);
  });

  it("leaves height unchanged for lanes explicitly marked normal", () => {
    const { container: base } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const baseHeight = Number(base.querySelector("svg")!.getAttribute("height"));

    const normalRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      swimlanes: sampleRoadmap.swimlanes.map((l) => ({ ...l, density: "normal" as const })),
    };
    const { container: normal } = render(<RoadmapTimeline data={normalRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const normalHeight = Number(normal.querySelector("svg")!.getAttribute("height"));

    expect(normalHeight).toBe(baseHeight);
  });
});

describe("style-override resolution ladder rendering (wayframe#t19)", () => {
  it("renders a circle marker when styleOverride.markerShape is 'circle', instead of the default rotated-rect diamond", () => {
    const circleRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      milestones: sampleRoadmap.milestones.map((m) => (m.id === "m1" ? { ...m, styleOverride: { markerShape: "circle" as const } } : m)),
    };
    const { container } = render(<RoadmapTimeline data={circleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(container.querySelector("circle")).not.toBeNull();
  });

  it("hides a milestone marker when styleOverride.hidden is true, leaving an unhidden sibling visible", () => {
    const hiddenRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      milestones: sampleRoadmap.milestones.map((m) => (m.id === "m1" ? { ...m, styleOverride: { hidden: true } } : m)),
    };
    render(<RoadmapTimeline data={hiddenRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.queryByText("First milestone")).not.toBeInTheDocument();
    expect(screen.getAllByText("Second milestone").length).toBeGreaterThan(0);
  });

  it("renders a top-band phase pill with a small corner radius when styleOverride.phaseShape is 'rectangle'", () => {
    const rectRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      topLevelItems: sampleRoadmap.topLevelItems.map((t) => (t.id === "top-1" ? { ...t, styleOverride: { phaseShape: "rectangle" as const } } : t)),
    };
    const { container } = render(<RoadmapTimeline data={rectRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(container.querySelector('rect[rx="3"]')).not.toBeNull();
  });

  it("scales a milestone's own title font-size by styleOverride.fontScale, multiplicatively on top of the ambient fontScale", () => {
    const scaledRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      milestones: sampleRoadmap.milestones.map((m) => (m.id === "m1" ? { ...m, styleOverride: { fontScale: 2 } } : m)),
    };
    const { container } = render(<RoadmapTimeline data={scaledRoadmap} today={new Date("2026-01-20T00:00:00Z")} fontScale={1} />);
    const titleLine = [...container.querySelectorAll("text")].find((t) => t.textContent === "First milestone");
    expect(titleLine).toBeTruthy();
    expect(titleLine!.getAttribute("font-size")).toBe("20");
  });

  it("renders a milestone's title with 'end' text-anchor, offset left of the marker, when styleOverride.titleLabelPosition is 'left' — bypassing the tiered layout's centered placement", () => {
    const { container: base } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const baseTitle = [...base.querySelectorAll("text")].find((t) => t.textContent === "First milestone")!;
    expect(baseTitle).toBeTruthy();
    expect(baseTitle.getAttribute("text-anchor")).toBe("middle");

    const leftPosRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      milestones: sampleRoadmap.milestones.map((m) => (m.id === "m1" ? { ...m, styleOverride: { titleLabelPosition: "left" as const } } : m)),
    };
    const { container: overridden } = render(<RoadmapTimeline data={leftPosRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const overriddenTitle = [...overridden.querySelectorAll("text")].find((t) => t.textContent === "First milestone")!;
    expect(overriddenTitle).toBeTruthy();

    expect(overriddenTitle.getAttribute("text-anchor")).toBe("end");
    expect(Number(overriddenTitle.getAttribute("x"))).toBeLessThan(Number(baseTitle.getAttribute("x")));
  });
});

describe("deriveShortLabel", () => {
  it("takes initials of significant words", () => {
    expect(deriveShortLabel("Chassis design freeze")).toBe("CDF");
  });

  it("skips stopwords", () => {
    expect(deriveShortLabel("Launch readiness review for GA")).toBe("LRRG");
  });

  it("caps at the requested length", () => {
    expect(deriveShortLabel("One two three four five", 3)).toBe("OTT");
  });
});

function ControlledBlufCallout({
  bluf,
  fillColor,
  fillTransparency,
}: {
  bluf: { statement: string; bullets: string[]; label?: string };
  fillColor?: string | null;
  fillTransparency?: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <BlufCallout
      bluf={bluf}
      open={open}
      onOpenChange={setOpen}
      theme={defaultTheme}
      fillColor={fillColor}
      fillTransparency={fillTransparency}
    />
  );
}

describe("BlufCallout", () => {
  it("renders the bluf statement and bullets, and can be dismissed and reopened", () => {
    render(<ControlledBlufCallout bluf={sampleRoadmap.bluf} />);
    expect(screen.getByText(sampleRoadmap.bluf.statement)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(sampleRoadmap.bluf.statement)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("So what"));
    expect(screen.getByText(sampleRoadmap.bluf.statement)).toBeInTheDocument();
  });

  it("uses bluf.label in place of the default heading when set, in both open and closed state (wayframe#43/#52)", () => {
    render(<ControlledBlufCallout bluf={{ ...sampleRoadmap.bluf, label: "Program Pulse" }} />);
    expect(screen.getByText("Program Pulse")).toBeInTheDocument();
    expect(screen.queryByText("So what")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.getByText("Program Pulse")).toBeInTheDocument();
  });

  it("applies a custom fill color and transparency as the panel background (wayframe#43/#52)", () => {
    render(<ControlledBlufCallout bluf={sampleRoadmap.bluf} fillColor="#112233" fillTransparency={50} />);
    // 50% transparency -> alpha 0x80 (128/255), applied as a hex suffix on the custom color.
    expect(screen.getByText(sampleRoadmap.bluf.statement).closest("div[style]")).toHaveStyle({ background: "#11223380" });
  });
});

describe("Lane Rows & vertical allocation (wayframe#94/t20)", () => {
  function pillY(container: HTMLElement, id: string): number {
    const rect = container.querySelector(`[data-testid="pill-${id}"] rect`);
    expect(rect).not.toBeNull();
    return Number(rect!.getAttribute("y"));
  }

  const overlappingPills: RenderableProgram["milestones"] = [
    ...sampleRoadmap.milestones,
    { id: "p1", laneId: "lane-a", title: "Design", date: "2026-01-10", endDate: "2026-02-10", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "p2", laneId: "lane-a", title: "Build", date: "2026-01-10", endDate: "2026-02-10", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  ];

  it("stacks overlapping same-lane pills onto separate sub-rows when neither has a laneRow (today's default, Row 1)", () => {
    const { container } = render(
      <RoadmapTimeline data={{ ...sampleRoadmap, milestones: overlappingPills }} today={new Date("2026-01-20T00:00:00Z")} />,
    );
    const y1 = pillY(container, "p1");
    const y2 = pillY(container, "p2");
    expect(y1).not.toBeCloseTo(y2, 0);
  });

  it("still renders the lane's point milestone when it also has overlapping pills — mixed content doesn't drop anything", () => {
    render(<RoadmapTimeline data={{ ...sampleRoadmap, milestones: overlappingPills }} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getAllByText("First milestone").length).toBeGreaterThan(0); // m1, a point milestone sharing lane-a with p1/p2
  });

  it("moving one pill to an explicit Lane Row pulls it out of Row 1's own stacking — override, not seed", () => {
    const split: RenderableProgram["milestones"] = overlappingPills.map((m) => (m.id === "p2" ? { ...m, laneRow: 2 } : m));
    const { container } = render(<RoadmapTimeline data={{ ...sampleRoadmap, milestones: split }} today={new Date("2026-01-20T00:00:00Z")} />);
    // p1 (Row 1, alone now) and p2 (Row 2, alone) each land on their own
    // row's single sub-row — no longer stacked against each other at all.
    const y1 = pillY(container, "p1");
    const y2 = pillY(container, "p2");
    expect(y1).not.toBeCloseTo(y2, 0);
  });

  it("two pills both explicitly assigned to the same non-default row still stack within it", () => {
    const bothRow2: RenderableProgram["milestones"] = overlappingPills.map((m) => ((m.id === "p1" || m.id === "p2") ? { ...m, laneRow: 2 } : m));
    const { container } = render(<RoadmapTimeline data={{ ...sampleRoadmap, milestones: bothRow2 }} today={new Date("2026-01-20T00:00:00Z")} />);
    const y1 = pillY(container, "p1");
    const y2 = pillY(container, "p2");
    expect(y1).not.toBeCloseTo(y2, 0); // collision safety still fires inside an explicit row
  });

  it("renders without throwing when fitToScreen is on", () => {
    render(<RoadmapTimeline data={{ ...sampleRoadmap, milestones: overlappingPills }} today={new Date("2026-01-20T00:00:00Z")} fitToScreen />);
    expect(screen.getByTestId("roadmap-timeline")).toBeInTheDocument();
  });
});

describe("lane-hide (wayframe t22)", () => {
  const hiddenLaneBRoadmap: RenderableProgram = {
    ...sampleRoadmap,
    swimlanes: sampleRoadmap.swimlanes.map((l) => (l.id === "lane-b" ? { ...l, hidden: true } : l)),
  };

  it("renders no marker, pill, or connector for a hidden lane's milestones, and shrinks the chart's total height", () => {
    const base = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const baseHeight = Number(base.container.querySelector("svg")!.getAttribute("height"));
    // sanity: the m1 -> m2 critical connector is present in the baseline.
    expect(base.container.querySelector('[data-testid="critical-connector-m1-m2"]')).not.toBeNull();
    base.unmount();

    const hidden = render(<RoadmapTimeline data={hiddenLaneBRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    // m2 lives in lane-b, which is now hidden — its marker text disappears.
    expect(hidden.queryByText("Second milestone")).not.toBeInTheDocument();
    // m1 (lane-a, still visible) is untouched.
    expect(hidden.getAllByText("First milestone").length).toBeGreaterThan(0);
    // The m1 -> m2 dependency connector is dropped too, since its target's lane is hidden.
    expect(hidden.queryByTestId("critical-connector-m1-m2")).not.toBeInTheDocument();

    const hiddenHeight = Number(hidden.container.querySelector("svg")!.getAttribute("height"));
    // A hidden lane reserves no row slot, so the chart is shorter, not just unpainted.
    expect(hiddenHeight).toBeLessThan(baseHeight);
  });

  it("drops a dependency connector whose source milestone's lane is hidden, even when the target lane stays visible", () => {
    const hiddenLaneARoadmap: RenderableProgram = {
      ...sampleRoadmap,
      swimlanes: sampleRoadmap.swimlanes.map((l) => (l.id === "lane-a" ? { ...l, hidden: true } : l)),
    };
    const rendered = render(<RoadmapTimeline data={hiddenLaneARoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    // m1 (lane-a) is hidden; m2 (lane-b, still visible) survives, but the
    // connector between them (sourced from the now-hidden lane) does not.
    expect(rendered.queryByText("First milestone")).not.toBeInTheDocument();
    expect(rendered.getAllByText("Second milestone").length).toBeGreaterThan(0);
    expect(rendered.queryByTestId("critical-connector-m1-m2")).not.toBeInTheDocument();
  });

  it("renders identically to before when no lane is hidden (backward compat)", () => {
    const { container: base } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const explicitlyUnhiddenRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      swimlanes: sampleRoadmap.swimlanes.map((l) => (l.type === "lane" ? { ...l, hidden: undefined } : l)),
    };
    const { container: unhidden } = render(<RoadmapTimeline data={explicitlyUnhiddenRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(unhidden.querySelector("svg")!.outerHTML).toBe(base.querySelector("svg")!.outerHTML);
  });
});
