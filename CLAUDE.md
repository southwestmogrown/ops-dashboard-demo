# ops-dashboard-demo — Claude context

## Project summary
A Next.js 16 (App Router) operations dashboard for a manufacturing floor. Displays production-line KPIs, a line table grouped by value stream, and an output chart. Includes an EOS (end-of-shift) report generator, an admin page for schedule/target/headcount configuration, and a MES simulator that drives live output numbers from PDF run sheets.

## Tech stack
- **Next.js 16 + React 19** (App Router, `"use client"` where needed)
- **TypeScript 5**
- **Tailwind CSS 4** — utility classes only, no CSS modules
- **Recharts 3** — all charts; must be dynamically imported (`ssr: false`)
- **pdfjs-dist** — client-side PDF parsing for run sheets
- **better-sqlite3** — SQLite persistence for all MES state; survives cold starts and hot reloads

## Routes
| Route | Purpose |
|---|---|
| `/` | Main dashboard — KPIs, line table, output chart, line drawer |
| `/eos` | End-of-shift report — CSV export + email draft |
| `/admin` | Admin — schedule queue (PDF upload), daily target, headcount per line |
| `/team-lead` | Team lead — line selector, per-line hourly table with comments |
| `/sim` | MES simulator — start/pause/reset, speed control, line cards, hourly table |
| `GET /api/metrics` | Returns `ShiftMetrics`; overlays admin target/headcount + MES scan output |
| `GET /api/mes/state` | Returns `LineState[]` for all lines |
| `POST /api/mes/schedule` | Load or queue a schedule (`mode: "replace" \| "queue"`) |
| `POST /api/mes/tick` | Emit N scan events (`all: true` or `lineId`) |
| `POST /api/mes/reset` | Clear all schedules and scan log |
| `GET/POST /api/admin/config` | Per-line target and headcount overrides |
| `GET/POST /api/line/comments` | Per-line per-hour comment text (hour key = "HH:00") |
| `GET/POST /api/scrap` | Scrap/s rework entries: GET by lineId+shift, POST to log scrapped panel or kicked lid |

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
    team-lead/page.tsx   ← Team lead view — line selector + hourly table + comments
    api/
      metrics/route.ts    ← GET /api/metrics?shift=day|night
      mes/schedule/       ← POST
      mes/tick/           ← POST
      mes/state/          ← GET
      mes/reset/          ← POST
      admin/config/       ← GET + POST
      scrap/route.ts     ← GET + POST
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
      LineSimCard.tsx     ← (legacy; line cards now inline in sim/page.tsx)
      HourlyTable.tsx
    team-lead/
      LineSelector.tsx     ← (legacy; line selector now inline in team-lead/page.tsx sidebar)
      LineDetailCard.tsx   ← KPI strip + order strip + hourly table + rework panel
      HourlyTable.tsx     ← per-hour planned/actual/variance + comment inputs
      ScrapForm.tsx        ← modal for logging scrapped panels and kicked lids
      ReworkPanel.tsx      ← collapsible rework log with entry list
  lib/
    types.ts              ← ShiftName, Line, TimePoint, ShiftMetrics
    generateMetrics.ts    ← seeded mock data (Mulberry32 RNG) + getDefaultTarget + getDefaultHeadcount
    mesTypes.ts           ← RunSheetItem, LineSchedule, ScanEvent, LineState, LineComments, AdminLineConfig
    mesStore.ts           ← server-side store; in-memory cache + write-through to SQLite via db.ts
    db.ts                 ← SQLite persistence layer; all state persisted to data/ops.db
    pdfParser.ts          ← parseRunSheet(file, lineId) — handles VS1 and VS2 formats
    shiftTime.ts          ← getShiftProgress, getShiftWindows, ShiftWindow, ShiftProgress
    shiftBreaks.ts        ← getHourlyTargets, HourlyTargetRow — proportional planned targets accounting for breaks
    eosTypes.ts
    eosReports.ts
    reworkTypes.ts        ← ScrapEntry (ScrappedPanel | KickedLid), ScrapStats, PANEL_OPTIONS, DAMAGE_TYPES
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
  hpu: number;          // hours per unit, derived: (headcount × elapsedHours) / output; 0 when no output
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
  lines: Line[];       // 6 lines (4 × VS1/folding, 2 × VS2/revolver); vs1-l4 added
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
  skippedItems: RunSheetItem[];    // temporarily skipped orders (material shortage)
  queue: LineSchedule[];           // queued schedules behind the active one
}
type LineComments = Record<string, string>; // hour → comment
```

## MES store (`src/lib/mesStore.ts`)
- In-memory cache + write-through to SQLite via `db.ts` — survives cold starts and hot reloads
- `ensureInit()` loads full state from `data/ops.db` on first use; all mutations persist immediately
- `queues: Record<lineId, LineSchedule[]>` — head is active; auto-advances when head completes
- `scanLog: ScanEvent[]` — append-only; 1 event = 1 finished unit
- `adminConfig: Record<lineId, AdminLineConfig>` — overrides seeded mock values; `isRunning=false` hides line from dashboard
- `comments: Record<lineId, LineComments>` — per-line per-hour comment text
- `scrapLog: ScrapEntry[]` — scrap/rework log; `ScrappedPanel` (no FPY impact, caught before Final Inspection) and `KickedLid` (reduces FPY)
- Key exports: `setSchedule`, `enqueueSchedule`, `tickLine`, `getLineState`, `getAllLineStates`, `getOutputForLine`, `setAdminConfig`, `getAllAdminConfig`, `addScrapEntry`, `getScrapEntries`, `getScrapStats`, `getKickedLidsForLineShift`, `resetAll`
- `getDefaultHeadcount(lineId)` from `generateMetrics.ts`: VS1/folding = 45, VS2/revolver = 40
- `getDefaultTarget(lineId)` from `generateMetrics.ts`: VS1/folding = 225, VS2/revolver = 200

## SQLite DB (`src/lib/db.ts`)
- DB file: `./data/ops.db` (auto-created; `./data/` dir created on first import)
- WAL journal mode; foreign keys enforced
- Tables: `scan_events`, `line_queues`, `admin_config`, `line_comments`, `scrap_log`, `sim_clock`, `db_meta`
- `dbResetAll()` clears all tables + resets serials; called by `mesStore.resetAll()`
- `AdminLineConfig` type lives in `mesTypes.ts` (shared between `db.ts` and `mesStore.ts`)

## Run sheet PDF formats
Two formats in use — `pdfParser.ts` handles both:
- **VS1 (HFC):** `MODEL *MODEL* QTY …` e.g. `449324TS *449324TS* 40`
- **VS2 (HRC):** `*MODEL* MODEL QTY …` e.g. `*80120* 80120 12`
- Line number is NOT parsed from the PDF — it comes from whichever card the user dropped it on

## Data flow
1. `page.tsx` fetches `/api/metrics?shift=…` on mount and every **5 s** (silent — no loading flash).
2. `/api/metrics` runs `generateMetrics` (seeded mock), then overlays default target by line type (VS1=225, VS2=200) and default headcount (VS1=45, VS2=40) via `getDefaultTarget`/`getDefaultHeadcount`, then admin overrides (nullish coalescing), then MES scan output, then derives FPY from scrap log and HPU from elapsed hours:
   - **`FPY = ((output − kickedLids) / output) * 100`** — only `KickedLid` entries count against FPY. Scrapped panels caught before Final Inspection do not reduce FPY (per site quality policy).
   - `HPU = (headcount × elapsedHours) / output` (falls back to `0` when output is 0)
3. EOS page fetches both `/api/metrics` and `/api/mes/state` on mount and shift change — pre-fills output, headcount, orderAtPackout, remainingOnOrder, remainingOnRunSheet, changeovers. Lines without a MES schedule are automatically hidden.
4. Admin page: drop PDF → parse client-side → preview → Replace or Queue → `POST /api/mes/schedule`.
5. Sim page: Start → `setInterval` → `POST /api/mes/tick` every 1 s → polls `/api/mes/state` every 2 s. Tick includes ~20% per-line downtime and ~5% random `KickedLid` injection.

## Colour system (Tailwind custom vars in `globals.css`)
| Variable | Hex | Tailwind class |
|---|---|---|
| `--color-background` | `#0a0d14` | `bg-background` |
| `--color-surface` | `#131720` | `bg-surface` |
| `--color-surface-low` | `#0e1118` | `bg-surface-low` |
| `--color-surface-high` | `#181e2d` | `bg-surface-high` |
| `--color-surface-highest` | `#1c2235` | `bg-surface-highest` |
| `--color-border` | `#1e2433` | `border-border` |
| `--color-accent` | `#f97316` | `bg-accent` / `text-accent` |
| `--color-accent-muted` | `#c45d0d` | `bg-accent-muted` |
| `--color-vs1` | `#f97316` | orange |
| `--color-vs2` | `#1d9e75` | teal-green |
| `--color-status-green` | `#22c55e` | `text-status-green` |
| `--color-status-amber` | `#f59e0b` | `text-status-amber` |
| `--color-status-red` | `#ef4444` | `text-status-red` |

