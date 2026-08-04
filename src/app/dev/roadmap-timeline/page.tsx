// Dev-only visual QA page for RoadmapTimeline — not part of the product
// nav. Renders the same fixture the unit tests use. Gated so it can't ship
// to production even if this route survives a merge.
//
// PROTOTYPE OVERRIDE (wayframe#29) — temporarily repurposed to host the
// ghost-rendering variant switcher. Restore the plain RoadmapTimeline +
// sampleRoadmap render below once a variant wins and gets folded in.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { GhostPrototype } from "./GhostPrototype";

export default function RoadmapTimelineDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Suspense>
      <GhostPrototype />
    </Suspense>
  );
}
