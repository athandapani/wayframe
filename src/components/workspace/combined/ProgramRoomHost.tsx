"use client";

// One Program's live editing state, as a headless component (wayframe#126).
//
// #118 settled that the combined view connects EVERY Program's room rather
// than lazy-connecting by viewport ("typical scale is 3-4 Programs, so
// connect all of them"), and `useCorrectionBox`/`useProgramRoom` are both
// hooks — one pair per Program. A component can't call a hook per element of
// a list whose length can change between renders, so each Program gets its
// own mounted component instead, keyed by Program id, and publishes its box
// and connection state up to the surface that owns the canvas. That's the
// whole job: this renders nothing.
//
// Why publishing goes through a callback rather than the parent holding the
// state: `box` carries ~60 action functions plus a live `Program`, and only
// the hook that owns it can produce the current one. This publishes after
// every commit; the parent is expected to keep the latest per Program and
// bail out of re-rendering when nothing it renders moved (see
// CombinedProgramEditor's `publish`), which is what keeps a
// publish-every-commit contract from looping.
//
// Each Program's box is created with `persist: false`: localStorage
// persistence is single-document by construction (one STORAGE_KEY), so N
// boxes sharing it would each clobber the others, and this surface's
// persistence is the Yjs room per Program anyway.

import { useEffect } from "react";
import type { Portfolio, Program } from "@/components/timeline/types";
import { useCorrectionBox, type UseCorrectionBoxResult } from "@/components/correction-box/use-correction-box";
import { useProgramRoom, type ConnectionStatus, type ProgramRoomIdentity } from "@/lib/realtime/use-program-room";
import type { RoomAccess } from "@/lib/realtime/provider";
import type { Peer } from "@/components/workspace/PresenceAvatars";

export interface ProgramConnection {
  programId: string;
  /** The live box — the ONLY sanctioned path into this Program's Yjs doc (see use-program-room.ts's local->remote sync effect). */
  box: UseCorrectionBoxResult;
  status: ConnectionStatus;
  showOfflineBadge: boolean;
  peers: (Peer & { selectedId?: string | null })[];
}

export function ProgramRoomHost({
  program,
  portfolio,
  today,
  access,
  identity,
  selectedId,
  enabled,
  onPublish,
}: {
  program: Program;
  /** Seeds this box's Portfolio half. Portfolio-level editing is deliberately not offered on the combined surface — see CombinedProgramEditor's header for why N boxes each holding their own Portfolio copy must not be written to from here. */
  portfolio: Portfolio;
  today: Date;
  access: RoomAccess;
  identity: ProgramRoomIdentity;
  /** The merged id currently open in the inspector, or null — de-namespaced by the caller, so this is already this Program's own local id (or null when the selection belongs to a different Program). */
  selectedId: string | null;
  /** False before the caller knows its access/identity — keeps the hook call order stable while opening no connection, same contract `useProgramRoom` already documents. */
  enabled: boolean;
  onPublish: (connection: ProgramConnection) => void;
}) {
  const box = useCorrectionBox(program, portfolio, false, today);
  const room = useProgramRoom({ programId: program.id, box, access, identity, selectedId, enabled });

  // No dependency array, deliberately: `box` is a fresh object every render
  // (its actions close over the current state), so there is no honest dep
  // list that means "whenever anything about this Program changed" — this
  // fires once per commit and lets the parent de-duplicate, which it does
  // by comparing what it actually renders and bailing out otherwise (see
  // CombinedProgramEditor's `publish`). That contract is why an unstable
  // `onPublish` can't turn this into a render loop either.
  useEffect(() => {
    onPublish({
      programId: program.id,
      box,
      status: room.status,
      showOfflineBadge: room.showOfflineBadge,
      peers: room.peers,
    });
  });

  return null;
}
