import { NextRequest, NextResponse } from "next/server";
import { getLineComments, setLineComment } from "@/lib/mesStore";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const lineId = searchParams.get("lineId");

  if (!lineId) {
    return NextResponse.json({ error: "lineId is required" }, { status: 400 });
  }

  return NextResponse.json(await getLineComments(lineId));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json() as { lineId: string; hour: string; comment: string };

  if (!body.lineId || !body.hour) {
    return NextResponse.json({ error: "lineId and hour are required" }, { status: 400 });
  }

  await setLineComment(body.lineId, body.hour, body.comment ?? "");
  return NextResponse.json({ ok: true });
}
