import { NextResponse } from "next/server";
import { getAllLineStates } from "@/lib/mesStore";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await getAllLineStates());
}
