import { NextRequest } from "next/server";
import { removeFromQueue } from "@/lib/mesStore";
import { requireRole } from "@/lib/apiAuth";

export async function DELETE(req: NextRequest) {
  const authError = requireRole(req, "supervisor");
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const { lineId, index } = body ?? {};

  if (!lineId || typeof index !== "number") {
    return Response.json({ error: "lineId and index required" }, { status: 400 });
  }
  if (index < 1) {
    return Response.json({ error: "Cannot remove active schedule (index 0)" }, { status: 400 });
  }

  const ok = await removeFromQueue(lineId, index);
  if (!ok) return Response.json({ error: "Index out of range" }, { status: 404 });

  return Response.json({ ok: true });
}
