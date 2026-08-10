// Dev-only visual QA page for the So-what editing prototype (wayframe#38
// item 4) — not part of the product nav. Gated so it can't ship to
// production even if this route survives a merge.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BlufEditingPrototypeView } from "./BlufEditingPrototypeView";

export default function BlufEditingPrototypeDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Suspense>
      <BlufEditingPrototypeView />
    </Suspense>
  );
}
