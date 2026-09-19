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
import Link from "next/link";
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
      {/* Found 2026-09-19: useMigrateLocalPortfolioOnSignIn (wired into
          AuthControls) silently migrates this page's localStorage document
          into a hosted Portfolio the first time a visitor signs in — but
          nothing ever surfaced that hosted Portfolio's URL anywhere. This
          page already fetches ownedPortfolioId (for canManageSharing
          below); it just never rendered a link with it, leaving a signed-in
          user with no way to reach /p/[portfolioId] (and therefore no way
          to reach All Programs / New Program) at all except typing the URL
          from memory. Same top-16 left-4 position as the "View all
          Programs" link on /p/[portfolioId]/page.tsx — clear of
          RoadmapWorkspace's own logo/caption block at top-3 left-4, and
          consistent with it since this is the sibling page. */}
      {ownedPortfolioId && (
        <div className="fixed top-16 left-4 z-50 rounded-md bg-white/90 px-2 py-1 text-xs shadow-sm">
          <Link href={`/p/${ownedPortfolioId}`} className="text-blue-600 hover:underline">
            Open my hosted Portfolio →
          </Link>
        </div>
      )}
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
