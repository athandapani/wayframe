import * as Y from "yjs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getRole } from "@/lib/db/portfolios";
import { appendProgramUpdate, compactProgram, decodeProgramSnapshot, listProgramSnapshotsForPortfolio, loadMergedProgramDoc } from "@/lib/db/program-storage";
import { applyProgramPatch, isProgramDocSeeded, readProgramFromDoc } from "@/lib/realtime/program-ydoc";

/**
 * Swaps a Program's `order` with its adjacent sibling within the same
 * Portfolio — the server-side counterpart of `moveSwimlaneOp`'s "no-op at
 * a boundary" convention (src/lib/corrections/apply-document.ts), applied
 * to Programs instead of Swimlanes. wayframe#t32 (outline tree) is the
 * first thing that needs to reorder Programs relative to each other —
 * nothing else in the app does, since a live realtime room (t38's
 * `useProgramRoom`/`program-ydoc.ts`) is scoped to editing ONE already-open
 * Program's own content, never a cross-Program operation.
 *
 * Reuses `loadMergedProgramDoc`/`applyProgramPatch`/`appendProgramUpdate`/
 * `compactProgram` — the exact same merged-doc shape and field-level
 * `program-ydoc.ts` bridge a connected `useProgramRoom` client would see —
 * so this route and a live editing session never disagree about a
 * Program's content, and a `swimlaneGroups`/`order` change made here is
 * indistinguishable to a later `useProgramRoom` connection from one made
 * live.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ portfolioId: string; programId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId, programId } = await params;
  const role = await getRole(portfolioId, identity);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "No edit access to this Roadmap." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const direction = body?.direction;
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: 'Request body must be { direction: "up" | "down" }.' }, { status: 400 });
  }

  const snapshots = await listProgramSnapshotsForPortfolio(portfolioId);
  const decoded = snapshots
    .map((row) => decodeProgramSnapshot(row.snapshot))
    .filter((program): program is NonNullable<typeof program> => program !== null)
    .sort((a, b) => a.order - b.order);

  const index = decoded.findIndex((program) => program.id === programId);
  if (index === -1) return NextResponse.json({ error: "Program not found." }, { status: 404 });

  const delta: -1 | 1 = direction === "up" ? -1 : 1;
  const neighborIndex = index + delta;
  if (neighborIndex < 0 || neighborIndex >= decoded.length) {
    return NextResponse.json({ ok: true, moved: false });
  }

  const target = decoded[index];
  const neighbor = decoded[neighborIndex];
  const targetNewOrder = neighbor.order;
  const neighborNewOrder = target.order;

  // The `order` values above only need to be roughly current (picking the
  // right adjacent sibling to swap with tolerates a little staleness). The
  // actual patch step below must not: it has to patch `order` onto each
  // Program's truly-current content (the merged live doc, not the possibly-
  // stale `programs.snapshot` row alone) — otherwise any edit still sitting
  // unfolded in `program_updates` at the moment of this call (e.g. one a
  // connected `useProgramRoom` client just made) would get silently
  // reverted back to the snapshot's stale values for every field, not just
  // left alone the way only `order` is meant to change here.
  for (const [id, newOrder] of [
    [target.id, targetNewOrder],
    [neighbor.id, neighborNewOrder],
  ] as const) {
    const merged = await loadMergedProgramDoc(id);
    if (!merged || !isProgramDocSeeded(merged.doc)) continue;
    const { doc } = merged;
    const current = readProgramFromDoc(doc);
    if (current.order === newOrder) continue;
    const before = Y.encodeStateVector(doc);
    applyProgramPatch(doc, current, { ...current, order: newOrder });
    const diff = Y.encodeStateAsUpdate(doc, before);
    await appendProgramUpdate(id, diff);
    await compactProgram(id, portfolioId).catch(() => {});
  }

  return NextResponse.json({ ok: true, moved: true, swapped: [target.id, neighbor.id] });
}
