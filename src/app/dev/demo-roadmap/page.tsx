// Dev-only visual QA page for the official demo dataset (wayframe issue
// #10) — not part of the product nav. Gated so it can't ship to production
// even if this route survives a merge.
import { notFound } from "next/navigation";
import { DemoRoadmapView } from "./DemoRoadmapView";

export default function DemoRoadmapDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  // wayframe#9 prototype: append ?correction-box=1 (and optionally
  // &variant=a|b|c) to try the AI-assisted correction-box variants instead
  // of the plain read-only preview.
  return <DemoRoadmapView />;
}
