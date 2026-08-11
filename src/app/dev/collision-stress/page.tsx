// Dev-only text-collision QA route — gated so it can't ship to production
// even if this route survives a merge. See CollisionStressView.tsx for what
// it renders and why.
import { notFound } from "next/navigation";
import { CollisionStressView } from "./CollisionStressView";

export default function CollisionStressPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <CollisionStressView />;
}
