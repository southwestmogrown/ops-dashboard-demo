import { NextRequest, NextResponse } from "next/server";
import { tickLine, getAllLineStates } from "@/lib/mesStore";

interface TickBody {
  /** Specific line to tick. Omit when all=true. */
  lineId?: string;
  /** When true, tick every line that has a schedule loaded. */
  all?: boolean;
  /** Number of scan events (units) to emit per line. */
  units: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json() as TickBody;
  const units = Math.max(1, Math.floor(body.units ?? 1));

  if (body.all) {
    // Tick every line that has a schedule
    const states = getAllLineStates();
    let scansAdded = 0;
    for (const state of states) {
      if (state.schedule) {
        tickLine(state.lineId, units);
        scansAdded += units;
      }
    }
    return NextResponse.json({ scansAdded });
  }

  if (!body.lineId) {
    return NextResponse.json({ error: "lineId or all=true required" }, { status: 400 });
  }

  tickLine(body.lineId, units);
  return NextResponse.json({ scansAdded: units });
}
