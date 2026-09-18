import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getDriveFolder, saveDriveFolder } from "@/lib/db/google-tokens";

/** wayframe#t30's "last-picked Drive folder, remembered per identity" — read/write side for the Drive Picker's "Change destination" affordance. */
export async function GET() {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const folder = await getDriveFolder(identity);
  return NextResponse.json({ folder });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const folderId = body?.folderId;
  const folderName = body?.folderName;
  if (typeof folderId !== "string" || !folderId || typeof folderName !== "string") {
    return NextResponse.json({ error: "Request body must include { folderId: string, folderName: string }." }, { status: 400 });
  }

  await saveDriveFolder(identity, folderId, folderName);
  return NextResponse.json({ ok: true });
}
