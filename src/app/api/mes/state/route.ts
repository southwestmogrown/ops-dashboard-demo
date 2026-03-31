import { NextResponse } from "next/server";
import { getAllLineStates, refreshCacheFromDb } from "@/lib/mesStore";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  await refreshCacheFromDb();
  return NextResponse.json(await getAllLineStates());
}