## Status colour thresholds
- **Output**: ≥ 90 % of target → green; ≥ 75 % → amber; < 75 % → red
- **FPY**: ≥ 95 % → green; ≥ 90 % → amber; < 90 % → red
- **HPU**: ≤ 0.35 → green; ≤ 0.45 → amber; > 0.45 → red
- **At-risk row** (LineTable): status pill (ON TRACK / WATCH / CRITICAL / SCHEDULE NEEDED) replaces the old red left border indicator; no schedule → gray SCHEDULE NEEDED pill; dormant lines hidden via admin "Not Running" toggle

## Design system — "Kinetic Command" (Stitch handoff)

### Theme
Dark industrial. Fonts: **Space Grotesk** (headings, large numerics) + **Inter** (body, labels, data).
Icons: Material Symbols Outlined (loaded via Google Fonts CDN in `layout.tsx`).

### Sidebar navigation (per-route, inlined)
Each page renders its own sidebar with nav items as `<Link>` components. Active state is determined by `usePathname()` — accent border + color when `pathname === href`. Nav items:
- **Dashboard** → `/` — active when on `/`
- **Admin** → `/admin` — active when on `/admin`
- **Inventory / Quality Control / Maintenance** — muted "Coming Soon" placeholders (`text-[#e1e2ec]/15`, `cursor-not-allowed`)

