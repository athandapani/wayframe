import { useState } from "react";
import { defaultTheme } from "./theme";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoadmapTimeline } from "./RoadmapTimeline";
import { BlufCallout } from "./BlufCallout";
import { sampleRoadmap } from "./__fixtures__/sample-roadmap";
import { deriveShortLabel } from "./short-label";
import type { RoadmapData } from "./types";

describe("RoadmapTimeline", () => {
  it("renders swimlanes, separators, and milestones", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByTestId("roadmap-timeline")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByText("Lane A")).toBeInTheDocument();
    expect(screen.getByText("Lane B")).toBeInTheDocument();
    expect(screen.getByText("Phase One")).toBeInTheDocument();
    expect(screen.getByText("Kickoff")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
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

describe("ghost-rendering a slipped milestone (wayframe#29/#30)", () => {
  const slippedRoadmap: RoadmapData = {
    ...sampleRoadmap,
    milestones: sampleRoadmap.milestones.map((m) => (m.id === "m2" ? { ...m, originalDate: "2026-01-25" } : m)),
  };

  it("renders nothing extra when ghostMode is off, even for a slipped milestone", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="off" />);
    expect(screen.queryByTestId("ghost-badge-m2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ghost-outline-m2")).not.toBeInTheDocument();
  });

  it("renders nothing extra for a milestone that hasn't slipped, even with ghosts on", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="badge" />);
    expect(screen.queryByTestId("ghost-badge-m1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ghost-outline-m1")).not.toBeInTheDocument();
  });

  it("style badge: shows a +/-Nd slip badge next to the current marker, no mark at the old date", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="badge" />);
    expect(screen.getByTestId("ghost-badge-m2")).toBeInTheDocument();
    expect(screen.getByText("+21d")).toBeInTheDocument();
    expect(screen.queryByTestId("ghost-outline-m2")).not.toBeInTheDocument();
  });

  it("style outline: shows a dashed outline at the old date, no badge", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="outline" />);
    expect(screen.getByTestId("ghost-outline-m2")).toBeInTheDocument();
    expect(screen.queryByTestId("ghost-badge-m2")).not.toBeInTheDocument();
    expect(screen.queryByText("+21d")).not.toBeInTheDocument();
  });

  it("shows the old→new date detail in the hover tooltip", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="badge" />);
    expect(screen.getByText((_, el) => el?.textContent === "Jan 25 → Feb 15")).toBeInTheDocument();
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

function ControlledBlufCallout({ bluf }: { bluf: { statement: string; bullets: string[] } }) {
  const [open, setOpen] = useState(true);
  return <BlufCallout bluf={bluf} open={open} onOpenChange={setOpen} theme={defaultTheme} />;
}

describe("BlufCallout", () => {
  it("renders the bluf statement and bullets, and can be dismissed and reopened", () => {
    render(<ControlledBlufCallout bluf={sampleRoadmap.bluf} />);
    expect(screen.getByText(sampleRoadmap.bluf.statement)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(sampleRoadmap.bluf.statement)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("So what?"));
    expect(screen.getByText(sampleRoadmap.bluf.statement)).toBeInTheDocument();
  });
});
