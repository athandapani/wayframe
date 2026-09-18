import { describe, expect, it } from "vitest";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";
import { computeDomain } from "@/components/timeline/RoadmapTimeline";
import { defaultTheme } from "@/components/timeline/theme";
import { generateExecutiveSummary } from "@/components/executive-view/timeline-summary";
import type { ExportSlideDescriptor } from "./build-export-slides";
import { buildNativePptx } from "./export-native-deck";

const domain = computeDomain(sampleRoadmap);

describe("buildNativePptx", () => {
  it("builds a real pptxgenjs Presentation from program + executive descriptors without throwing", async () => {
    const descriptors: ExportSlideDescriptor[] = [
      { label: "Sample Program", mode: "program", data: sampleRoadmap },
      { label: "Executive", mode: "executive", data: sampleRoadmap, timelineSummary: generateExecutiveSummary(sampleRoadmap) },
    ];
    const pres = await buildNativePptx(descriptors, defaultTheme, domain, false);
    expect(pres).toBeDefined();
  });

  it("produces non-trivial real .pptx bytes end-to-end (real pptxgenjs, no mocking)", async () => {
    const descriptors: ExportSlideDescriptor[] = [{ label: "Sample Program", mode: "program", data: sampleRoadmap }];
    const pres = await buildNativePptx(descriptors, defaultTheme, domain, false);
    const buffer = await pres.write({ outputType: "nodebuffer" });
    expect(buffer).toBeDefined();
    expect((buffer as Buffer).length).toBeGreaterThan(1000);
  });

  it("handles a Program with a duration-pill milestone, connector, and hidden lane without throwing", async () => {
    const richProgram = {
      ...sampleRoadmap,
      swimlanes: [...sampleRoadmap.swimlanes, { id: "lane-c", order: 3, type: "lane" as const, name: "Lane C", hidden: true }],
      milestones: [
        ...sampleRoadmap.milestones,
        { id: "p1", laneId: "lane-a", title: "Design phase", date: "2026-01-02", endDate: "2026-01-20", status: "on-track" as const, dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
      ],
    };
    const descriptors: ExportSlideDescriptor[] = [{ label: "Rich Program", mode: "program", data: richProgram }];
    const pres = await buildNativePptx(descriptors, defaultTheme, computeDomain(richProgram), true);
    const buffer = await pres.write({ outputType: "nodebuffer" });
    expect((buffer as Buffer).length).toBeGreaterThan(1000);
  });
});