The sidebar also has a non-functional Emergency Stop button (red, disabled) and Support/Logs placeholders at the bottom.
> Note: The E-STOP was removed from the sidebar as part of M13. Inventory, Quality Control, and Maintenance nav items are disabled placeholders ("Coming Soon") — they are present in the design for future expansion and do not redirect anywhere.

### Card / panel styling convention
```tsx
// Standard card (surface)
<div className="bg-surface hover:bg-surface-high transition-colors relative overflow-hidden">
  <div className="absolute top-0 left-0 w-full h-[2px] bg-accent" /> {/* status bar */}
  <div className="p-5">...</div>
</div>

// Section panel (surface-low with left accent border)
<div className="bg-surface-low p-6 border-l-2 border-accent/30">...</div>

// Glass panel (email preview, drawers)
<div className="glass-panel p-px rounded-sm">
  <div className="bg-background p-6">...</div>
</div>
```

### Typography patterns
```tsx
// Section heading
<h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold tracking-tight uppercase">

// Micro label
<p className="text-[10px] text-[#e1e2ec]/40 uppercase font-bold tracking-widest">

// Large metric
<p className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tabular-nums">

// Status badge
<span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[9px] font-bold border uppercase">
```

### Input convention (forms)
```tsx
<input className="w-full bg-surface-highest border-none rounded-sm px-3.5 py-2.5 text-[#e1e2ec] text-sm outline-none font-mono focus:ring-1 focus:ring-accent/40 placeholder:text-[#e1e2ec]/20" />
```

### Recharts dark-theme tooltip convention
```tsx
<Tooltip
  cursor={{ fill: "rgba(255,255,255,0.03)" }}
  contentStyle={{ backgroundColor: "#131720", border: "1px solid #1e2433", borderRadius: "6px", fontSize: "12px" }}
  labelStyle={{ color: "#94a3b8" }}
  itemStyle={{ color: "#e2e8f0" }}
/>
```

## Route-specific design notes

