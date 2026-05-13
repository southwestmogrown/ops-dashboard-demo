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

  const current = await getAdminConfig(body.lineId);

  if (body.isRunning !== undefined) {
    current.isRunning = Boolean(body.isRunning);
  }

  if (body.shift && body.shiftConfig) {
    current[body.shift] = {
      ...current[body.shift],
      ...(body.shiftConfig.supervisor !== undefined
        ? { supervisor: String(body.shiftConfig.supervisor) }
        : {}),
      ...(body.shiftConfig.dailyTarget !== undefined
        ? { dailyTarget: Number(body.shiftConfig.dailyTarget) }
        : {}),
      ...(body.shiftConfig.headcount !== undefined
        ? { headcount: Number(body.shiftConfig.headcount) }
        : {}),
    };
  }

  await setAdminConfig(body.lineId, current);
  return NextResponse.json(current);
}
