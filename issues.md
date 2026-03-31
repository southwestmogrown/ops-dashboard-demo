# Issues: Role-Based Views + Hour-by-Hour Table

---

## Completed Milestones

### M7: SQLite Persistence ✅
All MES state persists to SQLite (`data/ops.db`) via a write-through cache in `mesStore.ts`. Cold starts and hot reloads no longer wipe state. Tables: `scan_events`, `line_queues`, `admin_config`, `line_comments`, `scrap_log`, `sim_clock`, `db_meta`.

### M8: Downtime / Line Stop Logging ✅
**Files:** `src/lib/downtimeTypes.ts`, `src/lib/db.ts` (downtime helpers), `src/app/api/downtime/route.ts`, `src/components/team-lead/DowntimePanel.tsx`, `src/components/team-lead/DowntimeForm.tsx`, `src/lib/status.ts` (open downtime in status reasons), plus wiring into team-lead page.

Structured stop events with reason codes (machine-failure, material-shortage, quality-hold, planned-maintenance, operator-break, safety-stop, changeover, other), duration tracking, units lost, and notes. Feeds OEE availability calculation.

### M9: Real-Time Alerts ✅
**Files:** `src/lib/alertStore.ts`, `src/app/api/metrics/route.ts` (alert detection), `src/components/AlertBanner.tsx`, `src/app/page.tsx` (wiring).

Alert detection for stall (output unchanged), FPY drop below threshold, and pace below 75%. AlertBanner fixed at top of dashboard with severity colors, acknowledge/dismiss, and clear-all. Alerts are ephemeral (not persisted to DB).

### M10: OEE Tracking ✅
**Files:** `src/lib/types.ts` (OEE added to Line), `src/app/api/metrics/route.ts` (OEE computation), `src/app/page.tsx` (Avg OEE KPI card), `src/components/LineTable.tsx` (OEE column), `src/components/LineDrawer.tsx` (OEE tab with A×P×Q breakdown).

OEE = Availability × Performance × Quality per line. Availability driven by downtime log (M8); Performance by HPU; Quality by FPY.

### M11: Shift Handoff ✅
**Files:** `src/lib/handoffTypes.ts`, `src/lib/db.ts` (handoff helpers), `src/app/api/handoff/route.ts`, `src/app/eos/page.tsx` (Handoff tab), `src/components/HandoffBanner.tsx`, `src/app/page.tsx` (banner on load).

Structured handoff form at end of shift on EOS page. Incoming shift sees HandoffBanner on dashboard with acknowledge action. Issues auto-pulled from per-hour comments.

### M12: EOS Scrap Auto-Fill ✅
**File:** `src/app/eos/page.tsx`

Scrap counts (scrapped panels + kicked lids) auto-populated into EOS form from the scrap log on refresh. Quality Summary table added below line cards showing per-line defect counts and derived FPY.

### Bug Fixes (session: 2026-03-28) ✅
- `ShiftSelector.tsx`: WCAG contrast fix (`text-white` → `text-black` on yellow accent)
- `ShiftSelector.tsx`: renamed export from `Header` → `ShiftSelector`
- `Header.tsx`: SIM badge contrast fix (`text-white` → `text-black`)
- `Header.tsx`: `useEffect` closure staleness — added `simClockRef`
- `ReworkPanel.tsx`: fixed unsafe double-cast type narrowing with discriminated union
- `AdminLineCard.tsx`: "Not Running" toggle now calls `onConfigSaved()` to keep parent in sync
- `middleware.ts`: removed `/team-lead` redirect for supervisors — loop fixed
- `sim/SimControls.tsx`: deleted (dead code, never imported)
- `generateMetrics.ts`: removed module-load example call
- EOS: lines without a schedule auto-hidden via `hiddenLines` strip
- HPU: now dynamically computed as `(headcount × elapsedHours) / output` in metrics route

---

### Milestone Status

| Milestone | Status | Notes |
|---|---|---|
| M1: Auth Foundation | ✅ Done | PIN gate, role-based routing, middleware guards |
| M2: Shift Breaks + Hourly Targets | ✅ Done | Correct shift windows, getHourlyTargets, editable breaks config |
| M3: Comments Backend | ✅ Done | mesStore helpers, LineComments type, comments API route |
| M4: Team Lead Page + HourlyTable | ✅ Done | LineDetailCard, HourlyTable with comments, polling page |
| M5: Integration | ✅ Done | PinGate in layout, conditional nav, auth wired throughout |
| M6: Scrap + Rework Logging | ✅ Done | Types, store helpers, scrap API, ScrapForm, ReworkPanel |
| M7: SQLite Persistence | ✅ Done | better-sqlite3, db.ts layer, write-through persistence |
| M8: Downtime / Line Stop Logging | ✅ Done | Types, DB helpers, API, DowntimePanel, DowntimeForm, wiring |
| M9: Real-Time Alerts | ✅ Done | alertStore, alert detection in metrics, AlertBanner |
| M10: OEE Tracking | ✅ Done | OEE A×P×Q computed, OEE KPI card, OEE column, OEE tab in drawer |
| M11: Shift Handoff | ✅ Done | Handoff form on EOS, HandoffBanner on dashboard, acknowledge flow |
| M12: EOS Scrap Auto-Fill | ✅ Done | Scrap stats auto-fill, Quality Summary table on EOS |
| M13: Dashboard Floor Awareness | ✅ Done | Shift clock, trend chart, VS highlighting, E-STOP removed |
| M14: EOS Draft Persistence & Form Structure | ✅ Done | localStorage auto-save, structured notes, configurable email recipient |
| M15: Team Lead Floor Overview + Scrap Speed | ✅ Done | Floor overview grid, quick-log scrap, comment save feedback, alert strip |
| M16: LineTable Readability + LineDrawer Completion | ✅ Done | Sortable cols, wider bars, downtime tab, target ref line, operator contact |
| M17: Simulation Fidelity | ✅ Done | Tick rate fix, changeover penalty, multi-defect scrap, ramp-up/wind-down, failure model |

---

## New in this session

### M13: Dashboard Floor Awareness ✅
Shift clock added to sidebar showing current shift time remaining. Trend chart section added to dashboard main panel with live MES output data. Value stream rows visually highlighted with VS1 (orange) / VS2 (teal) accents. E-STOP button removed from sidebar. Disabled nav items (Inventory / QC / Maintenance) now show "Coming Soon" with muted styling explained in docs.

### M14: EOS Draft Persistence & Form Structure ✅
EOS form state auto-saves to localStorage on every field change — page refresh no longer loses draft data. Notes field structured with labeled sections. Email recipient field made configurable (previously hardcoded placeholder).

### M15: Team Lead Floor Overview + Scrap Speed ✅
Team lead page now shows a floor overview grid when no line is selected — all 6 lines visible with live KPIs at a glance. Quick-log scrap button added for faster scrap entry. Comment save shows feedback toast on success. Floor alert strip added showing critical issues across all lines.

### M16: LineTable Readability + LineDrawer Completion ✅
LineTable gains sortable columns (click header to sort). Progress bars widened for better visual resolution. Dynamic status label now reflects exact condition (ON TRACK, WATCH, CRITICAL, SCHEDULE NEEDED). LineDrawer gains a downtime tab showing all logged stops. Output chart in drawer gains target reference line. Operator contact field added to drawer header.

### M17: Simulation Fidelity ✅
Simulator tick rate corrected (was over-producing at 1×). Changeover penalty applied when completing an order — simulates setup time. Multi-defect scrap model: kicked lid and scrapped panel injection rates tuned. Ramp-up model: lines start slow, reach full pace mid-shift. Wind-down model: production tapers in final hours. Equipment failure injection: occasional random downtime events in sim.

---

---

Two features: (1) role-based access separating supervisors/managers (full admin) from team leads (single-line view), and (2) an hour-by-hour breakdown on the team lead view with per-hour comments for explaining misses.

