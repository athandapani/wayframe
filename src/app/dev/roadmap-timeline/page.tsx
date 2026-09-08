// Dev-only visual QA page for RoadmapTimeline — not part of the product
// nav. Renders the same fixture the unit tests use. Gated so it can't ship
// to production even if this route survives a merge.
//
// PROTOTYPE (wayframe#100, throwaway): ?groups=rail|header|hybrid switches
// data.swimlaneGroups on and picks which RoadmapTimeline.groupBandVariant
// renders it, per the mattpocock-skills `prototype` UI recipe (sub-shape A —
// same route, real fixture data, only the rendered subtree/prop changes).
// Same pattern prototype/zoom-mechanism-84 used on this exact route. Collapse
// state lives here (not in the fixture) since it's document content the
// real app would persist through onToggleGroupCollapsed — this page just
// simulates that round-trip in memory.
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { notFound } from "next/navigation";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { defaultTheme } from "@/components/timeline/theme";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";
import { prototypeGroupsFixture } from "@/components/timeline/__fixtures__/prototype-groups-fixture";
import type { RoadmapData } from "@/components/timeline/types";

const GROUP_VARIANTS = ["rail", "header", "hybrid"] as const;
type GroupVariant = (typeof GROUP_VARIANTS)[number];

const VARIANT_LABEL: Record<GroupVariant, string> = {
  rail: "A — dedicated rotated rail",
  header: "B — full-width header band",
  hybrid: "C — thin spine, rotate-if-tall",
};

function GroupsPrototypeSwitcher({ current }: { current: GroupVariant }) {
  const router = useRouter();
  const go = (v: GroupVariant) => router.replace(`/dev/roadmap-timeline?groups=${v}`);
  const idx = GROUP_VARIANTS.indexOf(current);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#1c2128",
        color: "#fff",
        borderRadius: 999,
        padding: "8px 14px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        fontSize: 13,
        zIndex: 1000,
      }}
    >
      <button onClick={() => go(GROUP_VARIANTS[(idx - 1 + GROUP_VARIANTS.length) % GROUP_VARIANTS.length])} style={{ color: "#fff", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>
        ←
      </button>
      <span>
        <b>wayframe#100</b> — {VARIANT_LABEL[current]}
      </span>
      <button onClick={() => go(GROUP_VARIANTS[(idx + 1) % GROUP_VARIANTS.length])} style={{ color: "#fff", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>
        →
      </button>
    </div>
  );
}

export default function RoadmapTimelineDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <RoadmapTimelineDevPreviewInner />
    </Suspense>
  );
}

function RoadmapTimelineDevPreviewInner() {
  const [blufOpen, setBlufOpen] = useState(true);
  const searchParams = useSearchParams();
  const groupsParam = searchParams.get("groups");
  const groupVariant: GroupVariant = GROUP_VARIANTS.includes(groupsParam as GroupVariant) ? (groupsParam as GroupVariant) : "header";
  const groupsMode = GROUP_VARIANTS.includes(groupsParam as GroupVariant);

  // In-memory collapse state, seeded from the fixture's document-content
  // default — real usage would write this back into the document the same
  // way onMilestoneDateChange writes a moved date back.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set((prototypeGroupsFixture.swimlaneGroups ?? []).filter((g) => g.collapsed).map((g) => g.id)),
  );
  const data: RoadmapData = groupsMode
    ? {
        ...prototypeGroupsFixture,
        swimlaneGroups: (prototypeGroupsFixture.swimlaneGroups ?? []).map((g) => ({ ...g, collapsed: collapsedIds.has(g.id) })),
      }
    : sampleRoadmap;

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px]">
        <BlufCallout bluf={data.bluf} open={blufOpen} onOpenChange={setBlufOpen} theme={defaultTheme} />
        <RoadmapTimeline
          data={data}
          today={new Date("2026-01-20T00:00:00Z")}
          groupBandVariant={groupVariant}
          onToggleGroupCollapsed={(groupId) =>
            setCollapsedIds((prev) => {
              const next = new Set(prev);
              if (next.has(groupId)) next.delete(groupId);
              else next.add(groupId);
              return next;
            })
          }
        />
      </div>
      {groupsMode && <GroupsPrototypeSwitcher current={groupVariant} />}
    </div>
  );
}
