import { NextRequest, NextResponse } from "next/server";
import { resetAll } from "@/lib/mesStore";
import { requireRole } from "@/lib/apiAuth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, "supervisor");
  if (authError) return authError;

  await resetAll();
  return NextResponse.json({ ok: true });
}
