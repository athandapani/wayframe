import { NextRequest, NextResponse } from "next/server";
import { fetchSheetRows } from "@/lib/smartsheet/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sheet = await fetchSheetRows(id);
    return NextResponse.json(sheet);
  } catch (err) {
    return NextResponse.json({ error: { message: err instanceof Error ? err.message : "Failed to fetch Smartsheet rows." } }, { status: 502 });
  }
}