### `/` Dashboard (✅ Stitch redesign applied)
- h-screen flex layout, sidebar + main
- Top: 3 KPI cards (output, FPY, HPU) with left accent bars and progress indicators
- Middle: OutputChart section with VS1/VS2 legend
- Bottom: LineTable — grouped by value stream, rows with progress bars and status pills
- LineDrawer: glass-panel slide-out, triggered by row click

### `/eos` EOS Report (✅ Stitch redesign applied)
- Page header: border-l-4 accent, title + dynamic meta display (date, shift, supervisor) + CSV/Email action buttons
- Two-column layout: xl:grid-cols-12 (8 left / 4 right)
- Left: EOSMetaForm (teal accent section) → Operational Summary textarea (accent border) → VS tabs → EOSLineCard grid
- Right: EOSEmailPreview (glass panel, sticky, always visible — no toggle view)
- EOSLineCard: top 2px status bar, 5-col summary grid, expandable edit fields below

### `/admin` (✅ Stitch redesign applied)
- Bento grid layout, AdminLineCard (2-col: dropzone+config | runsheet preview)
- Master controls, toggle switch for Not Running
- Per-line target/headcount inputs
- **PDF upload UX**: `AdminLineCard` stores parsed schedule in local `pendingSchedule` state and shows the RunSheet Preview immediately — no waiting for the API round-trip. The preview clears when the server confirms via the next `refresh()` poll cycle.

### `/team-lead` (✅ Stitch redesign applied)
- Sidebar contains line selector (filter input + line list with status badges: RUNNING/BEHIND/STOPPED/IDLE)
- Main: empty state when no line selected, LineDetailCard when selected
- LineDetailCard: 12-col grid, KPI strip, order progress bar, Scrap & Quality panel, HourlyTable
- HourlyTable: planned/actual/variance columns, break rows with diagonal stripes, comment inputs with 500ms debounce
- ScrapForm modal: kind toggle (scrapped-panel / kicked-lid), panel grid selector, conditional fields
- ReworkPanel: collapsible log with SC (red) / KL (amber) badges

### `/sim` (✅ Stitch redesign applied)
- Simulator Control Bar (left 7 cols): Start/Pause/Reset with Material icons, speed toggle buttons (1×/5×/15×), shift selector, sim clock display
- Status Bento (right 5 cols): Efficiency % with progress bar, Total Output, active lines count
- Assembly Line Cards: 2-col grid, progress bars, status indicators (Nominal/Behind/Complete), current order display
- Hourly Output Summary: restyled HourlyTable with column/row totals, accent-colored grand total
- Hourly Production Bars (right column): per-hour horizontal bars with completion labels
- Simulation Info Card: glass panel with speed/tick details
- Admin Panel quick-link card

#### Sim production rate
- `POST /api/mes/tick` fires every 1 second (real time)
- `units` scales with speed: `Math.max(1, Math.round(speed / 60))` — 1 at 1×, 5 at 5×, 15 at 15×
- Each line has **20% random downtime per tick** — simulates breaks, changeovers, stoppages
- Expected production per line at 1×: ~26 units/hr (realistic for this floor)
- **Random kicked panel injection**: ~5% probability per tick, picks a random active line, writes a `KickedLid` scrap entry directly (auditorInitials = "SYS"). This keeps FPY data populated without manual entry.
- **Efficiency KPI**: `(totalOutput / totalTarget) * 100` — output ÷ daily target as a percentage. Not OEE (no availability or quality factor). A proper OEE card belongs in M10.

## LineDrawer notes
- Slide-out panel triggered by clicking a row in `LineTable`.
- State lives in `page.tsx` (`selectedLineId` → resolved to `selectedLine: Line | null`).
- Uses `dynamic(() => import("@/components/LineDrawer"), { ssr: false })`.
- Closes via X button, backdrop click, or Escape key.
- **No mock data** — charts default to empty. Hourly Output chart only renders from real `mesState.hourlyOutput`. FPY/HPU trend charts are placeholders ("coming soon") since MES has no per-interval FPY/HPU source.
- Empty state message: "Start the simulator to see live production data."
- **Earmarked** for promotion to `/line/[id]` route in a future release.

## Mock data
`generateMetrics` uses Mulberry32 seeded by shift. Seeds: `day=1001`, `night=3003`.
Set `DEMO_SEED` env var to override for deterministic demos.

## Improvement backlog (prioritised)

