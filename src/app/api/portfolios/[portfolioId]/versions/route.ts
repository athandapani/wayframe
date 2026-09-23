import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getRole } from "@/lib/db/portfolios";
import { createVersion, listVersions } from "@/lib/db/versions";
import { loadLiveProgramsForPortfolio } from "@/lib/db/program-storage";

/**
 * wayframe#128: list (any member) / save (owner or editor) Versions of a
 * Roadmap. Same access split the Snapshot routes already use, for the same
 * reason — capturing a Version is an editorial act on the shared plan, reading
 * one is not (CONTEXT.md's "everyone opening the file" doctrine).
 *
 * The one real difference from the Snapshot routes: POST takes NO document in
 * its body. A Snapshot's `slides` can only come from the client, because a
 * Deck IR is produced by measuring a rendered chart in a browser. A Version's
 * content is just the Program documents, which the server can read for itself
 * — so it does (`loadLiveProgramsForPortfolio`, which merges each Program's
 * compacted snapshot with its still-pending Yjs updates). That keeps a Version
 * an honest record of what is actually stored rather than of whatever a client
 * chose to send, and keeps N full Program documents off the request wire.
 *
 * The cost of that choice, worth naming: a connected editor's very latest
 * keystrokes are captured only once its room has flushed them to
 * `program_updates`. A Version is "the document as the server has it", not "as
 * this tab has it" — for a manual, deliberate save that is the right side of
 * the trade, and the alternative (trusting client-sent content) would let any
 * editor write a Version of a document that never existed.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId } = await params;
  const role = await getRole(portfolioId, identity);
  if (!role) {
    return NextResponse.json({ error: "No access to this Roadmap." }, { status: 403 });
  }

  const versions = await listVersions(portfolioId);
  return NextResponse.json({ versions });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId } = await params;
  const role = await getRole(portfolioId, identity);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "No edit access to this Roadmap." }, { status: 403 });
  }

  // A label at save time is optional and rarely used — #127's resolution made
  // naming post-hoc (save in one click, then rename the new row) — but the
  // body is still honoured when a caller does send one.
  const body = await req.json().catch(() => null);
  const rawLabel = typeof body?.label === "string" ? body.label.trim() : "";
  const label = rawLabel === "" ? null : rawLabel;

  const programs = await loadLiveProgramsForPortfolio(portfolioId);
  if (programs.length === 0) {
    return NextResponse.json({ error: "This Roadmap has no Program to capture yet." }, { status: 400 });
  }

  const versionId = await createVersion(portfolioId, identity, session.user?.name ?? null, programs, label);
  return NextResponse.json({ versionId });
}
