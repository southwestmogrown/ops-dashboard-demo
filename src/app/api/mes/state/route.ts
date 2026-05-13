import { NextRequest, NextResponse } from "next/server";
import { getAllLineStates, getOperatingTime, refreshCacheFromDb } from "@/lib/mesStore";
import type { ShiftName } from "@/lib/types/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  await refreshCacheFromDb();
  const { searchParams } = new URL(request.url);
  const requestedShift = searchParams.get("shift") as ShiftName | null;
  const operatingTime = await getOperatingTime();
  const shift = requestedShift ?? operatingTime.currentShift ?? "day";
  return NextResponse.json(
    await getAllLineStates({
      shift,
      productionDate: operatingTime.productionDate,
    }),
  );
}
