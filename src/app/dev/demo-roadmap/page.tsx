// Dev-only visual QA page for the official demo dataset (wayframe issue
// #10) — not part of the product nav. Gated so it can't ship to production
// even if this route survives a merge. Also previews the Executive/Program
// view toggle (wayframe issue #8).
import { notFound } from "next/navigation";
import { DemoRoadmapView } from "./DemoRoadmapView";

export default function DemoRoadmapDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return <DemoRoadmapView />;
}
