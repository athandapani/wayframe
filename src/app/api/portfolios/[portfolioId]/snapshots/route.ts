import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getRole } from "@/lib/db/portfolios";
import { createSnapshot, listSnapshots, type SerializedExportSelection } from "@/lib/db/snapshots";
import type { Slide } from "@/lib/export/deck-ir";

/**
 * wayframe#t31: list (any member) / create (owner or editor) Snapshots for a
 * Portfolio. Saving a Snapshot is an editorial act on the shared plan (same
 * bar as the extract route's owner/editor gate); viewing one is not, so
 * listing only requires membership, matching CONTEXT.md's "everyone opening
 * the file" doctrine for document content.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId } = await params;
  const role = await getRole(portfolioId, identity);
  if (!role) {
    return NextResponse.json({ error: "No access to this Roadmap." }, { status: 403 });
  }

  const snapshots = await listSnapshots(portfolioId);
  return NextResponse.json({ snapshots });
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

  const body = await req.json().catch(() => null);
  const selection = body?.selection as SerializedExportSelection | undefined;
  const slides = body?.slides as Slide[] | undefined;
  if (!selection || typeof selection !== "object" || !Array.isArray(slides)) {
    return NextResponse.json({ error: "Request body must be { selection: <ExportSelection>, slides: Slide[] }." }, { status: 400 });
  }

  const snapshotId = await createSnapshot(portfolioId, identity, selection, slides);
  return NextResponse.json({ snapshotId });
}