**Shift schedules:**
- Day: 6:00 AM – 4:30 PM (6:00–16:30), 10 h work time after 75 min breaks
- Night: 5:00 PM – 3:30 AM (17:00–03:30), 10 h work time after 75 min breaks
- Each shift: 3×15 min paid breaks + 1×30 min unpaid lunch = 75 min total breaks
- Day pattern: 2 paid breaks → lunch → 1 paid break
- Night pattern: 1 paid break → lunch → 2 paid breaks
- Work time = 600 − 75 = **525 minutes** per shift

**Hourly target formula:** `planned = round(target × (workingMinutes / 525))` where `workingMinutes` excludes any break minutes in that hour.

---

## Milestone 1 — Auth Foundation

### Issue 1.1 — Create auth types
**File:** `src/lib/authTypes.ts` (new)
```typescript
export type UserRole = "supervisor" | "team-lead";
export const AUTH_PIN = process.env.AUTH_PIN ?? "bak2026";
```

### Issue 1.2 — Create useAuth hook
**File:** `src/hooks/useAuth.ts` (new)
- `useAuth(): { role, isAuthenticated, login(pin, role), logout }`
- Reads/writes `{ pin, role }` to `localStorage` key `"ops-auth"`
- On login success: also sets `document.cookie = "ops-role=<role>; path=/"` for middleware
- `login()` validates PIN against `AUTH_PIN`, returns boolean

### Issue 1.3 — Create PinGate component
**File:** `src/components/PinGate.tsx` (new)
- Full-screen overlay (`fixed inset-0 z-50 bg-background/90 backdrop-blur-sm`)
- Centered card: BAK logo, "Enter PIN" label, masked PIN input, role radio buttons (Supervisor/Manager, Team Lead), Submit button
- Wrong PIN: inline error message below input
- On success: writes to localStorage + sets cookie, overlay unmounts

### Issue 1.4 — Create route middleware
**File:** `src/middleware.ts` (new)
- Intercept `/admin` route (and any other protected routes)
- Read `ops-role` cookie; if missing or not `"supervisor"` → redirect to `/team-lead`
- If no cookie at all → redirect to `/` (PinGate will show)

### Issue 1.5 — Wire PinGate into root layout
**File:** `src/app/layout.tsx`
- Import `useAuth` and `PinGate`
- Render `PinGate` as overlay when `!isAuthenticated`

### Issue 1.6 — Update Header with role-aware nav
**File:** `src/components/Header.tsx`
- Add `useAuth` hook
- Show role badge (`SUP` / `TL`) next to app name
- `Admin` link only when `role === "supervisor"`
- `Team Lead` nav link when `role === "team-lead"`
- Add `Logout` button that calls `logout()`

### Issue 1.7 — Create AdminLayout client guard
**File:** `src/components/admin/AdminLayout.tsx` (new)
- Client component; if `role === "team-lead"` → redirect to `/team-lead`

### Issue 1.8 — Wrap admin page with AdminLayout
**File:** `src/app/admin/page.tsx`
- Wrap default export in `<AdminLayout>`

### Issue 1.9 — Add AUTH_PIN to .env.example
**File:** `.env.example`
```
AUTH_PIN=bak2026
```

---

## Milestone 2 — Shift Break Windows + Hourly Targets

### Issue 2.1 — Update shiftTime.ts with correct windows
**File:** `src/lib/shiftTime.ts`

Replace hardcoded values (day: 6–16h, night: 18–04h) with the correct shift schedule and break windows:

**Shift times:**
- Day: start 6:00, end 16:30 (10.5 clock hours, stored as 6 and 16.5)
- Night: start 17:00, end 03:30 (crosses midnight, stored as 17 and 27.5)

Add `getShiftWindows(shift): ShiftWindow`:
```typescript
interface ShiftWindow {
  startHour: number;           // 6 or 17
  endHour: number;             // 16.5 or 27.5
  totalClockMinutes: number;    // 630
  totalWorkMinutes: number;    // 525 (excludes 75 min breaks)
  breakWindows: { start: number; end: number; paid: boolean }[];
}
```

**Break windows:**

| Shift | Break | Window | Paid? |
|---|---|---|---|
| Day | Break 1 | 08:00–08:15 | yes |
| Day | Break 2 | 10:00–10:15 | yes |
| Day | Lunch | 12:00–12:30 | no |
| Day | Break 3 | 14:00–14:15 | yes |
| Night | Break 1 | 19:00–19:15 | yes |
| Night | Lunch | 21:30–22:00 | no |
| Night | Break 2 | 01:00–01:15 | yes |
| Night | Break 3 | 02:00–02:15 | yes |

### Issue 2.2 — Create shiftBreaks.ts
**File:** `src/lib/shiftBreaks.ts` (new)

`getHourlyTargets(target: number, shift: ShiftName, hourlyOutput: Record<string, number>): HourlyTargetRow[]`

Algorithm:
1. Call `getShiftWindows(shift)` → get `breakWindows[]` and `totalWorkMinutes`
2. For each clock hour `H:00–H+1:00` that falls within the shift:
   - `breakMins = sum(overlap([H, H+1), each break window))`
   - `workingMins = 60 − breakMins`
   - `planned = round(target × (workingMins / totalWorkMinutes))`
   - If `workingMins === 0` → this is a break-only hour, `isBreak = true`, planned = 0
3. `actual = hourlyOutput[hourKey] ?? 0`
4. `variance = actual − planned`
5. `status`: green ≥ planned, amber ≥ planned×0.9, else red
6. Return sorted `HourlyTargetRow[]`

### Issue 2.3 — Add HourlyTargetRow type
**File:** `src/lib/types.ts`
```typescript
export interface HourlyTargetRow {
  hour: string;
  planned: number;
  actual: number;
  variance: number;
  comment: string;
  status: "green" | "amber" | "red";
  isBreak: boolean;
}
```

### Issue 2.4 — Admin-configurable break windows
**File:** `src/lib/mesStore.ts`, `src/app/api/admin/breaks/route.ts` (new)

Break windows must be overridable by admin. Defaults are hardcoded in `shiftTime.ts` (Issue 2.1). Admin can adjust them from the Admin page.

Add to `mesStore.ts`:
```typescript
globalThis.__mesShiftBreaks: Record<ShiftName, { start: number; end: number; paid: boolean }[]> = {
  day: [/* defaults from Issue 2.1 */],
  night: [/* defaults from Issue 2.1 */],
};
getShiftBreaks(shift: ShiftName): { start: number; end: number; paid: boolean }[]
setShiftBreaks(shift: ShiftName, windows): void
```

New API route `GET/POST /api/admin/breaks`:
- `GET` → returns current break windows for both shifts
- `POST { shift, windows }` → `setShiftBreaks(shift, windows)`

