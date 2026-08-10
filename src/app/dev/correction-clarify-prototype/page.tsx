// Dev-only visual QA page for the correction-box clarifying-question
// prototype — not part of the product nav. Gated so it can't ship to
// production even if this route survives a merge.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CorrectionClarifyView } from "./CorrectionClarifyView";

export default function CorrectionClarifyDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Suspense>
      <CorrectionClarifyView />
    </Suspense>
  );
}
