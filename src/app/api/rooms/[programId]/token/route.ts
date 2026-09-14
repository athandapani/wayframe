import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getRoleForProgram } from "@/lib/db/portfolios";
import { mintRoomToken } from "@/lib/auth/room-token";

// The signed-in half of wayframe#t16's connect flow: a caller who already
// has a role on this Program's Portfolio gets a short-lived identity token
// to hand to connectProgramRoom (src/lib/realtime/provider.ts). Unsigned-in
// visitors and non-members alike get 401/403 — there is no path here that
// hands out a token to someone with no resolvable role, matching the
// ticket's "never a hosted row" posture for uninvited access. A public-link
// guest never calls this route at all; it resolves its `shareToken`
// straight against the DB inside the Partykit room (party/src/index.ts).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ programId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { programId } = await params;
  const role = await getRoleForProgram(programId, identity);
  if (!role) return NextResponse.json({ error: "No access to this Program." }, { status: 403 });

  const token = await mintRoomToken(identity);
  return NextResponse.json({ token, role });
}