Admin UI: add a "Shift Breaks" section to `AdminLineCard` or a separate panel — displays day/night break windows as editable time inputs (e.g. "08:00", "08:15"). On save → `POST /api/admin/breaks`.
```

---

## Milestone 3 — Comments Backend

### Issue 3.1 — Add comments to mesStore
**File:** `src/lib/mesStore.ts`
```typescript
globalThis.__mesComments: Record<string, Record<string, string>> = {}
setLineComment(lineId: string, hour: string, comment: string): void
getLineComments(lineId: string): Record<string, string>
```

### Issue 3.2 — Add LineComments type
**File:** `src/lib/mesTypes.ts`
```typescript
export type LineComments = Record<string, string>; // hour → comment
```

### Issue 3.3 — Create comments API route
**File:** `src/app/api/line/comments/route.ts` (new)
- `GET ?lineId=xxx` → `getLineComments(lineId)` → `Record<string, string>`
- `POST` body `{ lineId, hour, comment }` → `setLineComment(lineId, hour, comment)`
- Returns `{ ok: true }`

---

## Milestone 4 — Team Lead Page + HourlyTable

### Issue 4.1 — Create LineSelector component
**File:** `src/components/team-lead/LineSelector.tsx` (new)
- Grid of 6 line buttons (vs1-l1 … vs2-l2)
- Each shows: line name, VS badge (VS1/VS2 with color), live output/target
- Data from `/api/metrics` + `/api/mes/state`
- Click → sets selected line, shows LineDetailCard

### Issue 4.2 — Create HourlyTable component
**File:** `src/components/team-lead/HourlyTable.tsx` (new)

**Columns:** Hour | Planned | Actual | Variance | Status | Comment

**Row spec:**
- Background by status: green tint (`bg-green-950/30`) / amber tint (`bg-amber-950/30`) / red tint (`bg-red-950/30`)
- Break rows (`isBreak`): `text-slate-600`, diagonal stripe bg, `—` for all numeric values
- Variance: green text if positive, red if negative
- Status: colored dot (green/amber/red circle)
- Comment: inline `<textarea>` auto-saves on blur (debounce 500ms → `POST /api/line/comments`); gold dot indicator if non-empty

### Issue 4.3 — Create LineDetailCard component
**File:** `src/components/team-lead/LineDetailCard.tsx` (new)
- Header: line name + VS badge + "← Back to lines" link
- KPI row: Output / Target / FPY / HPU / Headcount (from `/api/metrics`)
- Active order strip (from `/api/mes/state`): current model, remaining on order, remaining on run sheet
- `HourlyTable` below

### Issue 4.4 — Create team-lead page
**File:** `src/app/team-lead/page.tsx` (new)
- `"use client"`
- If no line selected → render `LineSelector`
- If line selected → render `LineDetailCard`
- Poll `/api/metrics` + `/api/mes/state` every 5 seconds
- Load comments via `GET /api/line/comments?lineId=xxx` on line selection

---

## Milestone 5 — Integration

### Issue 5.1 — Wrap admin page with AdminLayout
**File:** `src/app/admin/page.tsx`
- Wrap with `<AdminLayout>`

### Issue 5.2 — Dashboard auth gate + redirect
**File:** `src/app/page.tsx`
- Import `useAuth`; if `!isAuthenticated` → render `PinGate`
- If `role === "team-lead"` → redirect to `/team-lead`

### Issue 5.3 — Conditional nav in Header
**File:** `src/components/Header.tsx`
- SUP role: show `Admin` link
- TL role: show `Team Lead` link (instead of Admin)

### Issue 5.4 — Cookie sync on login
**File:** `src/hooks/useAuth.ts`
- On login success: also `document.cookie = "ops-role=<role>; path=/"` so middleware can read it

### Issue 5.5 — Verification checklist
- [ ] Clear localStorage → visit `/admin` → redirect to `/`
- [ ] Login as TL → visit `/admin` directly → redirect to `/team-lead`
- [ ] Login as SUP → `/admin` renders normally
- [ ] TL selects line → HourlyTable renders correct number of hours (10 day, 10 night)
- [ ] Comment entered in HourlyTable → reload → comment persists
- [ ] Break rows display with `—` and stripe background
- [ ] Variance colors correct (green positive, red negative)
- [ ] Status dot colors match variance thresholds

---

## Feature — Lines Not Running / Dormant Lines

### Issue F1 — SCHEDULE NEEDED status
**File:** `src/lib/status.ts`
- Add `"unscheduled"` to `RiskLevel` union
- Short-circuit `getRiskLevel` and `getStatusReasons` when `!mesState?.schedule` → return `"unscheduled"` / `["No schedule loaded"]`
- Add `PILL_STYLE` export (moved from LineTable.tsx) with gray `"SCHEDULE NEEDED"` pill for `unscheduled`

**File:** `src/components/LineTable.tsx`
- Import `PILL_STYLE` from `status.ts`; remove local copy

### Issue F2 — Per-line Not Running toggle
**File:** `src/lib/mesStore.ts`
- Add `isRunning?: boolean` to `AdminLineConfig`; `false` = line not running today

**File:** `src/components/admin/AdminLineCard.tsx`
- Add `savedIsRunning` prop; local `isRunning` state; "Running / Not Running" pill toggle at top of card
- Card dims (`opacity-60`) when `isRunning === false`
- Pass `isRunning` through `onConfigSaved(lineId, target, headcount, isRunning)`

**File:** `src/app/admin/page.tsx`
- Pass `savedIsRunning={adminConfig[lineId]?.isRunning}` to both `AdminLineCard` groups
- `handleConfigSaved` now accepts and posts `isRunning`

**File:** `src/app/page.tsx`
- Derive `activeLines = metrics.lines.filter(l => adminConfig[l.id]?.isRunning !== false)`
- KPI totals use `activeLines`; `LineTable`, `OutputChart`, `Header` receive `activeLines`
- `selectedLine` lookup still uses full `metrics.lines` (drawer stays accessible for dormant lines)



### Issue 6.1 — Scrap types
**File:** `src/lib/reworkTypes.ts` (new)
```typescript
// PANEL_OPTIONS = ["A","B","C","D","E","F","G"]
// DAMAGE_TYPES  = ["Damaged Panel","Bent Extrusion","Wrong Part","Missing Hardware","Other"]

export interface ScrapEntryBase {
  id: string; lineId: string; shift: ShiftName; model: string;
  panel: PanelPosition; damageType: DamageType; boughtIn: boolean;
}

export interface ScrappedPanel extends ScrapEntryBase {
  kind: "scrapped-panel"; stationFound: string; howDamaged: string;
}

export interface KickedLid extends ScrapEntryBase {
  kind: "kicked-lid"; affectedArea: "panel"|"extrusion"; auditorInitials: string;
}

