"use client";

import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type YProvider from "y-partyserver/provider";
import type { Program } from "@/components/timeline/types";
import type { UseCorrectionBoxResult } from "@/components/correction-box/use-correction-box";
import { connectProgramRoom, type RoomAccess } from "./provider";
import { isProgramDocSeeded, seedProgramDoc, readProgramFromDoc, applyProgramPatch } from "./program-ydoc";
import { detectOrphanedEdits } from "./program-conflict";
import { LOCAL_ORIGIN } from "./undo-manager";
import type { Peer } from "@/components/workspace/PresenceAvatars";

/**
 * The real live room-connection hook (wayframe t38, fork 2) — the piece that
 * finally wires fork 1's Program<->Yjs bridge (program-ydoc.ts) and
 * conflict-detector (program-conflict.ts) up to a real `connectProgramRoom`
 * WebSocket connection and drives a `UseCorrectionBoxResult` from it. Nothing
 * in the app called `connectProgramRoom` before this file existed.
 *
 * One `Y.Doc` + one `YProvider` per `(programId, enabled)` pair, held in refs
 * (not state — they must never themselves trigger a re-render). See each
 * effect below for the bootstrap/echo-avoidance/reconnect/presence details;
 * this file's own doc comments on each ref explain what invariant it
 * upholds, since the ticket's ref-timing requirements are exact.
 */

export interface ProgramRoomIdentity {
  name: string;
  /** Stable per-session identifier used to derive a consistent color (e.g. session user email, or a guest's guestId) — NOT itself displayed. */
  identityKey: string;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface UseProgramRoomResult {
  status: ConnectionStatus;
  /** Debounced (~2.5s): true only once a drop has been continuously disconnected for that long. Clears instantly (no debounce) the moment status becomes "connected" again. */
  showOfflineBadge: boolean;
  /** Remote peers currently present, including any in their disconnect grace period. */
  peers: (Peer & { selectedId?: string | null })[];
}

/**
 * Fixed palette a peer's `identity.identityKey` hashes into (see `colorFor`
 * below) — no existing peer/category color palette was found elsewhere in
 * the codebase to reuse (CategoryManager.tsx's legend categories are
 * user-picked colors, not a fixed palette), so this is a small new one:
 * ~7 visually distinct hues, none of them a RAG status color
 * (green/amber/red), so a peer's avatar never reads as a status indicator.
 */
const PEER_COLOR_PALETTE = ["#6366f1", "#0ea5e9", "#14b8a6", "#a855f7", "#ec4899", "#f97316", "#84cc16"];

function colorFor(identityKey: string): string {
  let sum = 0;
  for (let i = 0; i < identityKey.length; i++) sum += identityKey.charCodeAt(i);
  return PEER_COLOR_PALETTE[sum % PEER_COLOR_PALETTE.length];
}

const OFFLINE_BADGE_DEBOUNCE_MS = 2500;
const PEER_REMOVAL_GRACE_MS = 5000;

/** Deep-equality via JSON comparison — the same idiom program-ydoc.ts uses (see its own `jsonEqual`), reimplemented locally per this ticket's own instruction not to reuse a private helper from that file. */
function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diffs `prev` vs `next`'s milestones/topLevelItems by id and returns every
 * id that's new-or-changed in `next` (an id removed from `next` needs no
 * tracking here — see this hook's own doc comment above the call site: a
 * delete you made yourself while offline has nothing to orphan-detect
 * against).
 */
function changedIds(prev: Program, next: Program): { id: string; kind: "milestone" | "topLevelItem" }[] {
  const out: { id: string; kind: "milestone" | "topLevelItem" }[] = [];
  const prevMilestonesById = new Map(prev.milestones.map((m) => [m.id, m]));
  for (const m of next.milestones) {
    const before = prevMilestonesById.get(m.id);
    if (!before || !jsonEqual(before, m)) out.push({ id: m.id, kind: "milestone" });
  }
  const prevTopLevelById = new Map(prev.topLevelItems.map((t) => [t.id, t]));
  for (const t of next.topLevelItems) {
    const before = prevTopLevelById.get(t.id);
    if (!before || !jsonEqual(before, t)) out.push({ id: t.id, kind: "topLevelItem" });
  }
  return out;
}

