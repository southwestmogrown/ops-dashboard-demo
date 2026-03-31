import { NextRequest, NextResponse } from "next/server";
import {
  addScrapEntry,
  getScrapEntries,
  getAllScrapEntries,
  refreshCacheFromDb,
  voidScrapEntry,
  updateScrapEntry,
} from "@/lib/mesStore";
import type { ScrapEntry, ScrappedPanel, KickedLid } from "@/lib/reworkTypes";
import type { ShiftName } from "@/lib/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  await refreshCacheFromDb();

  const { searchParams } = new URL(request.url);
  const lineId = searchParams.get("lineId");
  const shift = searchParams.get("shift") as ShiftName | null;

  if (!shift) {
    return NextResponse.json(
      { error: "shift query param is required" },
      { status: 400 },
    );
  }
  if (shift !== "day" && shift !== "night") {
    return NextResponse.json(
      { error: "shift must be 'day' or 'night'" },
      { status: 400 },
    );
  }

  let entries: ScrapEntry[];
  if (lineId === "all") {
    entries = await getAllScrapEntries(shift);
  } else if (!lineId) {
    return NextResponse.json(
      {
        error:
          "lineId query param is required (or use lineId=all for all lines)",
      },
      { status: 400 },
    );
  } else {
    entries = await getScrapEntries(lineId, shift);
  }
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
      {
        error: "kind, lineId, shift, model, panel, damageType are all required",
      },
      { status: 400 },
    );
  }
  if (kind !== "scrapped-panel" && kind !== "kicked-lid") {
    return NextResponse.json(
      { error: "kind must be 'scrapped-panel' or 'kicked-lid'" },
      { status: 400 },
    );
  }

  const entry =
    kind === "scrapped-panel"
      ? await addScrapEntry({
          kind: "scrapped-panel",
          lineId: lineId as string,
          shift: shift as ShiftName,
          model: model as string,
          panel: panel as ScrappedPanel["panel"],
          damageType: damageType as ScrappedPanel["damageType"],
          stationFound: (body.stationFound as string) ?? "",
          howDamaged: (body.howDamaged as string) ?? "",
          boughtIn: Boolean(body.boughtIn),
        })
      : await addScrapEntry({
          kind: "kicked-lid",
          lineId: lineId as string,
          shift: shift as ShiftName,
          model: model as string,
          panel: panel as KickedLid["panel"],
          damageType: damageType as KickedLid["damageType"],
          affectedArea: (body.affectedArea as "panel" | "extrusion") ?? "panel",
          auditorInitials: ((body.auditorInitials as string) ?? "")
            .toUpperCase()
            .trim(),
          boughtIn: Boolean(body.boughtIn),
        });

  return NextResponse.json(entry, { status: 201 });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, void: shouldVoid, voidReason, updates } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (shouldVoid === true) {
    if (
      !voidReason ||
      typeof voidReason !== "string" ||
      voidReason.trim() === ""
    ) {
      return NextResponse.json(
        { error: "voidReason is required when voiding" },
        { status: 400 },
      );
    }
    const ok = await voidScrapEntry(id, voidReason.trim());
    if (!ok)
      return NextResponse.json(
        { error: "Scrap entry not found" },
        { status: 404 },
      );
    return NextResponse.json({ id, voidReason: voidReason.trim() });
  }

  if (shouldVoid === false && updates) {
    const updated = await updateScrapEntry(
      id,
      updates as Parameters<typeof updateScrapEntry>[1],
    );
    if (!updated)
      return NextResponse.json(
        { error: "Scrap entry not found" },
        { status: 404 },
      );
    return NextResponse.json(updated);
  }

  return NextResponse.json(
    {
      error:
        "Provide either void:true with voidReason, or void:false with updates",
    },
    { status: 400 },
  );
}
