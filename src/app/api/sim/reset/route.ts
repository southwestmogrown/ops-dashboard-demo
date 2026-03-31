import { NextResponse } from "next/server";
import { resetSimulation } from "@/lib/mesStore";

export async function POST(): Promise<NextResponse> {
  await resetSimulation();
  return NextResponse.json({ ok: true });
}