interface PeerEntry {
  clientId: number;
  peer: Peer & { selectedId?: string | null };
  /** Set once this clientID left `awareness.getStates()` — still shown until the grace-period timer purges it, unless it reappears first. */
  removedAt: number | null;
}

export function useProgramRoom(options: {
  programId: string;
  box: UseCorrectionBoxResult;
  access: RoomAccess;
  identity: ProgramRoomIdentity;
  selectedId: string | null;
  /** When false, the hook does nothing (no connection) — lets a caller that doesn't yet know its programId/access render the hook unconditionally with a stable call order. */
  enabled: boolean;
}): UseProgramRoomResult {
  const { programId, box, access, identity, selectedId, enabled } = options;

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [showOfflineBadge, setShowOfflineBadge] = useState(false);
  const [peers, setPeers] = useState<(Peer & { selectedId?: string | null })[]>([]);

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<YProvider | null>(null);

  // True once the first successful sync for this connection lifecycle has
  // bootstrapped (seeded-or-read) the doc — gates both the bootstrap
  // decision itself (runs at most once per connection) and the local->remote
  // sync effect below (which must ignore box.data changes before the doc is
  // even connected).
  const hasBootstrappedRef = useRef(false);

  // The last `box.data` this hook itself wrote to the doc, or received from
  // it — the diffing baseline for the local->remote sync effect. Set right
  // after bootstrap, and on every subsequent local-write or remote-read.
  const prevDataRef = useRef<Program | null>(null);

  // Set to true by the remote->local doc listener immediately before it
  // calls box.setFromRemote — the very next local->remote effect run (fired
  // by that same setFromRemote's box.data change) must skip re-diffing and
  // re-writing, or a remote update would get relabeled LOCAL_ORIGIN.
  const skipNextLocalSyncRef = useRef(false);

  // Ids touched by a local patch applied while the provider was disconnected
  // — checked against the merged doc on the next post-drop resync to surface
  // orphaned-edit conflicts (program-conflict.ts).
  const pendingOfflineEditsRef = useRef<Map<string, "milestone" | "topLevelItem">>(new Map());

  // True from the moment `status` transitions to "disconnected" until the
  // next resync's conflict check runs — distinguishes "this sync is a
  // resync after a real drop" from the very first connect (which must not
  // run conflict detection).
  const wasDisconnectedRef = useRef(false);

  const offlineBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerRemovalTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const peersMapRef = useRef<Map<number, PeerEntry>>(new Map());

  // box/access change on every render (callers like RoadmapWorkspace pass a
  // fresh `box` object and a fresh `access` closure each render) but must
  // not retrigger the connect/teardown effect below, which should only
  // re-run on a real (programId, enabled) change per this hook's own
  // contract — read through refs kept current every render instead of being
  // listed as that effect's dependencies. Synced in their own effect (run on
  // every render, no dependency array) rather than during render itself,
  // since writing a ref's `.current` while rendering is unsafe.
  const boxRef = useRef(box);
  const accessRef = useRef(access);
  useEffect(() => {
    boxRef.current = box;
    accessRef.current = access;
  });

  function publishPeers() {
    setPeers(Array.from(peersMapRef.current.values()).map((e) => e.peer));
  }

  // --- Doc/provider lifecycle + all connection-scoped listeners -----------
  useEffect(() => {
    if (!enabled) return;

    // Captured once per connection so the cleanup below reads the exact same
    // Map instance it scheduled timers into, rather than `.current` (which
    // eslint's exhaustive-deps rule can't prove is still the same object by
    // the time cleanup runs).
    const peerRemovalTimers = peerRemovalTimersRef.current;

    const doc = new Y.Doc();
    docRef.current = doc;
    hasBootstrappedRef.current = false;
    prevDataRef.current = null;
    skipNextLocalSyncRef.current = false;
    pendingOfflineEditsRef.current = new Map();
    wasDisconnectedRef.current = false;
    peersMapRef.current = new Map();
    // No explicit `setStatus("connecting")`/`setPeers([])`/`setShowOfflineBadge(false)`
    // reset here: on the very first mount these already match useState's
    // initial values, and on a reconnect (programId change) this same
    // effect's own cleanup below resets them before this body re-runs —
    // calling setState synchronously at the top of an effect body otherwise
    // trips this repo's stricter react-hooks/set-state-in-effect lint rule.

    const provider = connectProgramRoom(programId, doc, accessRef.current);
    providerRef.current = provider;

    // What box.data was the instant we started connecting — a user can start
    // editing before the initial sync completes (RoadmapWorkspace is
    // interactive from the REST-fetched snapshot immediately, well before
    // this hook's WebSocket even opens). If the room turns out to already be
    // seeded (an existing collaborative room, not a fresh one), bootstrap
    // below needs this to reconcile those connecting-window edits onto the
    // doc instead of silently discarding them via a bare setFromRemote.
    const initialDataAtConnect = boxRef.current.data;

    function clearOfflineBadgeTimer() {
      if (offlineBadgeTimerRef.current !== null) {
        clearTimeout(offlineBadgeTimerRef.current);
        offlineBadgeTimerRef.current = null;
      }
    }

    function onStatus({ status: next }: { status: ConnectionStatus }) {
      setStatus(next);
      if (next === "disconnected") {
        wasDisconnectedRef.current = true;
        clearOfflineBadgeTimer();
        offlineBadgeTimerRef.current = setTimeout(() => {
          offlineBadgeTimerRef.current = null;
          setShowOfflineBadge(true);
        }, OFFLINE_BADGE_DEBOUNCE_MS);
      } else if (next === "connected") {
        clearOfflineBadgeTimer();
        setShowOfflineBadge(false);
      }
    }

    function bootstrapIfNeeded() {
      if (hasBootstrappedRef.current) return;
      hasBootstrappedRef.current = true;
      if (isProgramDocSeeded(doc)) {
        // Push forward any local edits made during the connecting window
        // (see initialDataAtConnect above) onto the doc that just arrived,
        // before reading the merged result back — an edit-vs-edit conflict
        // here resolves the same last-writer-wins way applyProgramPatch
        // already resolves any other concurrent field write, but an edit
        // made only locally (an id neither the room nor a concurrent peer
        // touched) survives instead of being silently dropped.
        const editedDuringConnect = boxRef.current.data;
        if (editedDuringConnect !== initialDataAtConnect) {
          applyProgramPatch(doc, initialDataAtConnect, editedDuringConnect, LOCAL_ORIGIN);
        }
        const merged = readProgramFromDoc(doc);
        skipNextLocalSyncRef.current = true;
        boxRef.current.setFromRemote(merged);
        prevDataRef.current = merged;
      } else {
        seedProgramDoc(doc, boxRef.current.data, LOCAL_ORIGIN);
        prevDataRef.current = boxRef.current.data;
      }
    }

    function onSync(isSynced: boolean) {
      if (!isSynced) return;
      bootstrapIfNeeded();

      if (wasDisconnectedRef.current) {
        const pending = Array.from(pendingOfflineEditsRef.current.entries()).map(([id, kind]) => ({ id, kind }));
        pendingOfflineEditsRef.current = new Map();
        wasDisconnectedRef.current = false;
        if (pending.length > 0) {
          const merged = readProgramFromDoc(doc);
          const conflicts = detectOrphanedEdits(pending, merged);
          if (conflicts.length > 0) boxRef.current.addConflicts(conflicts);
        }
      }
    }

    function onDocUpdate(_update: Uint8Array, origin: unknown) {
      if (origin === LOCAL_ORIGIN) return;
      const merged = readProgramFromDoc(doc);
      skipNextLocalSyncRef.current = true;
      boxRef.current.setFromRemote(merged);
      prevDataRef.current = merged;
    }

    function purgePeer(clientId: number) {
      peerRemovalTimers.delete(clientId);
      const entry = peersMapRef.current.get(clientId);
      if (entry && entry.removedAt !== null) {
        peersMapRef.current.delete(clientId);
        publishPeers();
      }
    }

    function onAwarenessChange({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) {
      const states = provider.awareness.getStates();
      let changed = false;

      for (const clientId of [...added, ...updated]) {
        if (clientId === provider.awareness.clientID) continue;
        const state = states.get(clientId) as { name?: string; color?: string; selectedId?: string | null } | undefined;
        if (!state) continue;

        // A peer that reappears before its grace-period purge fires cancels
        // the pending removal instead of being treated as newly-added.
        const pendingRemoval = peerRemovalTimers.get(clientId);
        if (pendingRemoval !== undefined) {
          clearTimeout(pendingRemoval);
          peerRemovalTimers.delete(clientId);
        }

        peersMapRef.current.set(clientId, {
          clientId,
          removedAt: null,
          peer: { id: String(clientId), name: state.name ?? "", color: state.color ?? PEER_COLOR_PALETTE[0], selectedId: state.selectedId ?? null },
        });
        changed = true;
      }

      for (const clientId of removed) {
        if (clientId === provider.awareness.clientID) continue;
        const entry = peersMapRef.current.get(clientId);
        if (!entry || entry.removedAt !== null) continue;
        entry.removedAt = Date.now();
        const timer = setTimeout(() => purgePeer(clientId), PEER_REMOVAL_GRACE_MS);
        peerRemovalTimers.set(clientId, timer);
        changed = true;
      }

      if (changed) publishPeers();
    }

    provider.on("status", onStatus);
    provider.on("sync", onSync);
    doc.on("update", onDocUpdate);
    provider.awareness.on("change", onAwarenessChange);

    return () => {
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      doc.off("update", onDocUpdate);
      provider.awareness.off("change", onAwarenessChange);

      clearOfflineBadgeTimer();
      for (const timer of peerRemovalTimers.values()) clearTimeout(timer);
      peerRemovalTimers.clear();

      // provider.destroy() disconnects the websocket/broadcastchannel and
      // tears down its own listeners (verified in
      // node_modules/y-partyserver/dist/provider/index.js's
      // WebsocketProvider#destroy) but never calls doc.destroy() — this
      // hook is the one that created `doc`, so it's the one that must
      // free it, or every reconnect/unmount would leak a Y.Doc.
      provider.destroy();
      doc.destroy();

      docRef.current = null;
      providerRef.current = null;

      // Resets connection-derived state ahead of the next run (a real
      // reconnect — programId/enabled changed) or final unmount. Living in
      // cleanup rather than at the top of the effect body is what keeps this
      // out of react-hooks/set-state-in-effect's "don't setState directly in
      // an effect body" complaint: on first mount there's no stale state to
      // clear (these already match useState's own initial values), so this
      // only does real work on an actual reconnect.
      setStatus("connecting");
      setShowOfflineBadge(false);
      setPeers([]);
    };

  }, [programId, enabled]);

  // --- Local -> remote sync -------------------------------------------------
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !hasBootstrappedRef.current) return; // ignore box.data changes before the doc is even connected/seeded

    if (skipNextLocalSyncRef.current) {
      skipNextLocalSyncRef.current = false;
      prevDataRef.current = box.data;
      return;
    }

    const prev = prevDataRef.current;
    if (!prev) {
      prevDataRef.current = box.data;
      return;
    }
    if (prev === box.data) return;

    applyProgramPatch(doc, prev, box.data, LOCAL_ORIGIN);
    if (!providerRef.current?.wsconnected) {
      for (const { id, kind } of changedIds(prev, box.data)) pendingOfflineEditsRef.current.set(id, kind);
    }
    prevDataRef.current = box.data;

  }, [box.data]);

  // --- Presence: publish this client's own state on identity/selection change ---
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) return;
    provider.awareness.setLocalState({ name: identity.name, color: colorFor(identity.identityKey), selectedId });

  }, [identity.name, identity.identityKey, selectedId, status]);

  return { status, showOfflineBadge, peers };
}
