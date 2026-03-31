import { NextRequest, NextResponse } from "next/server";
import {
  addDowntimeEntry,
  getDowntimeEntries,
  closeDowntimeEntry,
  getAllDowntimeEntriesForShift,
  getAllAdminConfig,
  getAllLineStates,
  refreshCacheFromDb,
} from "@/lib/mesStore";
import type { DowntimeReason, DowntimeEntry } from "@/lib/downtimeTypes";
import type { ShiftName } from "@/lib/types";
import { getShiftWindows } from "@/lib/shiftTime";
import { getDefaultTarget } from "@/lib/generateMetrics";
import { getRequestRole, requireRole } from "@/lib/apiAuth";

const VALID_REASONS: DowntimeReason[] = [
  "machine-failure",
  "material-shortage",
  "quality-hold",
  "planned-maintenance",
  "operator-break",
  "safety-stop",
  "changeover",
  "other",
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, ["supervisor", "team-lead"]);
  if (authError) return authError;

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

  if (lineId) {
    return NextResponse.json(await getDowntimeEntries(lineId, shift));
  }

  return NextResponse.json(await getAllDowntimeEntriesForShift(shift));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, ["supervisor", "team-lead"]);
  if (authError) return authError;

  const role = getRequestRole(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lineId, shift, reason, startTime, unitsLost, notes } = body;

  if (!lineId || !shift || !reason || !startTime) {
    return NextResponse.json(
      { error: "lineId, shift, reason, and startTime are all required" },
      { status: 400 },
    );
  }
  if (shift !== "day" && shift !== "night") {
    return NextResponse.json(
      { error: "shift must be 'day' or 'night'" },
      { status: 400 },
    );
  }
  if (!VALID_REASONS.includes(reason as DowntimeReason)) {
    return NextResponse.json(
      { error: "invalid reason value" },
      { status: 400 },
    );
  }

  const entry: DowntimeEntry = {
    id: "",
    lineId: lineId as string,
    shift: shift as ShiftName,
    reason: reason as DowntimeReason,
    startTime: startTime as string,
    endTime: null,
    unitsLost: typeof unitsLost === "number" ? unitsLost : 0,
    notes: typeof notes === "string" ? notes : "",
    createdBy: role ?? undefined,
  };

  const saved = await addDowntimeEntry(entry);
  return NextResponse.json(saved, { status: 201 });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, ["supervisor", "team-lead"]);
  if (authError) return authError;

  await refreshCacheFromDb();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, endTime, actualEndTime } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const resolvedAt =
    typeof actualEndTime === "string"
      ? actualEndTime
      : typeof endTime === "string"
        ? endTime
        : new Date().toISOString();

  const entries = [
    ...(await getAllDowntimeEntriesForShift("day")),
    ...(await getAllDowntimeEntriesForShift("night")),
  ];
  const entry = entries.find((e) => e.id === id);
  if (!entry) {
    return NextResponse.json(
      { error: "Downtime entry not found" },
      { status: 404 },
    );
  }

  const startMs = new Date(entry.startTime).getTime();
  const endMs = new Date(resolvedAt).getTime();
  const durationMinutes = Math.max(0, Math.floor((endMs - startMs) / 60000));

  const [lineStates, adminConfig] = await Promise.all([
    getAllLineStates(),
    getAllAdminConfig(),
  ]);
  const lineState = lineStates.find((s) => s.lineId === entry.lineId);

  const targetOutput =
    lineState?.schedule?.totalTarget ??
    adminConfig[entry.lineId]?.target ??
    getDefaultTarget(entry.lineId);

  const { totalWorkMinutes } = getShiftWindows(entry.shift);
  const unitsPerWorkMinute =
    targetOutput > 0 && totalWorkMinutes > 0
      ? targetOutput / totalWorkMinutes
      : 0;
  const unitsLost =
    durationMinutes <= 0 || unitsPerWorkMinute <= 0
      ? 0
      : Math.max(1, Math.round(unitsPerWorkMinute * durationMinutes));

  await closeDowntimeEntry(id as string, resolvedAt, unitsLost);
  return NextResponse.json({ ok: true, unitsLost, durationMinutes });
}
