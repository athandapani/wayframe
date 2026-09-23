import * as Y from "yjs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getRole } from "@/lib/db/portfolios";
import { appendProgramUpdate, compactProgram, loadMergedProgramDoc } from "@/lib/db/program-storage";
import { applyProgramPatch, isProgramDocSeeded, readProgramFromDoc } from "@/lib/realtime/program-ydoc";
import { applyBulkPatchToProgram, type BulkPatchOp } from "@/lib/bulk-edit/apply";
import { applyAcceptBaselineOps } from "@/lib/corrections/apply";
import type { AcceptBaselineOp } from "@/lib/corrections/schema";

/**
 * Cross-Program bulk edit (wayframe#t33, fork 3 of 3) — the server-side
 * counterpart of the All-Programs page's cross-Program selection toolbar
 * (CrossProgramSelectionToolbar.tsx), which builds its selection off the
 * merged canvas's namespaced ids (mergeProgramsForAllView, t26/wayframe#104)
 * but must apply against each affected Program's own local id space.
 *
 * NO CALLER as of wayframe#126. That toolbar now applies through each
 * Program's own live box instead: #126 connects a room per Program on the
 * combined editor, and a connected room holds its own in-memory doc, so a
 * server-side write like this one — correct though it is — wouldn't reach
 * the canvas until a reload. Left in place rather than deleted because it
 * is the only bulk-edit path that works with no live connection at all
 * (scripts, future automation, a server-side job); delete it if nothing
 * claims it.
 *
 * Modeled directly on the sibling
 * `.../programs/[programId]/reorder/route.ts` route: `loadMergedProgramDoc`
 * (never a possibly-stale `programs.snapshot` row alone — a live
 * `useProgramRoom` client's in-flight edit could still be sitting unfolded
 * in `program_updates`) -> `readProgramFromDoc` for the TRUE current
 * content -> compute `next` -> diff -> `appendProgramUpdate` ->
 * `compactProgram`. The one real difference: `next` here comes from fork
 * 1's `applyBulkPatchToProgram` (+ `applyAcceptBaselineOps`, composed in
 * that exact order — mirrors use-correction-box.ts's own "bulkEdit" reducer
 * case) instead of a single `order` field change.
 *
 * Auth: one `getRole(portfolioId, identity)` check for the whole request
 * (owner/editor only), not per Program — every Program in the request body
 * shares this one `portfolioId` path param. Unlike the reorder route (which
 * only ever touches Program ids it derived itself from
 * `listProgramSnapshotsForPortfolio(portfolioId)`, so every id it touches
 * is trusted by construction), this route's `programId` keys come straight
 * from the request body — a caller could name a `programId` that's real but
 * belongs to a DIFFERENT Portfolio the caller has no access to, which would
 * otherwise let one Portfolio's editor role reach into an unrelated
 * Portfolio's Program. So each entry's own `current.portfolioId` (read back
 * off the loaded doc, not trusted from the request) is checked against the
 * path param before it's touched — a mismatch is skipped exactly like a
 * null/unseeded doc, never escalated into a whole-request error (see the
 * per-entry loop below).
 *
 * No undo wiring here, deliberately: t38's live per-(user, Program) undo
 * manager (src/lib/realtime/undo-manager.ts) only ever activates for an
 * open `useProgramRoom` WebSocket connection (the reorder route's own
 * comment: realtime editing is scoped to one already-open Program), and
 * this route — like reorder — runs with no live per-Program connection of
 * its own at all. There is nothing here to hook an undo entry into without
 * building N realtime connections just for that, which is a real scope
 * expansion beyond this ticket (left for a future one).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId } = await params;
  const role = await getRole(portfolioId, identity);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "No edit access to this Portfolio." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const opsByProgram = body?.opsByProgram;
  if (!opsByProgram || typeof opsByProgram !== "object" || Array.isArray(opsByProgram)) {
    return NextResponse.json({ error: "Request body must be { opsByProgram: Record<programId, {...}> }." }, { status: 400 });
  }

  for (const [programId, entry] of Object.entries(opsByProgram as Record<string, unknown>)) {
    const patch = entry as { bulkPatchOps?: { op: BulkPatchOp; ids: string[] }[]; deleteIds?: string[]; acceptBaselineOps?: AcceptBaselineOp[] } | null;
    if (!patch) continue;
    const bulkPatchOps = patch.bulkPatchOps ?? [];
    const deleteIds = patch.deleteIds ?? [];
    const acceptBaselineOps = patch.acceptBaselineOps ?? [];
    if (bulkPatchOps.length === 0 && deleteIds.length === 0 && acceptBaselineOps.length === 0) continue;

    const merged = await loadMergedProgramDoc(programId);
    if (!merged || !isProgramDocSeeded(merged.doc)) continue; // unknown/unseeded Program — skipped, not a whole-request error (see this route's own doc)
    const { doc } = merged;
    const current = readProgramFromDoc(doc);
    if (current.portfolioId !== portfolioId) continue; // see this route's top doc: a programId that doesn't actually belong to this Portfolio is skipped, never trusted

    const patched = applyBulkPatchToProgram(current, bulkPatchOps, deleteIds);
    const milestones = acceptBaselineOps.length > 0 ? applyAcceptBaselineOps(patched.milestones, acceptBaselineOps) : patched.milestones;
    const next = { ...patched, milestones };

    const before = Y.encodeStateVector(doc);
    applyProgramPatch(doc, current, next);
    const diff = Y.encodeStateAsUpdate(doc, before);
    await appendProgramUpdate(programId, diff);
    await compactProgram(programId, portfolioId).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