export type ScrapEntry = ScrappedPanel | KickedLid;
export interface ScrapStats { kickedLids: number; scrappedPanels: number; totalBoughtIn: number; }
```

### Issue 6.2 — Scrap store helpers
**File:** `src/lib/mesStore.ts` — add:
- `__mesScrapLog: ScrapEntry[]`, `__mesScrapSerial: number` to `declare global`
- `bumpScrapSerial()` → `"SCR-" + String(n).padStart(3, "0")`
- `addScrapEntry(entry)`, `getScrapEntries(lineId, shift)`, `getScrapStats(lineId, shift)`, `getKickedLidsForLineShift(lineId, shift)`
- `resetAll()` → clear scrap log and serial

### Issue 6.3 — Scrap API route
**File:** `src/app/api/scrap/route.ts` (new)
- `GET ?lineId=&shift=` → `getScrapEntries(lineId, shift)`
- `POST` → validate body, call `addScrapEntry()`, return 201

### Issue 6.4 — FPY derivation from scrap log
**Files:** `src/lib/generateMetrics.ts`, `src/app/api/metrics/route.ts`
- `generateMetrics`: `fpy = 100.0` (scrap log is sole FPY driver); add `vs1-l4`; export `getDefaultHeadcount(lineId)` → VS1=45, VS2=40
- Metrics route: after generating, `line.headcount = admin.headcount ?? getDefaultHeadcount(line.id)`; `line.fpy = totalOutput > 0 ? ((totalOutput - kickedLids) / totalOutput) * 100 : 100`

### Issue 6.5 — ScrapForm component
**File:** `src/components/team-lead/ScrapForm.tsx` (new)
- Full-screen modal overlay with backdrop blur
- Kind toggle: "Scrapped Panel" (red) / "Kicked Lid" (amber)
- Shared fields: Model#, Panel (A–G grid), Damage Type (select)
- Scrapped-panel: Station Found, How Damaged (textarea)
- Kicked-lid: Affected Area (Panel/Extrusion toggle), Auditor Initials
- POSTs to `/api/scrap`, calls `onCreated(entry)`, closes on success

### Issue 6.6 — ReworkPanel component
**File:** `src/components/team-lead/ReworkPanel.tsx` (new)
- Collapsible panel; header shows count badges (red scrapped, amber kicked lids)
- Lists each entry: kind badge (SC/KL), model, panel, damage type, time, ID
- "BOUGHT IN" badge on entries where `boughtIn: true`
- Empty state: italic "No entries this shift."

### Issue 6.7 — Wire into LineDetailCard + team-lead page
**Files:** `src/components/team-lead/LineDetailCard.tsx`, `src/app/team-lead/page.tsx`
- LineDetailCard: add `scrapEntries`, `scrapStats`, `onRefreshScrap` props; render `ReworkPanel` + "+ Log Rework" button; show `ScrapForm` modal on click
- Team-lead page: `scrapEntries` state; `refreshScrap()` callback; `useEffect` on `[selectedLineId, shift]`; pass to LineDetailCard

### Future (Out of Scope for M6)
- ERP/external system integration — `boughtIn` boolean is a placeholder; future work hooks this to an external product lookup
- Bought-in product lookup by model# — API route that queries external system, auto-fills `boughtIn` flag on scrap entries

---

## Files Summary

| File | Action |
|---|---|
| `src/lib/authTypes.ts` | CREATE |
| `src/hooks/useAuth.ts` | CREATE |
| `src/components/PinGate.tsx` | CREATE |
| `src/components/admin/AdminLayout.tsx` | CREATE |
| `src/components/team-lead/LineSelector.tsx` | CREATE |
| `src/components/team-lead/HourlyTable.tsx` | CREATE |
| `src/components/team-lead/LineDetailCard.tsx` | CREATE |
| `src/app/team-lead/page.tsx` | CREATE |
| `src/app/api/line/comments/route.ts` | CREATE |
| `src/app/api/admin/breaks/route.ts` | CREATE |
| `src/lib/shiftBreaks.ts` | CREATE |
| `src/middleware.ts` | CREATE |
| `src/lib/reworkTypes.ts` | CREATE |
| `src/app/api/scrap/route.ts` | CREATE |
| `src/components/team-lead/ScrapForm.tsx` | CREATE |
| `src/components/team-lead/ReworkPanel.tsx` | CREATE |
| `src/lib/mesStore.ts` | MODIFY — add `__mesScrapLog`, `__mesScrapSerial` globals + helpers + reset update; add `isRunning` to `AdminLineConfig` |
| `src/lib/status.ts` | MODIFY — add `"unscheduled"` to `RiskLevel`; short-circuit `getRiskLevel`/`getStatusReasons`; export `PILL_STYLE` |
| `src/lib/types.ts` | MODIFY — add `HourlyTargetRow` |
| `src/lib/mesTypes.ts` | MODIFY — add `LineComments` type |
| `src/lib/shiftTime.ts` | MODIFY — update shift windows + breaks |
| `src/lib/generateMetrics.ts` | MODIFY — add vs1-l4, fpy=100, `getDefaultHeadcount` |
| `src/app/api/metrics/route.ts` | MODIFY — derive FPY from scrap log, overlay default HC |
| `src/app/layout.tsx` | MODIFY — add PinGate overlay |
| `src/app/page.tsx` | MODIFY — auth gate + TL redirect + filter inactive lines from dashboard |
| `src/app/admin/page.tsx` | MODIFY — wrap with AdminLayout; pass `savedIsRunning`; update `handleConfigSaved` |
| `src/components/admin/AdminLineCard.tsx` | MODIFY — add `savedIsRunning` prop + "Not Running" toggle |
| `src/components/LineTable.tsx` | MODIFY — import `PILL_STYLE` from `status.ts`, remove local copy |
| `src/components/Header.tsx` | MODIFY — role badge + conditional nav |
| `.env.example` | MODIFY — add `AUTH_PIN=bak2026` |

## Open Questions

*(All resolved.)*

---

## Milestone 7 — SQLite Persistence

> **Context:** All MES state currently lives in `globalThis` variables in `mesStore.ts`. Cold restart (server restart, Vercel cold invocation, `next build` hot reload) silently wipes all schedules, scan events, scrap entries, comments, and admin config mid-shift. This is the single biggest blocker for production use.

### Issue 7.1 — Install better-sqlite3
**File:** `package.json`
- `npm install better-sqlite3`
- Also add `@types/better-sqlite3` to devDependencies
- Note: `better-sqlite3` is synchronous — use it server-side only in API routes and `mesStore.ts` (never in client components)

### Issue 7.2 — Create DB layer
**File:** `src/lib/db.ts` (new)

Initialize the DB file at `./data/ops.db` (create `./data/` dir if it doesn't exist). Run migrations on every import.

```typescript
// src/lib/db.ts
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH  = path.join(DATA_DIR, "ops.db");

