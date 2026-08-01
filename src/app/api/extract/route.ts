import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Not implemented — extraction prompt/contract is designed in a later ticket." },
    { status: 501 },
  );
}
