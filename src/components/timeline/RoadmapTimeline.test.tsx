import { useState } from "react";
import { defaultTheme } from "./theme";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoadmapTimeline, computeDomain } from "./RoadmapTimeline";
import { BlufCallout } from "./BlufCallout";
import { sampleRoadmap } from "./__fixtures__/sample-roadmap";
import { deriveShortLabel } from "./short-label";
import { ghostsForTopLevelItemPhase, layoutItemGhosts } from "./delta-ghosts";
import type { RenderableProgram } from "./types";

describe("computeDomain (wayframe UX-2026-09-18 §7 regression — a brand-new empty Program used to crash the whole chart on mount)", () => {
  it("never crashes on a genuinely empty Program (0 milestones, 0 topLevelItems) — 'reduce of empty array with no initial value' otherwise", () => {
    const empty: RenderableProgram = { ...sampleRoadmap, milestones: [], topLevelItems: [] };
    expect(() => computeDomain(empty)).not.toThrow();
    const { domainMin, domainMax } = computeDomain(empty);
    expect(domainMin).toBeLessThan(domainMax);
  });

  it("still derives min/max from real content when present, unaffected by the empty-array fallback", () => {
    const { domainMin, domainMax } = computeDomain(sampleRoadmap);
    expect(domainMin).toBeLessThan(domainMax);
    // sampleRoadmap's own dates run 2026-01-01..2026-03-01 (see its own
    // fixture comment) — the 14-day pad shouldn't collapse to the empty
    // fallback's today-centered window.
    const jan2026 = new Date("2026-01-01T00:00:00Z").getTime();
    expect(domainMin).toBeLessThan(jan2026);
  });
});

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

