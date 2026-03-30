import { removeFromQueue } from "@/lib/mesStore";

export async function DELETE(req: Request) {
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
