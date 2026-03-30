import { NextResponse } from "next/server";
import { resetAll } from "@/lib/mesStore";

export async function POST(): Promise<NextResponse> {
  await resetAll();
  return NextResponse.json({ ok: true });
}