let _db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  runMigrations(_db);
  return _db;
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_events (
      id        TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      line_id   TEXT NOT NULL,
      shift     TEXT NOT NULL,
      part_number TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scan_line ON scan_events(line_id);
    CREATE INDEX IF NOT EXISTS idx_scan_line_shift ON scan_events(line_id, shift);

    CREATE TABLE IF NOT EXISTS line_queues (
      line_id  TEXT PRIMARY KEY,
      queue    TEXT NOT NULL  -- JSON-encoded LineSchedule[]
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      line_id   TEXT PRIMARY KEY,
      target    REAL,
      headcount INTEGER,
      is_running INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS line_comments (
      line_id  TEXT NOT NULL,
      hour     TEXT NOT NULL,   -- "07:00"
      comment  TEXT NOT NULL,
      PRIMARY KEY (line_id, hour)
    );

    CREATE TABLE IF NOT EXISTS scrap_log (
      id        TEXT PRIMARY KEY,
      line_id   TEXT NOT NULL,
      shift     TEXT NOT NULL,
      model     TEXT NOT NULL,
      panel     TEXT NOT NULL,
      damage_type TEXT NOT NULL,
      bought_in INTEGER DEFAULT 0,
      kind      TEXT NOT NULL,   -- "scrapped-panel" | "kicked-lid"
      extra     TEXT NOT NULL,   -- JSON of remaining fields by kind
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scrap_line_shift ON scrap_log(line_id, shift);

    CREATE TABLE IF NOT EXISTS sim_clock (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      clock   TEXT,       -- ISO timestamp or null
      running INTEGER DEFAULT 0,
      speed   REAL DEFAULT 60
    );
    INSERT OR IGNORE INTO sim_clock (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS db_meta (
      key  TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
```

### Issue 7.3 — Wrap DB in helper functions
**File:** `src/lib/db.ts`

```typescript
// Serial counters
export function getMeta(key: string): string | undefined { ... }
export function setMeta(key: string, value: string): void { ... }

// Scan events
export function dbInsertScan(event: ScanEvent): void { ... }
export function dbGetScans(lineId: string): ScanEvent[]
export function dbGetScansByLineShift(lineId: string, shift: string): ScanEvent[]
export function dbGetAllScanLineIds(): string[]  // distinct lineIds in scan_log

// Queues
export function dbGetQueue(lineId: string): LineSchedule[] | undefined
export function dbSetQueue(lineId: string, queue: LineSchedule[]): void
export function dbDeleteQueue(lineId: string): void

// Admin config
export function dbGetAdminConfig(lineId: string): AdminLineConfig
export function dbSetAdminConfig(lineId: string, config: AdminLineConfig): void
export function dbGetAllAdminConfig(): Record<string, AdminLineConfig>

// Comments
export function dbGetComments(lineId: string): LineComments
export function dbSetComment(lineId: string, hour: string, comment: string): void
export function dbDeleteComment(lineId: string, hour: string): void

// Scrap
export function dbInsertScrap(entry: ScrapEntry): void
export function dbGetScrapEntries(lineId: string, shift: string): ScrapEntry[]
export function dbGetKickedLids(lineId: string, shift: string): number

// Sim clock
export function dbGetSimClock(): { clock: Date | null; running: boolean; speed: number }
export function dbSetSimClock(clock: Date | null, running: boolean, speed: number): void
```

### Issue 7.4 — Refactor mesStore.ts to use DB
**File:** `src/lib/mesStore.ts`

Replace all `globalThis.__mes*` globals with calls to `db.ts`. All exported function signatures remain identical — callers need no changes.

**Key changes:**
- `queues[lineId]`, `scanLog`, `adminConfig`, `_comments`, `_scrapLog`, `_scrapSerial`, `_simClock`, `_simRunning`, `_simSpeed` — all read from DB on first access, cached in module scope for the lifetime of the worker
- `setSchedule` → `dbSetQueue` + update in-memory cache
- `tickLine` → `dbInsertScan` for each event (batch insert for performance)
- `addScrapEntry` → `dbInsertScrap`
- `setLineComment` → `dbSetComment`
- `resetAll` → delete all rows from all tables + reset meta + clear in-memory cache

**Caching strategy:** Keep in-memory copies (current approach) but write-through to DB on every mutation. On module init, load from DB into in-memory state. This keeps API latency low while ensuring persistence.

```typescript
// Initialization pattern (top of mesStore.ts):
import { getDb, ... } from "./db";

function loadFromDb() {
  // Load all scan events into scanLog[]
  // Load all queues into queues{}
  // Load all admin config into adminConfig{}
  // Load all comments into _comments{}
  // Load all scrap entries into _scrapLog{}
  // Load serial counters from db_meta
  // Load sim clock state
}

let _initialized = false;
function ensureInit() {
  if (_initialized) return;
  loadFromDb();
  _initialized = true;
}
```

### Issue 7.5 — Add data/ to .gitignore
**File:** `.gitignore`
```
data/
```

---

## Milestone 8 — Downtime / Line Stop Logging

> **Context:** The most important missing operational feature. No structured way to log when a line stops, why, and how many units were lost. Stall detection (output doesn't change between polls) has no duration tracking or root cause capture.

### Issue 8.1 — Add downtime types
**File:** `src/lib/downtimeTypes.ts` (new)

```typescript
export type DowntimeReason =
  | "machine-failure"
  | "material-shortage"
  | "quality-hold"
  | "planned-maintenance"
  | "operator-break"
  | "safety-stop"
  | "changeover"
  | "other";

export interface DowntimeEntry {
  id:          string;       // "DT-001"
  lineId:      string;
  shift:       ShiftName;
  reason:      DowntimeReason;
  startTime:   string;       // ISO timestamp
  endTime:     string | null; // null = ongoing
  unitsLost:   number;
  notes:       string;
  createdBy:   string;       // role: "supervisor" | "team-lead"
}
```

### Issue 8.2 — Add downtime helpers to db.ts
**File:** `src/lib/db.ts`
- `CREATE TABLE IF NOT EXISTS downtime_log (...)`
- `dbInsertDowntime(entry)` — insert with auto-serial
- `dbGetDowntimeEntries(lineId, shift)` — list all
- `dbCloseDowntime(id, endTime)` — set endTime on an open entry
- `dbGetOpenDowntime(lineId)` — find ongoing stop (endTime is null)
- `dbGetTotalDowntimeMinutes(lineId, shift)` — sum of all closed + ongoing durations

### Issue 8.3 — Downtime API route
**File:** `src/app/api/downtime/route.ts` (new)
- `GET ?lineId=&shift=` → `dbGetDowntimeEntries`
- `POST { lineId, reason, startTime, unitsLost?, notes?, createdBy }` → `dbInsertDowntime`
- `PATCH { id, endTime }` → `dbCloseDowntime`
- `DELETE { id }` → delete entry (admin only)

### Issue 8.4 — DowntimePanel component
**File:** `src/components/team-lead/DowntimePanel.tsx` (new)
- Collapsible panel in `LineDetailCard`
- Header: total downtime this shift (e.g., "47 min downtime"), red flag icon
- List of entries: reason badge, start→end (or "ONGOING" in red), duration, units lost
- "+ Log Stop" button → opens `DowntimeForm` modal
- Auto-refreshes with parent polling interval

### Issue 8.5 — DowntimeForm modal
**File:** `src/components/team-lead/DowntimeForm.tsx` (new)
- Line ID (pre-filled), reason dropdown (all reason codes), start time (defaults to now), end time (optional — if omitted, entry is "ongoing"), units lost (number input), notes (textarea)
- "Log Stop" button → POST `/api/downtime`; on success → close modal + refresh panel
- "Mark Resolved" button → PATCH `/api/downtime` with current time as endTime

### Issue 8.6 — Wire into LineDetailCard
**Files:** `src/components/team-lead/LineDetailCard.tsx`, `src/app/team-lead/page.tsx`
- Fetch downtime entries alongside metrics on poll
- Show `DowntimePanel` in the card below rework panel

### Issue 8.7 — Downtime in LineTable risk reasons
**File:** `src/lib/status.ts`
- `getStatusReasons`: if line has an open downtime entry → add `"Line stopped"` to reasons

---

## Milestone 9 — Real-Time Alerts

> **Context:** Stalled lines generate a hover tooltip only. A supervisor managing 6 lines on a busy floor cannot afford to hover over every row. The system needs to push alerts proactively.

### Issue 9.1 — Create alert store
**File:** `src/lib/alertStore.ts` (new)

```typescript
export type AlertKind = "stall" | "fpydrop" | "pacealert" | "scheduleneeded" | "downtime";

export interface Alert {
  id:       string;
  kind:     AlertKind;
  lineId:   string;
  lineName: string;
  message:  string;   // human-readable: "VS1 Line 1 — no output for 12 min"
  severity: "warning" | "critical";
  createdAt: string;  // ISO
  acknowledgedAt?: string;
}

export interface AlertState {
  alerts: Alert[];
  ackAlert(id: string): void;
  addAlert(alert: Omit<Alert, "id" | "createdAt">): void;
  dismissStale(): void;  // remove alerts older than 5 min not acknowledged
}
```

Alerts are ephemeral (not persisted to DB) — they represent current-floor conditions only.

### Issue 9.2 — Alert detection in metrics route
**File:** `src/app/api/metrics/route.ts`

After deriving all line states, check:
- **Stall:** if line has a schedule but output didn't change in the last 60 seconds → add stall alert
- **FPY drop:** if FPY < 90% and severity ≥ warning threshold → add FPY alert
- **Pace alert:** if pace < 75% of target → add critical pace alert

Return alerts array alongside `ShiftMetrics`.

### Issue 9.3 — AlertBanner component
**File:** `src/components/AlertBanner.tsx` (new)
- Fixed banner at top of dashboard (below header), above KPIs
- Shows all unacknowledged alerts with severity color (amber=warning, red=critical)
- Each alert: line name, message, "Acknowledge" button → removes from banner
- "Clear All" button → acknowledges all
- Animates in (slide down) when first alert fires, slides out when all acknowledged
- `role="alert"` for screen readers

### Issue 9.4 — Wire into dashboard page
**File:** `src/app/page.tsx`
- Add `alerts: Alert[]` state from metrics fetch
- Render `<AlertBanner>` when `alerts.length > 0`
- On acknowledge → `ackAlert(id)` and refetch to get updated list

---

## Milestone 10 — OEE Tracking

> **Context:** The system tracks output and FPY but not downtime-caused availability losses. OEE = Availability × Performance × Quality. Supervisors need this single number.

### Issue 10.1 — Compute OEE in metrics route
**File:** `src/app/api/metrics/route.ts`

For each line:
```typescript
const totalMinutes = elapsedHours * 60;
const downtimeMinutes = dbGetTotalDowntimeMinutes(lineId, shift); // from Issue 8.3
const availableMinutes = totalMinutes - downtimeMinutes;
const availability = availableMinutes > 0 ? availableMinutes / totalMinutes : 1;

const performance = hpu > 0 ? Math.min(1, 0.35 / hpu) : 1; // 0.35 HPU = 100% performance
// If HPU ≤ 0.35 → 100% performance; degrades as HPU rises above 0.35

const quality = fpy / 100; // 0-1

const oee = availability * performance * quality; // 0-1
```

Add to `Line` interface: `oee: number` (0-100).

### Issue 10.2 — OEE card on dashboard
**File:** `src/app/page.tsx`, `src/components/KpiCard.tsx`
- Add `Avg OEE` KPI card showing average OEE across all active lines
- Color: green ≥ 85%, amber ≥ 70%, red < 70%
- Tooltip: breakdown of A × P × Q = OEE

### Issue 10.3 — Per-line OEE in LineTable
**File:** `src/components/LineTable.tsx`
- Add OEE column or inline in the line row
- Clicking OEE in the row opens LineDrawer to the OEE tab

### Issue 10.4 — OEE tab in LineDrawer
**File:** `src/components/LineDrawer.tsx`
- Add "OEE" tab alongside Output / FPY / HPU
- Stacked area or bar chart: Availability, Performance, Quality, OEE over time
- Per-hour breakdown table of the three OEE components

---

## Milestone 11 — Shift Handoff

> **Context:** EOS notes capture issues for the incoming shift, but there is no mechanism to push them or ensure they're acknowledged.

### Issue 11.1 — Handoff types
**File:** `src/lib/handoffTypes.ts` (new)

```typescript
export interface ShiftHandoff {
  id:          string;     // "HANDOVER-2026-03-28-day"
  date:        string;      // "2026-03-28"
  shift:       ShiftName;
  outgoingId:  string;     // supervisor/team-lead name or ID
  incomingId:  string | null;
  status:      "pending" | "acknowledged";
  acknowledgedAt: string | null;
  issues:      HandoffIssue[];
  openDowntime: number;    // count of ongoing downtime entries at handoff time
  createdAt:   string;
}

export interface HandoffIssue {
  lineId:    string;
  kind:      "quality" | "downtime" | "staffing" | "material" | "other";
  summary:   string;
  severity:  "info" | "warning" | "critical";
}
```

### Issue 11.2 — Handoff DB table + helpers
**File:** `src/lib/db.ts`
- `CREATE TABLE IF NOT EXISTS shift_handoffs (...)`
- `dbUpsertHandoff(h: ShiftHandoff): void`
- `dbGetLatestHandoff(date, shift): ShiftHandoff | null`
- `dbAcknowledgeHandoff(id, incomingId): void`

### Issue 11.3 — Handoff API route
**File:** `src/app/api/handoff/route.ts` (new)
- `GET ?date=&shift=` → `dbGetLatestHandoff`
- `POST { ... }` → `dbUpsertHandoff` (creates or updates)
- `PATCH { id, incomingId }` → `dbAcknowledgeHandoff`

### Issue 11.4 — Handoff form on EOS page
**File:** `src/app/eos/page.tsx`
- Add a "Handoff" tab alongside "Line Status" / "Local" / "Pre/Post Shift"
- Pre-populated with: all lines' open downtime count, top issues from per-hour comments
- Supervisor fills outgoing name, selects incoming supervisor from a short list (or types name)
- Issues auto-pulled from comments but editable
- "Submit & Finish Shift" button → POST `/api/handoff` + normal EOS flow

### Issue 11.5 — Incoming shift handoff banner
**File:** `src/app/page.tsx`, `src/components/HandoffBanner.tsx` (new)
- On dashboard load, check for an unacknowledged handoff for today's shift
- If exists and `status === "pending"` → show banner at top: "Open handoff from [outgoing] — [View & Acknowledge] button"
- "Acknowledge" button → PATCH `/api/handoff` with incoming name → banner dismisses

---

## Milestone 12 — EOS Scrap Auto-Fill

> **Context:** Supervisors must manually transcribe scrap counts into the EOS form. The system already captures all scrap entries — EOS should pull them automatically.

### Issue 12.1 — Add scrap stats to EOS refresh
**File:** `src/app/eos/page.tsx`
- `refreshFromMes()` already fetches `/api/metrics` and `/api/mes/state`
- Also fetch `/api/scrap?lineId=<line>&shift=<shift>` for each visible line
- Pre-fill EOS `scrapPanels` and `kickedLids` fields from the scrap stats
- Show a small badge on each line: "3 KL, 1 SP" next to the line name if any entries exist

### Issue 12.2 — Scrap summary section on EOS
**File:** `src/app/eos/page.tsx`
- Below the line cards, add a "Quality Summary" section
- Table: Line | Scrapped Panels | Kicked Lids | Total Defects | FPY (derived)
- Pulled directly from `getScrapStats` — read-only, not editable

---

## Bug Fixes

### Bug 1 — ShiftSelector selected state WCAG contrast violation
**File:** `src/components/ShiftSelector.tsx` line ~27
- Change `"bg-accent text-white"` → `"bg-accent text-black"` to fix yellow/white contrast

### Bug 2 — Header SIM badge WCAG contrast violation
**File:** `src/components/Header.tsx`
- Change SIM badge `text-white` → `text-black` on yellow accent background

### Bug 3 — Header useEffect simClock closure staleness
**File:** `src/components/Header.tsx` lines 29-41
- Remove `simClock` from the `useEffect` dependency array (it is only read as a fallback value, not used to trigger re-runs), OR refactor to use a ref

### Bug 4 — Dead code: SimControls.tsx never imported
**File:** `src/components/sim/SimControls.tsx`
- Either remove this file, or verify it is truly unused and delete it

### Bug 5 — ReworkPanel fragile type cast
**File:** `src/components/team-lead/ReworkPanel.tsx` lines ~94-98
- Replace `(entry as unknown as { stationFound: string }).stationFound` with proper discriminated union narrowing:
  ```typescript
  if (entry.kind === "scrapped-panel") {
    return entry.stationFound;
  }
  return (entry as KickedLid).affectedArea;  // for kicked-lid
  ```

### Bug 6 — AdminLineCard NotRunning toggle bypasses parent state
**File:** `src/components/admin/AdminLineCard.tsx` lines ~103-110
- Call `onConfigSaved(lineId, undefined, undefined, nextIsRunning)` instead of calling `fetch` directly
- OR call `onConfigSaved` as well as the direct fetch to keep parent in sync

### Bug 7 — Middleware redirect loop for supervisors on /team-lead
**File:** `src/middleware.ts` lines ~16-20
- Supervisors (role = "supervisor") should be allowed on `/team-lead` — remove that redirect condition. Only `team-lead` role should be redirected away from `/admin`.

### Bug 8 — ShiftSelector component exports as "Header"
**File:** `src/components/ShiftSelector.tsx` line ~15
- Rename export: `export default function ShiftSelector(...)` instead of `export default function Header(...)`

### Bug 9 — generateMetrics dead example at bottom of file
**File:** `src/lib/generateMetrics.ts` line ~104
- Remove the example `console.log(generateMetrics("day"))` call — it runs at module load time and produces no useful output

---

## Files Summary (New Milestones)

| File | Action |
|---|---|
| `src/lib/db.ts` | CREATE — SQLite wrapper + migrations |
| `src/lib/downtimeTypes.ts` | CREATE |
| `src/app/api/downtime/route.ts` | CREATE |
| `src/components/team-lead/DowntimePanel.tsx` | CREATE |
| `src/components/team-lead/DowntimeForm.tsx` | CREATE |
| `src/lib/alertStore.ts` | CREATE |
| `src/components/AlertBanner.tsx` | CREATE |
| `src/lib/handoffTypes.ts` | CREATE |
| `src/app/api/handoff/route.ts` | CREATE |
| `src/components/HandoffBanner.tsx` | CREATE |
| `data/` | CREATE — gitignored DB directory |
| `package.json` | MODIFY — add `better-sqlite3`, `@types/better-sqlite3` |
| `src/lib/mesStore.ts` | MODIFY — use db.ts for all persistence |
| `src/lib/types.ts` | MODIFY — add `oee` to `Line` |
| `src/app/api/metrics/route.ts` | MODIFY — compute OEE, return alerts, call downtime helpers |
| `src/app/page.tsx` | MODIFY — wire AlertBanner, HandoffBanner |
| `src/app/eos/page.tsx` | MODIFY — scrap auto-fill, quality summary, handoff tab |
| `src/components/LineTable.tsx` | MODIFY — add OEE column, downtime reasons |
| `src/components/LineDrawer.tsx` | MODIFY — OEE tab |
| `src/components/team-lead/LineDetailCard.tsx` | MODIFY — wire DowntimePanel |
| `src/app/team-lead/page.tsx` | MODIFY — fetch downtime entries |
| `src/components/Header.tsx` | MODIFY — SIM badge contrast fix, useEffect fix |
| `src/components/ShiftSelector.tsx` | MODIFY — contrast fix, rename to ShiftSelector |
| `src/components/admin/AdminLineCard.tsx` | MODIFY — NotRunning toggle parent sync |
| `src/components/team-lead/ReworkPanel.tsx` | MODIFY — type cast fix |
| `src/lib/generateMetrics.ts` | MODIFY — remove dead example call |
| `.gitignore` | MODIFY — add `data/` |

---

---

# Technical Debt Reduction & Refactoring (Adversarial Review Results)

## Priority Overview

**CRITICAL SECURITY (Fix immediately):**
- M18: API Route Authentication Middleware

**HIGH WASTE / EFFICIENCY (Fix before next feature):**
- M19: Navigation Component Consolidation
- M20: Role-Check Logic Extraction
- M21: API Fetch Deduplication & Caching

**MEDIUM WASTE / CODE QUALITY (Fix in next sprint):**
- M22: Type Definition Organization
- M23: Tailwind CSS Abstraction
- M24: Dynamic Import Audit

---

## M18: API Route Authentication Middleware — SECURITY CRITICAL ⚠️

**Status:** ✅ Implemented (2026-03-31)  
**Severity:** CRITICAL — All 12 API endpoints lack server-side auth checks

### Problem
Currently **zero server-side authorization** on any API route. All role enforcement is client-side:
- `/api/mes/schedule` POST — accepts malicious PDFs if client-side check bypassed
- `/api/admin/config` POST — allows team leads to modify production targets if they can craft a request
- `/api/scrap`, `/api/downtime` — could be forged by unauthorized callers

### Solution

**File:** `src/lib/apiAuth.ts` (new)
```typescript
export function requireRole(requiredRole: "supervisor" | "team-lead") {
  return async (req: NextRequest) => {
    const ops_role = req.cookies.get("ops-role")?.value;
    if (ops_role !== requiredRole) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  };
}
```

**Apply to routes (HIGH priority):**
- `POST /api/mes/schedule` — supervisor only
- `POST /api/mes/reset` — supervisor only
- `PATCH/DELETE /api/admin/config` — supervisor only
- `PATCH /api/admin/queue` — supervisor only

**Apply to routes (MEDIUM priority):**
- `POST /api/downtime` — team-lead or supervisor (audit logged to `createdBy`)
- `POST /api/scrap` — team-lead or supervisor

**Apply to routes (NICE-TO-HAVE):**
- `GET /api/metrics` — currently public (dashboards are visible to all), OK as-is
- `GET /api/mes/state` — currently public, OK for data visibility

### Files Affected
- `src/api/mes/schedule/route.ts` — add middleware guard to POST/PATCH/DELETE
- `src/api/mes/reset/route.ts` — add middleware guard
- `src/api/admin/config/route.ts` — add middleware guard
- `src/api/admin/queue/route.ts` — add middleware guard
- `src/api/downtime/route.ts` — verify audit trail
- `src/api/scrap/route.ts` — verify audit trail
- **NEW:** `src/lib/apiAuth.ts` — helper function

### Acceptance Criteria
- [x] All sensitive endpoints return 403 if user lacks required role
- [x] Cookie-based auth verified before any data mutation
- [x] Downtime entries now log `createdBy` from authenticated role cookie
- [ ] POST to `/api/mes/schedule` with supervisor PIN fails if called as TL (manual QA pending)

---

## M19: Navigation Component Consolidation — HIGH WASTE

**Status:** ✅ Implemented (2026-03-31)  
**Severity:** HIGH — 160+ LOC duplication across 4 pages

### Problem
Sidebar navigation **identical on 4 pages:** `page.tsx`, `admin/page.tsx`, `eos/page.tsx`, `sim/page.tsx`. 
Each manually renders:
```tsx
<aside className="w-64 shrink-0 bg-surface-low border-r border-border">
  <div className="p-6 border-b border-border">
    <span className="text-lg font-black text-accent">OP-CENTER</span>
  </div>
  <nav className="flex-1 py-4">
    <Link href="/" className={...}>Dashboard</Link>
    <Link href="/admin" className={...}>Admin</Link>
  </nav>
</aside>
```

### Solution

**File:** `src/components/SidebarNav.tsx` (new)
```typescript
export default function SidebarNav({ items, activePath }: SidebarNavProps) {
  return (
    <aside className="w-64 shrink-0 bg-surface-low border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-vs2 animate-pulse" />
          <span className="text-lg font-black text-accent font-['Space_Grotesk',sans-serif]">
            OP-CENTER
          </span>
        </div>
      </div>
      <nav className="flex-1 py-4">
        {items.map((item) => {
          const isActive = activePath === item.href;
          return <Link key={item.label} href={item.href}>...</Link>;
        })}
      </nav>
    </aside>
  );
}
```

Then replace 40-line nav blocks in each file with `<SidebarNav />`.

### Files Affected
- **NEW:** `src/components/SidebarNav.tsx` — consolidated sidebar with configurable header/link styles
- `src/app/page.tsx` — sidebar replaced with `<SidebarNav />`
- `src/app/admin/page.tsx` — sidebar replaced with `<SidebarNav />`
- `src/app/eos/page.tsx` — sidebar replaced with `<SidebarNav />` (custom header variant preserved)
- `src/app/sim/page.tsx` — sidebar replaced with `<SidebarNav />` (sim-specific header + link styling preserved)

### Acceptance Criteria
- [x] Sidebar renders identically on all 4 pages (including page-specific variants)
- [x] Active state highlights correctly
- [x] No visual regression (verified by successful production build)

---

## M20: Role-Check Logic Extraction — MODERATE WASTE + SECURITY

**Status:** Not Started  
**Severity:** HIGH — 28 LOC duplication + redirect flash bug

### Problem
All 4 main pages have **identical redirect on mount:**
```tsx
useEffect(() => {
  if (!isAuthenticated) return;
  if (role === "team-lead") {
    router.push("/team-lead");
  }
}, [role, isAuthenticated, router]);
```

Appears in: `admin/page.tsx`, `page.tsx`, `eos/page.tsx`, `sim/page.tsx`

**Also:** Middleware only protects `/admin` route. Routes `/eos` and `/sim` rely on client-side redirects → users briefly see content before redirect → UX flash.

### Solution

**File:** `src/hooks/useRedirectTeamLead.ts` (new)
```typescript
export function useRedirectTeamLead() {
  const router = useRouter();
  const { role, isAuthenticated } = useAuth();
  
  useEffect(() => {
    if (!isAuthenticated) return;
    if (role === "team-lead") {
      router.replace("/team-lead");
    }
  }, [role, isAuthenticated, router]);
}
```

**Usage in pages:**
```tsx
// page.tsx admin/page.tsx, eos/page.tsx, sim/page.tsx
"use client";
import { useRedirectTeamLead } from "@/hooks/useRedirectTeamLead";

export default function AdminPage() {
  useRedirectTeamLead(); // Call at top of component
  // ...
}
```

**File:** `src/middleware.ts` (modify)
Add route matchers:
```typescript
export const config = {
  matcher: ["/admin", "/eos/:path*", "/sim/:path*"],
};
```

Then middleware redirects both admin + eos + sim if not supervisor → eliminates client-side flash.

### Files Affected
- **NEW:** `src/hooks/useRedirectTeamLead.ts` — extract hook
- `src/middleware.ts` — extend matchers to `/eos/*`, `/sim/*`
- `src/app/page.tsx` — remove useEffect redirect, call `useRedirectTeamLead()`
- `src/app/admin/page.tsx` — remove useEffect redirect, call hook
- `src/app/eos/page.tsx` — remove useEffect redirect, call hook
- `src/app/sim/page.tsx` — remove useEffect redirect, call hook

### Acceptance Criteria
- [ ] All 4 pages call `useRedirectTeamLead()`
- [ ] User does not see brief dashboard flash when accessing `/eos` as team lead
- [ ] Code removed from 4 pages (~28 LOC)

---

## M21: API Fetch Deduplication & Caching — MODERATE WASTE

**Status:** Not Started  
**Severity:** MODERATE — 5-10× redundant requests for same data

### Problem
Multiple inefficiencies identified:

1. **Header clock fetches independently**: `Header.tsx` polls `/api/sim/clock` every 5s, but **every page also fetches it**. Result: 2-4 redundant requests per 5s window when multiple pages open.

2. **`/api/admin/config` fetched 6 places**: dashboard (5s), team-lead (5s), admin (init), sim (2s), eos (init), Header context. If 2+ pages open → 10-15 requests/min for same config.

3. **`/api/mes/state` fetched 5 places**: Similar duplication. Simulator polls every 2s despite **driving the state via `/api/mes/tick`** — wasteful.

### Solution Options
**Option A (Quick): Reduce polling intervals + Header caching**
- Header exports sim clock to context
- Pages consume from context instead of direct fetch
- Extend poll intervals to 10s where safe
- ETA: 2-3 hrs, saves ~60% redundant requests

**Option B (Recommended): Add React Query**
- Implement `react-query` with 30s stale cache
- Deduplicate requests automatically
- Add refetch-on-focus behavior
- ETA: 4-5 hrs, saves ~80% redundant requests

**Option C (Future): GraphQL subscription**
- Not recommended for current scope

### Files Affected (Option A)
- `src/components/Header.tsx` — don't fetch clock, consume from context
- `src/app/page.tsx` — export clock to context via custom hook
- All other pages — consume from context

### Acceptance Criteria
- [ ] Simulator tick rate doesn't cause cascading state fetches
- [ ] When 2+ pages open, `/api/admin/config` fetch count ≤ 2/min (was 12+/min)
- [ ] Header clock updates without duplicate requests

---

## M22: Type Definition Organization — CODE QUALITY

**Status:** Not Started  
**Severity:** LOW — organizational clarity, not functional

### Problem
Types split across 6 files with unclear domain boundaries:
- `src/lib/types.ts` — core: Line, TimePoint, ShiftMetrics
- `src/lib/mesTypes.ts` — MES simulator: RunSheetItem, LineState, etc.
- `src/lib/eosTypes.ts` — EOS report: EOSFormData, EOSLineEntry
- `src/lib/reworkTypes.ts` — scrap quality: ScrapEntry, KickedLid, DAMAGE_TYPES
- `src/lib/downtimeTypes.ts` — downtime: DowntimeEntry, DOWNTIME_REASON_LABELS
- `src/lib/authTypes.ts` — auth: UserRole, SUPERVISOR_PIN, TEAM_LEAD_PIN

### Solution
**Option A (Minimal):** Keep as-is; document domain in each file header.

**Option B (Ideal):** Create `src/lib/types/` directory:
```
src/lib/types/
  index.ts              ← exports * from all files
  core.ts               ← Line, TimePoint, ShiftMetrics, ShiftName
  mes.ts                ← RunSheetItem, LineSchedule, ScanEvent, LineState
  eos.ts                ← EOSFormData, EOSLineEntry, EOSLineDescriptor
  quality.ts            ← ScrapEntry, KickedLid, PANEL_OPTIONS, DAMAGE_TYPES
  downtime.ts           ← DowntimeEntry, DOWNTIME_REASON_LABELS
  auth.ts               ← UserRole, SUPERVISOR_PIN, TEAM_LEAD_PIN
```

Then update all imports: `from "@/lib/types/core"` etc.

### Files Affected
- Create `src/lib/types/` directory structure
- Update ~20 imports across codebase
- Update `tsconfig.json` paths if needed

### Acceptance Criteria
- [ ] Types organized by logical domain
- [ ] Imports remain compatible (via `index.ts`)
- [ ] No unused exports

---

## M23: Tailwind CSS Abstraction — LOW WASTE

**Status:** Not Started  
**Severity:** LOW — minor performance, code clarity

### Problem
Repeated Tailwind patterns that should be @apply rules or component libraries:

1. **Navigation link:** `flex items-center space-x-3 px-4 py-3 + border-l-4 + conditional` — 8+ uses
2. **Card base:** `bg-surface rounded-sm p-5` — 50+ uses
3. **Accent bars:** `border-l-4 border-accent` or `absolute top-0 left-0 w-full h-[2px] bg-accent` — 8+ uses
4. **Micro label:** `text-[10px] uppercase font-bold tracking-widest` — 15+ uses
5. **Spacing combo:** `px-3.5 py-2.5` — 12+ exact uses

### Solution

**File:** Update `src/app/globals.css`
```css
@layer components {
  /* Card base */
  .card {
    @apply bg-surface rounded-sm p-5;
  }
  
  /* Card with accent border left */
  .card-accent {
    @apply card border-l-4 border-accent;
  }

  /* Accent bar (top) */
  .accent-bar-top {
    @apply absolute top-0 left-0 w-full h-[2px] bg-accent;
  }

  /* Generic nav link with active state */
  .nav-link {
    @apply flex items-center space-x-3 px-4 py-3 transition-colors;
  }
  
  .nav-link-active {
    @apply nav-link bg-surface-high text-accent border-l-4 border-accent;
  }
  
  .nav-link-inactive {
    @apply nav-link text-[#e1e2ec]/40 hover:bg-surface-high/50 hover:text-[#e1e2ec] border-l-4 border-transparent;
  }

  /* Micro label */
  .micro-label {
    @apply text-[10px] uppercase font-bold tracking-widest;
  }

  /* Standard padding for input fields */
  .input-pad {
    @apply px-3.5 py-2.5;
  }
}
```

Then replace~150 class strings with 6-8 component classes.

### Files Affected
- `src/app/globals.css` — add @apply rules
- `src/components/*/` — update 40-50 classNames to use new components
- Biggest wins: nav links (Sidebar, Header), card patterns (KpiCard, EOSLineCard)

### Acceptance Criteria
- [ ] No visual regression
- [ ] Component class usage > 80% coverage
- [ ] Overall classNamestring length reduced by 40%

---

## M24: Dynamic Import Audit — NICE-TO-HAVE

**Status:** Not Started  
**Severity:** LOW — bundle size optimization

### Problem
~8 dynamic imports marked `ssr: false`. Need to verify each is necessary:
- **HourlyTable** — uses Date/formatting, correct to exclude from SSR
- **LineDrawer** — uses useState for tab state, correct
- **EOSEmailPreview** — uses Recharts, correct
- **OutputChart** — uses Recharts, correct
- Others — unclear if truly needed

### Solution
Audit each dynamic import:
1. Check if component uses `document`, `window`, or `useEffect`
2. If only client state hooks → might be unnecessarily dynamic
3. If uses browser APIs → keep dynamic

Move non-browser-API components back to static imports.

### Files Affected
- Various pages and components with dynamic imports
- Measure bundle size before/after

### Acceptance Criteria
- [ ] All dynamic imports justified with comment
- [ ] Remove 2-3 unnecessary dynamic imports if found
- [ ] Confirm no build errors or hydration mismatches

---
