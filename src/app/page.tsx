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
import type { RoadmapData } from "@/components/timeline/types";
import { RoadmapWorkspace } from "@/components/workspace/RoadmapWorkspace";
import { EntryForm } from "@/components/entry-form/EntryForm";
import { loadPersistedDocument } from "@/components/correction-box/use-correction-box";

interface StorageCheck {
  checked: boolean;
  roadmap: RoadmapData | null;
}

export default function Home() {
  const [storageCheck, setStorageCheck] = useState<StorageCheck>({ checked: false, roadmap: null });
  const [today] = useState(() => new Date());

  useEffect(() => {
    let roadmap: RoadmapData | null = null;
    try {
      roadmap = loadPersistedDocument();
    } finally {
      setStorageCheck({ checked: true, roadmap });
    }
  }, []);

  const { checked, roadmap } = storageCheck;
  const setRoadmap = (data: RoadmapData) => setStorageCheck({ checked: true, roadmap: data });

  if (!checked) return null;

  if (roadmap) {
    return <RoadmapWorkspace initialData={roadmap} today={today} />;
  }

  return <EntryForm onExtracted={setRoadmap} />;
}