Full feature specs live in **`issues.md`**. Items marked ✅ are complete.

### Completed
- **M8: Downtime / Line Stop logging** ✅ — `DowntimePanel`, `DowntimeForm`, API route, wiring into team-lead page and status reasons; see `issues.md` M8
- **M9: Real-Time Alerts** ✅ — `AlertBanner` on dashboard, stall/FPY/pace detection in metrics route, acknowledge/dismiss UX; see `issues.md` M9
- **M10: OEE Tracking** ✅ — OEE = A × P × Q computed per line, avg OEE KPI card, OEE column in LineTable, OEE tab in LineDrawer; see `issues.md` M10
- **M11: Shift Handoff** ✅ — structured handoff on EOS page, `HandoffBanner` on dashboard for incoming shift acknowledgement; see `issues.md` M11
- **M12: EOS Scrap Auto-Fill** ✅ — scrap counts auto-populated into EOS form, Quality Summary table on EOS; see `issues.md` M12
- **M13: Dashboard Floor Awareness** ✅ — shift clock in sidebar, trend chart in main panel, VS highlighting, E-STOP removed, disabled nav placeholders explained
- **M14: EOS Draft Persistence & Form Structure** ✅ — localStorage draft auto-save, structured notes fields, configurable email recipient
- **M15: Team Lead Floor Overview + Scrap Speed** ✅ — floor overview grid with live KPIs, quick-log scrap form, comment save feedback toast, floor alert strip
- **M16: LineTable Readability + LineDrawer Completion** ✅ — sortable columns, wider progress bars, dynamic status label, downtime tab in drawer, target reference line on chart, operator contact field
- **M17: Simulation Fidelity** ✅ — tick rate fix, changeover penalty on completed orders, multi-defect scrap model, ramp-up/wind-down, equipment failure injection
### Technical Debt & Refactoring (Adversarial Review Results)

Comprehensive code review identified 7 key waste/redundancy issues. See detailed specs in **`issues.md` M18–M24**.

- **M18: API Route Authentication Middleware** ✅ COMPLETE (2026-03-31) — Server-side cookie-role guards added for sensitive mutation routes and operational logging routes (`schedule`, `reset`, `queue`, `config`, `tick`, `scrap`, `downtime`, `comments`).

- **M19: Navigation Component Consolidation** ✅ COMPLETE (2026-03-31) — Extracted reusable `SidebarNav` component and replaced duplicated sidebar markup across dashboard, admin, EOS, and sim pages.

- **M20: Role-Check Logic Extraction** ✅ COMPLETE (2026-03-31) — Extracted shared `useRedirectTeamLead()` hook and replaced duplicated redirect logic in 4 pages; middleware coverage extended to `/eos/*` and `/sim/*`.

- **M21: API Fetch Deduplication & Caching** ✅ COMPLETE (2026-03-31, Option B) — Added React Query app provider + shared query keys/fetchers, migrated high-traffic reads across dashboard/sim/admin/team-lead/EOS, converted team-lead comment save to invalidate queries, and removed temporary `clientFetchCache.ts`.

- **M22: Type Definition Organization** ✅ COMPLETE (2026-04-01) — Consolidated canonical type modules under `src/lib/types/` (`core`, `mes`, `eos`, `quality`, `downtime`, `auth`) and migrated imports; kept legacy files as compatibility re-export shims.

- **M23: Tailwind CSS Abstraction** 🟢 LOW — Repeated class patterns (nav-link 8×, card-base 50×, micro-label 15×). Add @apply rules to `globals.css` to save ~150 class strings.

- **M24: Dynamic Import Audit** 🟢 NICE-TO-HAVE — 8 dynamic imports; verify each truly needs SSR exclusion. Remove 2-3 unnecessary imports if found.

**Priority order for implementation:**
1. M22–M24 (housekeeping) — low priority, do when refactoring that area


### Remaining
- **Bought-in ERP integration** — `boughtIn` boolean on scrap entries; future route queries external ERP for model# lookup and auto-tags entries
- **Admin queue reordering** — drag to reorder queued schedules
- **Per-operator performance** — anonymous or named operator-level output visibility for coaching (sensitive — needs role guard)
- **Historical trend view** — compare current shift pace to same point on prior shifts