describe("PROGRAM-band cross-item delta-ghost collision (t24)", () => {
  // The gap this piece of t24 fills: layoutItemGhosts alone only ranks/tiers
  // ghosts WITHIN one item — two different phases' labeled at-risk ghosts
  // could silently land on top of each other before this ticket. Two phases
  // with identical startDate/endDate/potentialDate produce identical anchor
  // x's and identical label text/width, guaranteeing a collision rather than
  // depending on approximate pixel math.
  const collidingRoadmap: RenderableProgram = {
    ...sampleRoadmap,
    topLevelItems: [
      ...sampleRoadmap.topLevelItems,
      { id: "prog-a", type: "phase", title: "Program A", startDate: "2026-01-10", endDate: "2026-02-10", status: "on-track", potentialDate: "2026-03-01" },
      { id: "prog-b", type: "phase", title: "Program B", startDate: "2026-01-10", endDate: "2026-02-10", status: "on-track", potentialDate: "2026-03-01" },
    ],
  };

  it("escalates one of the two colliding phases' labeled at-risk ghosts to a different tier instead of both claiming tier 0", () => {
    render(<RoadmapTimeline data={collidingRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const ghostA = screen.getByTestId("delta-ghost-at-risk-endDate-prog-a");
    const ghostB = screen.getByTestId("delta-ghost-at-risk-endDate-prog-b");
    // Same technique as the "delta-ghost collision-avoidance" describe
    // block above: a leader <line> back to the anchor only renders once a
    // labeled ghost escalates past tier 0. Exactly one of the two should
    // have escalated — proving the program-band zone now sees both items
    // instead of independently placing both at tier 0.
    const lines = [ghostA.querySelector("line"), ghostB.querySelector("line")];
    expect(lines.filter((l) => l !== null)).toHaveLength(1);
  });

  it("leaves each item's own local ranking untouched — both still show a single labeled ghost with its outline+label pair", () => {
    render(<RoadmapTimeline data={collidingRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const ghostA = screen.getByTestId("delta-ghost-at-risk-endDate-prog-a");
    const ghostB = screen.getByTestId("delta-ghost-at-risk-endDate-prog-b");
    expect(ghostA.querySelectorAll("rect")).toHaveLength(2);
    expect(ghostB.querySelectorAll("rect")).toHaveLength(2);
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

describe("style overrides on Program-band TopLevelItems (wayframe UX-2026-09-18 §2 — color/hidden previously never reached the PROGRAM band render at all)", () => {
  it("hides a TopLevelItem phase glyph when styleOverride.hidden is true", () => {
    const hidden: RenderableProgram = {
      ...sampleRoadmap,
      topLevelItems: sampleRoadmap.topLevelItems.map((t) => (t.id === "top-1" ? { ...t, styleOverride: { hidden: true } } : t)),
    };
    const { container } = render(<RoadmapTimeline data={hidden} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(container.querySelector('[data-testid="toplevel-glyph-top-1"]')).toBeNull();
  });

  it("hides a TopLevelItem milestone glyph when styleOverride.hidden is true", () => {
    const hidden: RenderableProgram = {
      ...sampleRoadmap,
      topLevelItems: sampleRoadmap.topLevelItems.map((t) => (t.id === "top-2" ? { ...t, styleOverride: { hidden: true } } : t)),
    };
    const { container } = render(<RoadmapTimeline data={hidden} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(container.querySelector('[data-testid="toplevel-glyph-top-2"]')).toBeNull();
  });

  it("a TopLevelItem phase's styleOverride.color wins outright over the status-color wash", () => {
    const colored: RenderableProgram = {
      ...sampleRoadmap,
      topLevelItems: sampleRoadmap.topLevelItems.map((t) => (t.id === "top-1" ? { ...t, styleOverride: { color: "#ff00ff" } } : t)),
    };
    const { container } = render(<RoadmapTimeline data={colored} today={new Date("2026-01-20T00:00:00Z")} />);
    const glyph = container.querySelector('[data-testid="toplevel-glyph-top-1"] rect');
    expect(glyph).not.toBeNull();
    expect(glyph!.getAttribute("fill")).toBe("#ff00ff");
  });

  it("a TopLevelItem milestone's styleOverride.color wins outright over the status color", () => {
    const colored: RenderableProgram = {
      ...sampleRoadmap,
      topLevelItems: sampleRoadmap.topLevelItems.map((t) => (t.id === "top-2" ? { ...t, styleOverride: { color: "#00ffcc" } } : t)),
    };
    const { container } = render(<RoadmapTimeline data={colored} today={new Date("2026-01-20T00:00:00Z")} />);
    const glyph = container.querySelector('[data-testid="toplevel-glyph-top-2"] path, [data-testid="toplevel-glyph-top-2"] rect, [data-testid="toplevel-glyph-top-2"] circle');
    expect(glyph).not.toBeNull();
    expect(glyph!.getAttribute("fill")).toBe("#00ffcc");
  });
});

describe("in-lane duration pill hidden (wayframe UX-2026-09-18 §2 regression — resolveHidden was never checked for a pill, so 'Hide from chart' silently no-opped)", () => {
  it("omits a duration-pill milestone from the chart when styleOverride.hidden is true", () => {
    const withPill: RenderableProgram["milestones"] = [
      ...sampleRoadmap.milestones,
      { id: "p1", laneId: "lane-a", title: "Design", date: "2026-01-10", endDate: "2026-02-10", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    ];
    const { container: shown } = render(<RoadmapTimeline data={{ ...sampleRoadmap, milestones: withPill }} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(shown.querySelector('[data-testid="pill-p1"]')).not.toBeNull();

    const hiddenPill = withPill.map((m) => (m.id === "p1" ? { ...m, styleOverride: { hidden: true } } : m));
    const { container: hidden } = render(<RoadmapTimeline data={{ ...sampleRoadmap, milestones: hiddenPill }} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(hidden.querySelector('[data-testid="pill-p1"]')).toBeNull();
  });
});

describe("in-lane duration pill phaseSize/phaseShape rendering (t34 regression — a styleOverride used to silently reserve layout space without ever changing the drawn pill)", () => {
  const basePill: RenderableProgram["milestones"][number] = {
    id: "ph1",
    laneId: "lane-a",
    title: "Design",
    date: "2026-01-10",
    endDate: "2026-02-10",
    status: "on-track",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
  };

  it("renders a pill taller when styleOverride.phaseSize is 'tall' than the default-size pill", () => {
    const normalRoadmap: RenderableProgram = { ...sampleRoadmap, milestones: [...sampleRoadmap.milestones, basePill] };
    const tallRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      milestones: [...sampleRoadmap.milestones, { ...basePill, styleOverride: { phaseSize: "tall" as const } }],
    };
    const { container: normalContainer } = render(<RoadmapTimeline data={normalRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const { container: tallContainer } = render(<RoadmapTimeline data={tallRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const normalRect = normalContainer.querySelector('[data-testid="pill-ph1"] rect')!;
    const tallRect = tallContainer.querySelector('[data-testid="pill-ph1"] rect')!;
    expect(Number(tallRect.getAttribute("height"))).toBeGreaterThan(Number(normalRect.getAttribute("height")));
  });

  it("renders a non-pill (small, fixed) corner radius when styleOverride.phaseShape is 'rectangle'", () => {
    const rectRoadmap: RenderableProgram = {
      ...sampleRoadmap,
      milestones: [...sampleRoadmap.milestones, { ...basePill, styleOverride: { phaseShape: "rectangle" as const } }],
    };
    const { container } = render(<RoadmapTimeline data={rectRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const rect = container.querySelector('[data-testid="pill-ph1"] rect')!;
    expect(rect.getAttribute("rx")).toBe("3");
  });

  it("defaults to a fully-rounded pill (rx = height/2) with no styleOverride", () => {
    const normalRoadmap: RenderableProgram = { ...sampleRoadmap, milestones: [...sampleRoadmap.milestones, basePill] };
    const { container } = render(<RoadmapTimeline data={normalRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const rect = container.querySelector('[data-testid="pill-ph1"] rect')!;
    expect(Number(rect.getAttribute("rx"))).toBeCloseTo(Number(rect.getAttribute("height")) / 2, 5);
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

  function svgHeight(container: HTMLElement): number {
    const svg = container.querySelector('[data-testid="roadmap-timeline"] svg');
    expect(svg).not.toBeNull();
    return Number(svg!.getAttribute("height"));
  }

  it("moving the only pill in a lane to Row 2 grows the chart's SVG height, never shrinks it (regression: previously shrank 49->18px)", () => {
    const singlePill: RenderableProgram["milestones"] = [
      ...sampleRoadmap.milestones,
      { id: "p1", laneId: "lane-a", title: "Design", date: "2026-01-10", endDate: "2026-02-10", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    ];
    const { container: baseline } = render(
      <RoadmapTimeline data={{ ...sampleRoadmap, milestones: singlePill }} today={new Date("2026-01-20T00:00:00Z")} />,
    );
    const baselineHeight = svgHeight(baseline);

    const movedToRow2 = singlePill.map((m) => (m.id === "p1" ? { ...m, laneRow: 2 } : m));
    const { container: moved } = render(
      <RoadmapTimeline data={{ ...sampleRoadmap, milestones: movedToRow2 }} today={new Date("2026-01-20T00:00:00Z")} />,
    );
    const movedHeight = svgHeight(moved);

    expect(movedHeight).toBeGreaterThan(baselineHeight);
  });

  it("adding a second Lane Row never shrinks the chart, even when the lane also has point markers (regression: markerFloor previously swallowed the extra row entirely)", () => {
    const withPointMarkerAndPill: RenderableProgram["milestones"] = [
      ...sampleRoadmap.milestones, // sampleRoadmap already has point milestones on lane-a
      { id: "p1", laneId: "lane-a", title: "Design", date: "2026-01-10", endDate: "2026-02-10", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    ];
    const { container: baseline } = render(
      <RoadmapTimeline data={{ ...sampleRoadmap, milestones: withPointMarkerAndPill }} today={new Date("2026-01-20T00:00:00Z")} />,
    );
    const baselineHeight = svgHeight(baseline);

    const withSecondRow = [
      ...withPointMarkerAndPill,
      { id: "p2", laneId: "lane-a", title: "Build", date: "2026-01-10", endDate: "2026-02-10", status: "on-track" as const, dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false, laneRow: 2 },
    ];
    const { container: grown } = render(
      <RoadmapTimeline data={{ ...sampleRoadmap, milestones: withSecondRow }} today={new Date("2026-01-20T00:00:00Z")} />,
    );
    const grownHeight = svgHeight(grown);

    expect(grownHeight).toBeGreaterThan(baselineHeight);
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

describe("row virtualization (t41)", () => {
  function manyLaneRoadmap(laneCount: number): RenderableProgram {
    const swimlanes = Array.from({ length: laneCount }, (_, i) => ({
      id: `lane-${i}`,
      order: i,
      type: "lane" as const,
      name: `Lane ${i}`,
    }));
    const milestones = swimlanes.map((lane, i) => ({
      id: `m-${i}`,
      laneId: lane.id,
      title: `Milestone ${i}`,
      date: "2026-01-10",
      status: "on-track" as const,
      dependsOn: [],
      linksToTopLevelMilestone: null,
      isCriticalPath: false,
    }));
    return { ...sampleRoadmap, swimlanes, milestones, topLevelItems: [] };
  }

  it("stays below the 50-lane budget with no overflow-y/maxHeight on the container, and every lane's content renders (below-threshold no-op)", () => {
    const { container } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const el = container.querySelector('[data-testid="roadmap-timeline"]') as HTMLElement;
    expect(el.className).not.toMatch(/overflow-y/);
    expect(el.style.maxHeight).toBe("");
  });

  it("above the 50-lane budget, the container becomes its own overflow-y scroll region with a maxHeight", () => {
    const { container } = render(<RoadmapTimeline data={manyLaneRoadmap(60)} today={new Date("2026-01-20T00:00:00Z")} />);
    const el = container.querySelector('[data-testid="roadmap-timeline"]') as HTMLElement;
    expect(el.className).toMatch(/overflow-y-auto/);
    expect(el.style.maxHeight).not.toBe("");
  });

  it("above the budget, every lane's milestone still renders under the jsdom ResizeObserver stub — virtualization fails open (render everything) when the container is unmeasured, not fail-closed", () => {
    const roadmap = manyLaneRoadmap(60);
    render(<RoadmapTimeline data={roadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    for (let i = 0; i < 60; i++) {
      expect(screen.getAllByText(`Milestone ${i}`).length).toBeGreaterThan(0);
    }
  });

  it("a 60-lane document's chart height still reserves every lane's row (virtualization never changes row position/height, only content painting)", () => {
    const belowBudget = render(<RoadmapTimeline data={manyLaneRoadmap(10)} today={new Date("2026-01-20T00:00:00Z")} />);
    const belowHeight = Number(belowBudget.container.querySelector("svg")!.getAttribute("height"));
    belowBudget.unmount();

    const aboveBudget = render(<RoadmapTimeline data={manyLaneRoadmap(60)} today={new Date("2026-01-20T00:00:00Z")} />);
    const aboveHeight = Number(aboveBudget.container.querySelector("svg")!.getAttribute("height"));
    // 6x the lanes reserves noticeably more height, proving rows aren't collapsed.
    expect(aboveHeight).toBeGreaterThan(belowHeight * 4);
  });
});

describe("exportCapture (export-pipeline-rewrite-2026-09-18, phase 1)", () => {
  function manyLaneRoadmap(laneCount: number): RenderableProgram {
    const swimlanes = Array.from({ length: laneCount }, (_, i) => ({
      id: `lane-${i}`,
      order: i,
      type: "lane" as const,
      name: `Lane ${i}`,
    }));
    const milestones = swimlanes.map((lane, i) => ({
      id: `m-${i}`,
      laneId: lane.id,
      title: `Milestone ${i}`,
      date: "2026-01-10",
      status: "on-track" as const,
      dependsOn: [],
      linksToTopLevelMilestone: null,
      isCriticalPath: false,
    }));
    return { ...sampleRoadmap, swimlanes, milestones, topLevelItems: [] };
  }

  it("forces row virtualization off above the 50-lane budget — a virtualized-out lane must never vanish from a harvested scene", () => {
    const { container } = render(<RoadmapTimeline data={manyLaneRoadmap(60)} today={new Date("2026-01-20T00:00:00Z")} exportCapture />);
    const el = container.querySelector('[data-testid="roadmap-timeline"]') as HTMLElement;
    expect(el.className).not.toMatch(/overflow-y/);
    expect(el.style.maxHeight).toBe("");
    for (let i = 0; i < 60; i++) {
      expect(screen.getAllByText(`Milestone ${i}`).length).toBeGreaterThan(0);
    }
  });

  it("forces fitRatio to 1 even when fitToScreen is on — export always wants true, uncompressed proportions, not the expand-only fit-to-screen stretch", () => {
    // A sparse (2-lane) document so fitToScreen's expand-only stretch
    // (computeFitToScreenRatio, lane-rows.ts) actually has viewport budget
    // to grow into under jsdom's default window.innerHeight.
    const sparse = manyLaneRoadmap(2);
    const natural = render(<RoadmapTimeline data={sparse} today={new Date("2026-01-20T00:00:00Z")} />);
    const naturalHeight = Number(natural.container.querySelector("svg")!.getAttribute("height"));
    natural.unmount();

    const fitted = render(<RoadmapTimeline data={sparse} today={new Date("2026-01-20T00:00:00Z")} fitToScreen />);
    const fittedHeight = Number(fitted.container.querySelector("svg")!.getAttribute("height"));
    fitted.unmount();
    // Sanity check the fixture actually exercises the stretch this test is about.
    expect(fittedHeight).toBeGreaterThan(naturalHeight);

    const captured = render(<RoadmapTimeline data={sparse} today={new Date("2026-01-20T00:00:00Z")} fitToScreen exportCapture />);
    const capturedHeight = Number(captured.container.querySelector("svg")!.getAttribute("height"));
    expect(capturedHeight).toBe(naturalHeight);
  });

  it("tags scene-meta geometry on the svg root, and lane/marker/label/pill/band/axis-row/logo `<g>` wrappers with data-scene-kind, for harvestTimelineScene to partition by", () => {
    const withLogo: RenderableProgram = {
      ...sampleRoadmap,
      companyLogo: { dataUrl: "data:image/png;base64,AAAA" },
      milestones: [
        ...sampleRoadmap.milestones,
        { id: "pill-1", laneId: "lane-a", title: "Design", date: "2026-01-10", endDate: "2026-02-10", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
      ],
    };
    const { container } = render(<RoadmapTimeline data={withLogo} today={new Date("2026-01-20T00:00:00Z")} exportCapture />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-scene-plot-left")).not.toBeNull();
    expect(svg.getAttribute("data-scene-lanes-top")).not.toBeNull();
    expect(container.querySelector('[data-scene-kind="axis-row"]')).toBeInTheDocument();
    expect(container.querySelector('[data-scene-kind="lane"]')).toBeInTheDocument();
    expect(container.querySelector('[data-scene-kind="marker"]')).toBeInTheDocument();
    expect(container.querySelector('[data-scene-kind="label"]')).toBeInTheDocument();
    expect(container.querySelector('[data-scene-kind="pill"]')).toBeInTheDocument();
    expect(container.querySelector('[data-scene-kind="program-item"]')).toBeInTheDocument();
    expect(container.querySelector('[data-scene-kind="logo"]')).toBeInTheDocument();
  });
});

describe("swimlane groups (t21, wayframe#100)", () => {
  // One group ("Group One") with two member lanes (lane-a, lane-b — reusing
  // sampleRoadmap's m1/m2, which already live there) plus one ungrouped lane
  // (lane-c). Replaces sampleRoadmap's separator row entirely — this fixture
  // is exercising the group-band path, not the separator fallback.
  const groupedRoadmap: RenderableProgram = {
    ...sampleRoadmap,
    swimlaneGroups: [{ id: "grp-1", order: 0, name: "Group One" }],
    swimlanes: [
      { id: "lane-a", order: 0, type: "lane", name: "Lane A", groupId: "grp-1" },
      { id: "lane-b", order: 1, type: "lane", name: "Lane B", groupId: "grp-1" },
      { id: "lane-c", order: 2, type: "lane", name: "Lane C" },
    ],
  };

  it("renders a group header band with the group's name, and its member lanes as ordinary rows beneath it", () => {
    render(<RoadmapTimeline data={groupedRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByText("Group One")).toBeInTheDocument();
    expect(screen.getByText("Lane A")).toBeInTheDocument();
    expect(screen.getByText("Lane B")).toBeInTheDocument();
    expect(screen.getByText("Lane C")).toBeInTheDocument();
  });

  it("collapsing a group removes its member lanes' rows entirely, and hides a milestone inside one instead of floating it at the top (the prototype's own wayframe#100 regression)", () => {
    const collapsedRoadmap: RenderableProgram = {
      ...groupedRoadmap,
      swimlaneGroups: [{ id: "grp-1", order: 0, name: "Group One", collapsed: true }],
    };
    render(<RoadmapTimeline data={collapsedRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    // lane-a/lane-b are members of the now-collapsed group — their rows are gone.
    expect(screen.queryByText("Lane A")).not.toBeInTheDocument();
    expect(screen.queryByText("Lane B")).not.toBeInTheDocument();
    // lane-c (ungrouped) is untouched.
    expect(screen.getByText("Lane C")).toBeInTheDocument();
    // m1 (lane-a) and m2 (lane-b) both live in the collapsed group — neither
    // marker renders at all, rather than orphan-stacking at the top of the chart.
    expect(screen.queryByText("First milestone")).not.toBeInTheDocument();
    expect(screen.queryByText("Second milestone")).not.toBeInTheDocument();
    // The band itself still renders (reserves its row for the caret).
    expect(screen.getByText("Group One")).toBeInTheDocument();
  });

  it("renders identically to a document that never had the concept, with zero swimlaneGroups", () => {
    const { container: base } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const explicitlyEmptyGroups: RenderableProgram = { ...sampleRoadmap, swimlaneGroups: [] };
    const { container: withEmptyGroups } = render(<RoadmapTimeline data={explicitlyEmptyGroups} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(withEmptyGroups.querySelector("svg")!.outerHTML).toBe(base.querySelector("svg")!.outerHTML);
  });

  it("calls onToggleGroupCollapsed with the group's id when its header band is clicked", () => {
    const onToggleGroupCollapsed = vi.fn();
    render(<RoadmapTimeline data={groupedRoadmap} today={new Date("2026-01-20T00:00:00Z")} onToggleGroupCollapsed={onToggleGroupCollapsed} />);
    fireEvent.click(screen.getByText("Group One"));
    expect(onToggleGroupCollapsed).toHaveBeenCalledWith("grp-1");
  });
});

describe("swimlane group nesting (t26, wayframe#104)", () => {
  // Same single-level fixture as the "swimlane groups (t21, wayframe#100)"
  // describe block's own `groupedRoadmap` above — redeclared locally since
  // that one is scoped to its own describe callback.
  const groupedRoadmap: RenderableProgram = {
    ...sampleRoadmap,
    swimlaneGroups: [{ id: "grp-1", order: 0, name: "Group One" }],
    swimlanes: [
      { id: "lane-a", order: 0, type: "lane", name: "Lane A", groupId: "grp-1" },
      { id: "lane-b", order: 1, type: "lane", name: "Lane B", groupId: "grp-1" },
      { id: "lane-c", order: 2, type: "lane", name: "Lane C" },
    ],
  };

  // A 2-level nesting: a top-level (depth-0) group containing a child
  // (depth-1) group containing a lane — the recursive layoutGroup path
  // computeRowsAndBands's doc describes.
  const nestedRoadmap: RenderableProgram = {
    ...sampleRoadmap,
    swimlaneGroups: [
      { id: "parent-grp", order: 0, name: "Parent Group" },
      { id: "child-grp", order: 0, name: "Child Group", parentGroupId: "parent-grp" },
    ],
    swimlanes: [
      { id: "lane-a", order: 0, type: "lane", name: "Lane A", groupId: "child-grp" },
      { id: "lane-b", order: 1, type: "lane", name: "Lane B" },
    ],
  };

  it("renders both a top-level band and its nested child band, with the child band's caret/label indented deeper (by exactly one nesting level) than the top-level one's", () => {
    render(<RoadmapTimeline data={nestedRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByText("Parent Group")).toBeInTheDocument();
    expect(screen.getByText("Child Group")).toBeInTheDocument();
    expect(screen.getByText("Lane A")).toBeInTheDocument();

    const parentLabel = screen.getByText("Parent Group");
    const childLabel = screen.getByText("Child Group");
    const parentG = parentLabel.closest("g")!;
    const childG = childLabel.closest("g")!;
    // The caret is the first <tspan> painted in each band's <g> (it comes
    // before the label text in render order).
    const parentCaretX = Number(parentG.querySelector("tspan")!.getAttribute("x"));
    const childCaretX = Number(childG.querySelector("tspan")!.getAttribute("x"));
    const parentLabelX = Number(parentLabel.getAttribute("x"));
    const childLabelX = Number(childLabel.getAttribute("x"));

    expect(parentCaretX).toBe(16); // depth 0: indent = 0
    expect(childCaretX).toBe(30); // depth 1: indent = 14
    expect(parentLabelX).toBe(30); // depth 0: indent = 0
    expect(childLabelX).toBe(44); // depth 1: indent = 14
  });

  it("indents a lane's own name by its group's nesting depth — a depth-1-nested lane sits deeper than a depth-1 (single-level) grouped lane would", () => {
    render(<RoadmapTimeline data={nestedRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    // lane-a's containing group (child-grp) is itself nested one level under
    // parent-grp, so groupDepth("child-grp") is 1, giving laneTextX =
    // 16 + 12*(1+1) = 40 — deeper than the 28 a lane in a top-level
    // (unnested) group gets.
    const laneALabel = screen.getByText("Lane A");
    expect(Number(laneALabel.getAttribute("x"))).toBe(40);
  });

  it("SwimlaneGroup.accentHue on a depth-0 group changes that band's rendered fill and rail width versus an otherwise-identical band with no accentHue", () => {
    const withoutHue: RenderableProgram = { ...groupedRoadmap, swimlaneGroups: [{ id: "grp-1", order: 0, name: "Group One" }] };
    const withHue: RenderableProgram = { ...groupedRoadmap, swimlaneGroups: [{ id: "grp-1", order: 0, name: "Group One", accentHue: 200 }] };

    const { container: withoutHueContainer } = render(<RoadmapTimeline data={withoutHue} today={new Date("2026-01-20T00:00:00Z")} />);
    const { container: withHueContainer } = render(<RoadmapTimeline data={withHue} today={new Date("2026-01-20T00:00:00Z")} />);

    const plainG = within(withoutHueContainer).getByText("Group One").closest("g")!;
    const tintedG = within(withHueContainer).getByText("Group One").closest("g")!;
    const [plainFillRect, plainRailRect] = plainG.querySelectorAll("rect");
    const [tintedFillRect, tintedRailRect] = tintedG.querySelectorAll("rect");

    expect(plainFillRect.getAttribute("fill")).not.toBe(tintedFillRect.getAttribute("fill"));
    expect(plainRailRect.getAttribute("width")).toBe("4");
    expect(tintedRailRect.getAttribute("width")).toBe("8");
  });

  it("a SwimlaneGroup whose parentGroupId points at a nonexistent group is treated the same as unset (top-level) — same defensive treatment an invalid Swimlane.groupId already gets", () => {
    const danglingParent: RenderableProgram = {
      ...groupedRoadmap,
      swimlaneGroups: [{ id: "grp-1", order: 0, name: "Group One", parentGroupId: "does-not-exist" }],
    };
    const { container: base } = render(<RoadmapTimeline data={groupedRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const { container: withDangling } = render(<RoadmapTimeline data={danglingParent} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(withDangling.querySelector("svg")!.outerHTML).toBe(base.querySelector("svg")!.outerHTML);
  });
});

describe("connector-line rewrite (t25, wayframe#103)", () => {
  it("reveals a milestone's tooltip when hovering its chips layer, even though the tooltip lives in the separate glyph layer", () => {
    // MilestoneChips (title/date/ghosts) and MilestoneGlyph (rings, shape,
    // tooltip) used to be one <g> with CSS group/group-hover powering the
    // tooltip; t25 split them into separate paint layers so connectors can
    // render between them, which broke group-hover across the two sibling
    // <g>s. Hover state is now lifted into RoadmapTimeline and threaded
    // down explicitly instead — this is the behavior most at risk from
    // that rewrite, so it gets real coverage, not just a DOM-presence check.
    const { container } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    const tooltip = container.querySelector('[data-testid="marker-tooltip-m1"]') as HTMLElement;
    const chips = container.querySelector('[data-testid="marker-chips-m1"]') as HTMLElement;
    const glyph = container.querySelector('[data-testid="marker-glyph-m1"]') as HTMLElement;
    expect(tooltip).not.toBeNull();
    expect(tooltip.style.opacity).toBe("0");

    fireEvent.mouseEnter(chips);
    expect(tooltip.style.opacity).toBe("1");
    fireEvent.mouseLeave(chips);
    expect(tooltip.style.opacity).toBe("0");

    // Hovering the glyph itself (not just its chips) must still work too.
    fireEvent.mouseEnter(glyph);
    expect(tooltip.style.opacity).toBe("1");
    fireEvent.mouseLeave(glyph);
    expect(tooltip.style.opacity).toBe("0");
  });

  const threeLaneBase: RenderableProgram = {
    ...sampleRoadmap,
    swimlanes: [
      { id: "sep-1", order: 0, type: "separator", name: "Group" },
      { id: "lane-a", order: 1, type: "lane", name: "Lane A" },
      { id: "lane-mid", order: 2, type: "lane", name: "Lane Mid" },
      { id: "lane-c", order: 3, type: "lane", name: "Lane C" },
    ],
    topLevelItems: [],
    // m1 -> m3 both critical, so the dependency always draws
    // (data-testid="critical-connector-m1-m3") regardless of showConnector,
    // and its naive geometric midpoint (temporally: Jan 11, exactly halfway
    // between Jan 1 and Jan 21) crosses lane-mid, strictly between the two
    // endpoint lanes.
    milestones: [
      { id: "m1", laneId: "lane-a", title: "Start", date: "2026-01-01", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: true },
      { id: "m3", laneId: "lane-c", title: "End", date: "2026-01-21", status: "on-track", dependsOn: [{ id: "m1", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },
    ],
  };

  function firstConnectorD(container: HTMLElement, testId: string): string {
    const path = container.querySelector(`[data-testid="${testId}"] path`);
    expect(path).not.toBeNull();
    return path!.getAttribute("d")!;
  }

  function parseElbowMidX(d: string): number {
    // "M{x1},{y1} L{midX},{y1} L{midX},{y2} L{x2},{y2}"
    const match = d.match(/^M[-\d.]+,[-\d.]+ L([-\d.]+),/);
    if (!match) throw new Error(`could not parse elbow path: ${d}`);
    return Number(match[1]);
  }

  it("routes a connector's midpoint away from a lane-mid milestone sitting on the naive midpoint, versus staying naive when lane-mid is empty", () => {
    const clear = threeLaneBase; // lane-mid has no milestones at all
    const blocked: RenderableProgram = {
      ...threeLaneBase,
      milestones: [
        ...threeLaneBase.milestones,
        // Sits exactly at the naive midpoint date, in the lane strictly
        // between m1 and m3's lanes — its date-label chip alone (no delta
        // ghost needed) is enough to occupy that column in lane-mid's zone.
        { id: "m2", laneId: "lane-mid", title: "Mid", date: "2026-01-11", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
      ],
    };

    const { container: clearContainer } = render(<RoadmapTimeline data={clear} today={new Date("2026-01-20T00:00:00Z")} />);
    const { container: blockedContainer } = render(<RoadmapTimeline data={blocked} today={new Date("2026-01-20T00:00:00Z")} />);

    const clearD = firstConnectorD(clearContainer, "critical-connector-m1-m3");
    const blockedD = firstConnectorD(blockedContainer, "critical-connector-m1-m3");

    expect(blockedD).not.toBe(clearD);
    const clearMidX = parseElbowMidX(clearD);
    const blockedMidX = parseElbowMidX(blockedD);
    // Swept to a clear column in fixed 8px steps (SWEEP_STEP), not an
    // arbitrary shift.
    const stepsMoved = Math.abs(blockedMidX - clearMidX) / 8;
    expect(Number.isInteger(stepsMoved)).toBe(true);
    expect(stepsMoved).toBeGreaterThan(0);
    expect(stepsMoved).toBeLessThanOrEqual(6);
  });

  it("leaves a same-lane connector's midpoint at the naive geometric midpoint, unaffected by chips sitting on it", () => {
    const sameLane: RenderableProgram = {
      ...threeLaneBase,
      milestones: [
        { id: "m1", laneId: "lane-a", title: "Start", date: "2026-01-01", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: true },
        // Sits at m1->m3's own naive midpoint date, in the SAME lane as
        // both endpoints — there is no "between" lane to cross, so this
        // must never affect the connector's routing even though it's a
        // real chip sitting right on the geometric midpoint column.
        { id: "m2", laneId: "lane-a", title: "Mid", date: "2026-01-11", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
        { id: "m3", laneId: "lane-a", title: "End", date: "2026-01-21", status: "on-track", dependsOn: [{ id: "m1", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },
      ],
    };

    const { container } = render(<RoadmapTimeline data={sameLane} today={new Date("2026-01-20T00:00:00Z")} />);
    const d = firstConnectorD(container, "critical-connector-m1-m3");
    const midX = parseElbowMidX(d);
    const match = d.match(/^M([-\d.]+),([-\d.]+) L/);
    const x1 = Number(match![1]);
    const y = Number(match![2]);
    const lastMatch = d.match(/L([-\d.]+),([-\d.]+)$/);
    const x2 = Number(lastMatch![1]);
    expect(midX).toBeCloseTo(x1 + (x2 - x1) / 2, 5);
    // Same-lane: y1 === y2, both ends at the lane's own y.
    expect(d).toBe(`M${x1},${y} L${midX},${y} L${midX},${y} L${x2},${y}`);
  });
});

describe("TopLevelItem selection (wayframe#t33) — mass-edit's selectability now extends to milestone/phase TopLevelItems", () => {
  it("routes a Cmd/Ctrl-click through onToggleSelect instead of onTopLevelItemClick, for both the phase and milestone variants, with no Select mode required (wayframe UX-2026-09-18 §4)", () => {
    const onToggleSelect = vi.fn();
    const onTopLevelItemClick = vi.fn();
    const { container } = render(
      <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} onToggleSelect={onToggleSelect} onTopLevelItemClick={onTopLevelItemClick} />,
    );
    fireEvent.click(container.querySelector('[data-testid="toplevel-glyph-top-1"]')!, { metaKey: true }); // phase
    fireEvent.click(container.querySelector('[data-testid="toplevel-glyph-top-2"]')!, { ctrlKey: true }); // milestone
    expect(onToggleSelect).toHaveBeenCalledWith("top-1");
    expect(onToggleSelect).toHaveBeenCalledWith("top-2");
    expect(onTopLevelItemClick).not.toHaveBeenCalled();
  });

  it("a plain click (no modifier) still calls onTopLevelItemClick when Select mode is off — modifier-click is additive, not a replacement (wayframe UX-2026-09-18 §4)", () => {
    const onTopLevelItemClick = vi.fn();
    const { container } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} onTopLevelItemClick={onTopLevelItemClick} />);
    fireEvent.click(container.querySelector('[data-testid="toplevel-glyph-top-2"]')!);
    expect(onTopLevelItemClick).toHaveBeenCalledTimes(1);
    expect(onTopLevelItemClick.mock.calls[0][0]).toMatchObject({ id: "top-2" });
  });

  it("a plain click still toggles selection when Select mode IS explicitly armed — unchanged behavior the All-Programs bulk-edit page relies on (wayframe#t33), Cmd/Ctrl-click is an additional path, not a replacement", () => {
    const onToggleSelect = vi.fn();
    const onTopLevelItemClick = vi.fn();
    const { container } = render(
      <RoadmapTimeline
        data={sampleRoadmap}
        today={new Date("2026-01-20T00:00:00Z")}
        selectionModeEnabled
        onToggleSelect={onToggleSelect}
        onTopLevelItemClick={onTopLevelItemClick}
      />,
    );
    fireEvent.click(container.querySelector('[data-testid="toplevel-glyph-top-2"]')!);
    expect(onToggleSelect).toHaveBeenCalledWith("top-2");
    expect(onTopLevelItemClick).not.toHaveBeenCalled();
  });

  it("renders a dashed accent selection ring for a selected phase and a selected milestone TopLevelItem", () => {
    const { container } = render(
      <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} selectionModeEnabled selectedIds={new Set(["top-1", "top-2"])} />,
    );
    const phaseGroup = container.querySelector('[data-testid="toplevel-glyph-top-1"]')!;
    expect(phaseGroup.querySelector('rect[stroke-dasharray="2 2"]')).not.toBeNull();
    const milestoneGroup = container.querySelector('[data-testid="toplevel-glyph-top-2"]')!;
    expect(milestoneGroup.querySelector('[stroke-dasharray="2 2"]')).not.toBeNull();
  });

  it("renders no selection ring when unselected, even in selection mode", () => {
    const { container } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} selectionModeEnabled selectedIds={new Set()} />);
    const phaseGroup = container.querySelector('[data-testid="toplevel-glyph-top-1"]')!;
    expect(phaseGroup.querySelector('[stroke-dasharray="2 2"]')).toBeNull();
  });

  it("never wires an annotation TopLevelItem into selection — it renders no toplevel-glyph testid at all", () => {
    const onToggleSelect = vi.fn();
    const { container } = render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} selectionModeEnabled onToggleSelect={onToggleSelect} />);
    expect(container.querySelector('[data-testid="toplevel-glyph-top-3"]')).toBeNull();
  });
});

describe("lane point-milestone selection via Cmd/Ctrl-click (wayframe UX-2026-09-18 §4 — no Select mode required)", () => {
  it("a Cmd-click on a point marker calls onToggleSelect, not onMilestoneClick; a plain click still calls onMilestoneClick", () => {
    const onToggleSelect = vi.fn();
    const onMilestoneClick = vi.fn();
    const { container } = render(
      <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} onToggleSelect={onToggleSelect} onMilestoneClick={onMilestoneClick} />,
    );
    const marker = container.querySelector('[data-testid="marker-glyph-m1"]')!;
    fireEvent.click(marker, { metaKey: true });
    expect(onToggleSelect).toHaveBeenCalledWith("m1");
    expect(onMilestoneClick).not.toHaveBeenCalled();

    fireEvent.click(marker);
    expect(onMilestoneClick).toHaveBeenCalledTimes(1);
    expect(onMilestoneClick.mock.calls[0][0]).toMatchObject({ id: "m1" });
  });
});
