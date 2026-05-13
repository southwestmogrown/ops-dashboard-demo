import { NextRequest, NextResponse } from "next/server";
import {
  getAdminConfig,
  setAdminConfig,
  getAllAdminConfig,
  refreshCacheFromDb,
} from "@/lib/mesStore";
import type { ShiftName } from "@/lib/types/core";
import type { ShiftConfig } from "@/lib/types/mes";
import { requireRole } from "@/lib/apiAuth";

interface AdminConfigPostBody {
  lineId: string;
  shift?: ShiftName;
  shiftConfig?: Partial<ShiftConfig>;
  isRunning?: boolean;
}

function mergeShiftConfigUpdate(
  current: ShiftConfig,
  update: Partial<ShiftConfig>,
): ShiftConfig {
  return {
    ...current,
    ...(update.supervisor !== undefined
      ? { supervisor: String(update.supervisor) }
      : {}),
    ...(update.dailyTarget !== undefined
      ? { dailyTarget: Number(update.dailyTarget) }
      : {}),
    ...(update.headcount !== undefined
      ? { headcount: Number(update.headcount) }
      : {}),
  };
}

export async function GET(): Promise<NextResponse> {
  // Keep read access lightweight for all dashboard roles.
  await refreshCacheFromDb();
  return NextResponse.json(await getAllAdminConfig());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, "supervisor");
  if (authError) return authError;

  const body = await request.json() as AdminConfigPostBody;

  if (!body.lineId) {
    return NextResponse.json({ error: "lineId is required" }, { status: 400 });
  }

  if (body.shift !== undefined && body.shift !== "day" && body.shift !== "night") {
    return NextResponse.json({ error: "shift must be day or night" }, { status: 400 });
  }

  const current = structuredClone(await getAdminConfig(body.lineId));

  if (body.isRunning !== undefined) {
    current.isRunning = Boolean(body.isRunning);
  }

  if (body.shift === "day" && body.shiftConfig) {
    current.day = mergeShiftConfigUpdate(current.day, body.shiftConfig);
  }

  if (body.shift === "night" && body.shiftConfig) {
    current.night = mergeShiftConfigUpdate(current.night, body.shiftConfig);
  }

  await setAdminConfig(body.lineId, current);
  return NextResponse.json(current);
}
