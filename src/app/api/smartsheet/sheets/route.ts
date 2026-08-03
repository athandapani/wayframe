import { NextResponse } from "next/server";
import { listSheets } from "@/lib/smartsheet/client";

export async function GET() {
  try {
    const sheets = await listSheets();
    return NextResponse.json({ sheets });
  } catch (err) {
    return NextResponse.json({ error: { message: err instanceof Error ? err.message : "Failed to list Smartsheet sheets." } }, { status: 502 });
  }
}
