# ops-dashboard-demo — Claude context

## Project summary
A Next.js 16 (App Router) operations dashboard for a manufacturing floor. Displays production-line KPIs, a line table grouped by value stream, and an output chart. Includes an EOS (end-of-shift) report generator, an admin page for schedule/target/headcount configuration, and a MES simulator that drives live output numbers from PDF run sheets.

## Tech stack
- **Next.js 16 + React 19** (App Router, `"use client"` where needed)
- **TypeScript 5**
- **Tailwind CSS 4** — utility classes only, no CSS modules
- **Recharts 3** — all charts; must be dynamically imported (`ssr: false`)
- **pdfjs-dist** — client-side PDF parsing for run sheets

## Routes
| Route | Purpose |
|---|---|
| `/` | Main dashboard — KPIs, line table, output chart, line drawer |
| `/eos` | End-of-shift report — CSV export + email draft |
| `/admin` | Admin — schedule queue (PDF upload), daily target, headcount per line |
| `/sim` | MES simulator — start/pause/reset, speed control, hourly table |
| `GET /api/metrics` | Returns `ShiftMetrics`; overlays admin target/headcount + MES scan output |
| `GET /api/mes/state` | Returns `LineState[]` for all lines |
| `POST /api/mes/schedule` | Load or queue a schedule (`mode: "replace" \| "queue"`) |
| `POST /api/mes/tick` | Emit N scan events (`all: true` or `lineId`) |
| `POST /api/mes/reset` | Clear all schedules and scan log |
| `GET/POST /api/admin/config` | Per-line target and headcount overrides |

## Folder layout
```
src/
  app/
    page.tsx              ← dashboard; polls /api/metrics every 5 s
    layout.tsx
    globals.css           ← Tailwind theme + custom CSS variables
    eos/page.tsx          ← EOS report
    admin/page.tsx        ← admin config page
    sim/page.tsx          ← MES simulator control panel
    api/
      metrics/route.ts    ← GET /api/metrics?shift=day|night
      mes/schedule/       ← POST
      mes/tick/           ← POST
      mes/state/          ← GET
      mes/reset/          ← POST
      admin/config/       ← GET + POST
  components/
    Header.tsx            ← shift selector, timestamp, EOS + Admin nav links
    ShiftSelector.tsx
    KpiCard.tsx
    LineTable.tsx         ← clickable rows fire onSelectLine(lineId)
    OutputChart.tsx       ← BarChart — output vs target per line
    LineDrawer.tsx        ← slide-out detail panel
    ExportButton.tsx
    eos/
      EOSLineCard.tsx
      EOSMetaForm.tsx
      EOSEmailPreview.tsx
    admin/
      AdminLineCard.tsx   ← PDF drop + pending preview + Replace/Queue buttons + target/HC inputs
    sim/
      LineSimCard.tsx
      SimControls.tsx
      HourlyTable.tsx
  lib/
    types.ts              ← ShiftName, Line, TimePoint, ShiftMetrics
    generateMetrics.ts    ← seeded mock data (Mulberry32 RNG)
    mesTypes.ts           ← RunSheetItem, LineSchedule, ScanEvent, LineState
    mesStore.ts           ← server-side singleton (globalThis); schedule queue, scan log, admin config
    pdfParser.ts          ← parseRunSheet(file, lineId) — handles VS1 and VS2 formats
    eosTypes.ts
    eosReports.ts
```

## Key types (`src/lib/types.ts`)
```ts
type ShiftName = "day" | "night"

interface Line {
  id: string;          // "vs1-l1", "vs2-l1", etc.
  name: string;        // "Line 1", "Line 2"
  valueStream: string; // "VS1" | "VS2"
  output: number;
  target: number;
  fpy: number;         // first-pass yield %, e.g. 94.7
  hpu: number;         // hours per unit, e.g. 0.42
  headcount: number;
  changeovers: number;
}

interface TimePoint {
  time: string;        // "06:00", "06:30" …
  vs1Output: number;   // cumulative VS1 output at this interval
  vs2Output: number;   // cumulative VS2 output at this interval
}

interface ShiftMetrics {
  shift: ShiftName;
  generatedAt: string; // ISO
  lines: Line[];       // 5 lines total (3 × VS1, 2 × VS2)
  trend: TimePoint[];  // 16 half-hour points per shift
}
```

## MES types (`src/lib/mesTypes.ts`)
```ts
interface RunSheetItem  { model: string; qty: number; completed: number; }
interface LineSchedule  { lineId: string; date: string; totalTarget: number; items: RunSheetItem[]; }
interface ScanEvent     { id: string; timestamp: string; lineId: string; shift: "day"|"night"; partNumber: string; }
interface LineState {
  lineId: string;
  schedule: LineSchedule | null;   // active (head of queue)
  totalOutput: number;
  currentOrder: string | null;     // first incomplete order; last order when sheet done
  remainingOnOrder: number;
  remainingOnRunSheet: number;
  completedOrders: number;         // → EOS changeovers field
  queuedCount: number;             // schedules waiting behind the active one
  hourlyOutput: Record<string, number>; // "07:00" → units that hour
}
```

