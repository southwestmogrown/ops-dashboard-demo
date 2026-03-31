import { NextResponse } from "next/server";
import { getAllLineStates } from "@/lib/mesStore";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await getAllLineStates());
}
