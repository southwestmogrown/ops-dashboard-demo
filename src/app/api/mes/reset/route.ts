import { NextResponse } from "next/server";
import { resetAll } from "@/lib/mesStore";

export async function POST(): Promise<NextResponse> {
  resetAll();
  return NextResponse.json({ ok: true });
}