## MES store (`src/lib/mesStore.ts`)
- Module-level singleton via `globalThis` — survives Next.js hot reloads; resets on cold start
- `queues: Record<lineId, LineSchedule[]>` — head is active; auto-advances when head completes
- `scanLog: ScanEvent[]` — append-only; 1 event = 1 finished unit
- `adminConfig: Record<lineId, { target?, headcount? }>` — overrides seeded mock values
- Key exports: `setSchedule`, `enqueueSchedule`, `tickLine`, `getLineState`, `getAllLineStates`, `getOutputForLine`, `setAdminConfig`, `getAllAdminConfig`, `resetAll`

## Run sheet PDF formats
Two formats in use — `pdfParser.ts` handles both:
- **VS1 (HFC):** `MODEL *MODEL* QTY …` e.g. `449324TS *449324TS* 40`
- **VS2 (HRC):** `*MODEL* MODEL QTY …` e.g. `*80120* 80120 12`
- Line number is NOT parsed from the PDF — it comes from whichever card the user dropped it on

## Data flow
1. `page.tsx` fetches `/api/metrics?shift=…` on mount and every **5 s** (silent — no loading flash).
2. `/api/metrics` runs `generateMetrics` (seeded mock), then overlays admin target/headcount, then MES scan output.
3. EOS page fetches both `/api/metrics` and `/api/mes/state` on mount and shift change — pre-fills output, headcount, orderAtPackout, remainingOnOrder, remainingOnRunSheet, changeovers.
4. Admin page: drop PDF → parse client-side → preview → Replace or Queue → `POST /api/mes/schedule`.
5. Sim page: Start → `setInterval` → `POST /api/mes/tick` every 1 s → polls `/api/mes/state` every 2 s.

## Colour system (Tailwind custom vars in `globals.css`)
| Variable | Hex | Tailwind class |
|---|---|---|
| `--color-background` | `#0a0d14` | `bg-background` |
| `--color-surface` | `#131720` | `bg-surface` |
| `--color-border` | `#1e2433` | `border-border` |
| `--color-accent` | `#f97316` | `bg-accent` / `text-accent` |
| `--color-vs1` | `#f97316` | orange |
| `--color-vs2` | `#1d9e75` | teal-green |
| `--color-status-green` | `#22c55e` | `text-status-green` |
| `--color-status-amber` | `#f59e0b` | `text-status-amber` |
| `--color-status-red` | `#ef4444` | `text-status-red` |

## Status colour thresholds
- **Output**: ≥ 90 % of target → green; ≥ 75 % → amber; < 75 % → red
- **FPY**: ≥ 95 % → green; ≥ 90 % → amber; < 90 % → red
- **HPU**: ≤ 0.35 → green; ≤ 0.45 → amber; > 0.45 → red
- **At-risk row** (LineTable): FPY < 90 AND output < target → red left border

## Card / panel styling convention
```tsx
<div className="bg-surface border border-border rounded-lg p-5">
```

## Recharts dark-theme tooltip convention
```tsx
<Tooltip
  cursor={{ fill: "rgba(255,255,255,0.03)" }}
  contentStyle={{ backgroundColor: "#131720", border: "1px solid #1e2433", borderRadius: "6px", fontSize: "12px" }}
  labelStyle={{ color: "#94a3b8" }}
  itemStyle={{ color: "#e2e8f0" }}
/>
```

## LineDrawer notes
- Slide-out panel triggered by clicking a row in `LineTable`.
- State lives in `page.tsx` (`selectedLineId` → resolved to `selectedLine: Line | null`).
- Uses `dynamic(() => import("@/components/LineDrawer"), { ssr: false })`.
- Closes via X button, backdrop click, or Escape key.
- Per-line time-series (output, FPY, HPU) is derived from the VS-aggregate `trend`
  using a Mulberry32 RNG seeded from the line's `id` string hash — deterministic
  across renders.
- Changeover markers are rendered as `<ReferenceLine>` on each chart.
- **Earmarked** for promotion to `/line/[id]` route in a future release.

## Mock data
`generateMetrics` uses Mulberry32 seeded by shift. Seeds: `day=1001`, `night=3003`.
Set `DEMO_SEED` env var to override for deterministic demos.

## Improvement backlog (prioritised)
### High
1. **Hour-by-hour in LineDrawer** — `hourlyOutput` from `LineState` is available but not shown in the drawer; add a bar chart or table below the existing trend charts
2. **Pace indicator** — show whether each line is ahead/behind pace for its daily target: `(output / elapsed_shift_hours) * total_shift_hours`; surface in KPI cards and LineDrawer
3. **Current order in LineDrawer** — show active model #, remaining on order, remaining on sheet when MES data exists
4. **Admin queue visibility** — list queued schedules (not just count); allow removing individual items

### Medium
5. **EOS "Refresh from MES" button** — re-pull MES state without changing shift
6. **Shift time remaining** — clock in header showing elapsed/remaining shift time; feeds pace calc
7. **At-risk pace highlighting** — lines behind pace turn amber/red in LineTable independent of static target %

### Lower
8. **Sim page cleanup** — admin owns PDF upload now; trim `/sim` to controls + hourly table only
9. **Admin queue management** — reorder or remove queued schedules
10. **Basic admin auth** — PIN or env-variable password gate on `/admin`
