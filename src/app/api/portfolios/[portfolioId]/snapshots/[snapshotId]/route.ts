import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getRole } from "@/lib/db/portfolios";
import { getSnapshot } from "@/lib/db/snapshots";

/** wayframe#t31: fetches one Snapshot's full row (including its `slides` IR blob) — what SnapshotsPanel's "Download .pptx" action reads before recompiling locally via export-native-deck.ts. Any member can read, same as the list route. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ portfolioId: string; snapshotId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId, snapshotId } = await params;
  const role = await getRole(portfolioId, identity);
  if (!role) {
    return NextResponse.json({ error: "No access to this Portfolio." }, { status: 403 });
  }

  const snapshot = await getSnapshot(portfolioId, snapshotId);
  if (!snapshot) {
    return NextResponse.json({ error: "Snapshot not found." }, { status: 404 });
  }

  return NextResponse.json({ snapshot });
}
