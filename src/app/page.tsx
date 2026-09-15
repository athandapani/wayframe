"use client";

// The real production entry page (wayframe#25), replacing the placeholder
// splash. A visitor without a saved document sees the input form
// (EntryForm); a returning visitor with one already in localStorage lands
// straight back in their workspace, no separate "resume" affordance — the
// simplest reading of the map's persistence intent (wayframe#20). Checking
// storage happens post-mount (`storageCheck.checked`) so this renders
// identically on the server and on first client paint before the check
// resolves.
import { useEffect, useState } from "react";
import type { PortfolioDocument } from "@/components/timeline/types";
import { RoadmapWorkspace } from "@/components/workspace/RoadmapWorkspace";
import { EntryForm } from "@/components/entry-form/EntryForm";
import { loadPersistedDocument } from "@/components/correction-box/use-correction-box";
import { AuthControls } from "@/components/auth/AuthControls";
import { useOwnedPortfolioId } from "@/lib/auth/use-owned-portfolio-id";

interface StorageCheck {
  checked: boolean;
  roadmap: PortfolioDocument | null;
}

export default function Home() {
  const [storageCheck, setStorageCheck] = useState<StorageCheck>({ checked: false, roadmap: null });
  const [today] = useState(() => new Date());
  const ownedPortfolioId = useOwnedPortfolioId();

  useEffect(() => {
    let roadmap: PortfolioDocument | null = null;
    try {
      roadmap = loadPersistedDocument();
    } finally {
      setStorageCheck({ checked: true, roadmap });
    }
  }, []);

  const { checked, roadmap } = storageCheck;
  const setRoadmap = (document: PortfolioDocument) => setStorageCheck({ checked: true, roadmap: document });

  if (!checked) return null;

  return (
    <>
      <AuthControls />
      {roadmap ? (
        <RoadmapWorkspace
          initialData={roadmap.programs[0]}
          initialPortfolio={roadmap.portfolio}
          today={today}
          onStartNew={() => setStorageCheck({ checked: true, roadmap: null })}
          canManageSharing={ownedPortfolioId !== null && ownedPortfolioId === roadmap.portfolio.id}
        />
      ) : (
        <EntryForm onExtracted={setRoadmap} />
      )}
    </>
  );
}
