import { NextRequest, NextResponse } from "next/server";
import {
  addScrapEntry,
  getScrapEntries,
} from "@/lib/mesStore";
import type { ScrapEntry, ScrappedPanel, KickedLid } from "@/lib/reworkTypes";
import type { ShiftName } from "@/lib/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const lineId = searchParams.get("lineId");
  const shift = searchParams.get("shift") as ShiftName | null;

  if (!lineId || !shift) {
    return NextResponse.json(
      { error: "lineId and shift query params are required" },
      { status: 400 }
    );
  }
  if (shift !== "day" && shift !== "night") {
    return NextResponse.json(
      { error: "shift must be 'day' or 'night'" },
      { status: 400 }
    );
  }

  const entries = getScrapEntries(lineId, shift);
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { kind, lineId, shift, model, panel, damageType } = body;

  if (!kind || !lineId || !shift || !model || !panel || !damageType) {
    return NextResponse.json(
      { error: "kind, lineId, shift, model, panel, damageType are all required" },
      { status: 400 }
    );
  }
  if (kind !== "scrapped-panel" && kind !== "kicked-lid") {
    return NextResponse.json(
      { error: "kind must be 'scrapped-panel' or 'kicked-lid'" },
      { status: 400 }
    );
  }

  const entry =
    kind === "scrapped-panel"
      ? (addScrapEntry({
          kind: "scrapped-panel",
          lineId: lineId as string,
          shift: shift as ShiftName,
          model: model as string,
          panel: panel as ScrappedPanel["panel"],
          damageType: damageType as ScrappedPanel["damageType"],
          stationFound: (body.stationFound as string) ?? "",
          howDamaged: (body.howDamaged as string) ?? "",
          boughtIn: Boolean(body.boughtIn),
        } as Omit<ScrapEntry, "id" | "timestamp">))
      : (addScrapEntry({
          kind: "kicked-lid",
          lineId: lineId as string,
          shift: shift as ShiftName,
          model: model as string,
          panel: panel as KickedLid["panel"],
          damageType: damageType as KickedLid["damageType"],
          affectedArea: (body.affectedArea as "panel" | "extrusion") ?? "panel",
          auditorInitials: ((body.auditorInitials as string) ?? "").toUpperCase().trim(),
          boughtIn: Boolean(body.boughtIn),
        } as Omit<ScrapEntry, "id" | "timestamp">));

  return NextResponse.json(entry, { status: 201 });
}
