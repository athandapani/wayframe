"use client";

// The real production entry page (wayframe#25), replacing the placeholder
// splash. An unauthenticated visitor without a saved document sees the
// input form (EntryForm); one with a document already in localStorage lands
// straight back in their workspace, no separate "resume" affordance — the
// simplest reading of the map's persistence intent (wayframe#20), and #117's
// "keep the anonymous localStorage-only / page as a labeled trial mode"
// decision. Checking storage happens post-mount (`storageCheck.checked`) so
// this renders identically on the server and on first client paint before
// the check resolves.
//
// A signed-in visitor instead lands on "My Roadmaps" (wayframe#123, #130's
// destination point 2) — every hosted Roadmap they have a role on, plus
// "+ New Roadmap" — which fully supersedes both the localStorage-doc branch
// below and the old hard-coded "Open my hosted Portfolio" link it used to
// render (useMigrateLocalPortfolioOnSignIn, wired into AuthControls, still
// silently migrates any pre-sign-in localStorage document into a hosted
// Roadmap the first time a visitor signs in; MyRoadmapsLanding's own fetch
// just won't show it until that migration POST completes and the list is
// reloaded).
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { PortfolioDocument } from "@/components/timeline/types";
import { RoadmapWorkspace } from "@/components/workspace/RoadmapWorkspace";
import { EntryForm } from "@/components/entry-form/EntryForm";
import { loadPersistedDocument, clearPersistedDocument } from "@/components/correction-box/use-correction-box";
import { AuthControls } from "@/components/auth/AuthControls";
import { MyRoadmapsLanding } from "@/components/roadmaps/MyRoadmapsLanding";

interface StorageCheck {
  checked: boolean;
  roadmap: PortfolioDocument | null;
  origin?: "extracted" | "blank";
}

export default function Home() {
  const [storageCheck, setStorageCheck] = useState<StorageCheck>({ checked: false, roadmap: null });
  const [today] = useState(() => new Date());
  const { status } = useSession();

  useEffect(() => {
    let roadmap: PortfolioDocument | null = null;
    try {
      roadmap = loadPersistedDocument();
    } finally {
      setStorageCheck({ checked: true, roadmap });
    }
  }, []);

  const { checked, roadmap, origin } = storageCheck;
  const setRoadmap = (document: PortfolioDocument, origin: "extracted" | "blank") =>
    setStorageCheck({ checked: true, roadmap: document, origin });

  if (status === "loading") return null;

  if (status === "authenticated") {
    return (
      <>
        <AuthControls />
        <MyRoadmapsLanding />
      </>
    );
  }

  if (!checked) return null;

  return (
    <>
      <AuthControls />
      {roadmap ? (
        <RoadmapWorkspace
          initialData={roadmap.programs[0]}
          initialPortfolio={roadmap.portfolio}
          today={today}
          onStartNew={() => {
            clearPersistedDocument();
            setStorageCheck({ checked: true, roadmap: null });
          }}
          newDocumentOrigin={origin}
        />
      ) : (
        <EntryForm onExtracted={setRoadmap} />
      )}
    </>
  );
}
