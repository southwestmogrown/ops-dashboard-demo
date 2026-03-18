# ops-dashboard-demo — Claude context

## Project summary
A Next.js 16 (App Router) operations dashboard for a manufacturing floor. Displays production-line KPIs, a line table grouped by value stream, and an output chart. Refreshes every 30 seconds via a mock `/api/metrics` endpoint.

## Tech stack
- **Next.js 16 + React 19** (App Router, `"use client"` where needed)
- **TypeScript 5**
- **Tailwind CSS 4** — utility classes only, no CSS modules
- **Recharts 3** — all charts; must be dynamically imported (`ssr: false`)

## Folder layout
```
src/
  app/
    page.tsx          ← sole page; owns all top-level state
    layout.tsx
    globals.css       ← Tailwind theme + custom CSS variables
    api/metrics/
      route.ts        ← GET /api/metrics?shift=day|night
  components/
    Header.tsx        ← shift selector + last-updated timestamp
    ShiftSelector.tsx
    KpiCard.tsx
    LineTable.tsx     ← clickable rows fire onSelectLine(lineId)
    OutputChart.tsx   ← BarChart — output vs target per line
    LineDrawer.tsx    ← slide-out detail panel (opened by row click)
    ExportButton.tsx  ← placeholder
  lib/
    types.ts          ← ShiftName, Line, TimePoint, ShiftMetrics
    generateMetrics.ts← seeded mock data (Mulberry32 RNG)
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

## Data flow
1. `page.tsx` fetches `/api/metrics?shift=…` on mount and every 30 s.
2. Full `ShiftMetrics` stored in state; `lines` and `trend` passed to children.
3. `LineTable` fires `onSelectLine(id)` → `setSelectedLineId`.
4. `LineDrawer` receives `line: Line | null` and `trend: TimePoint[]`.

## Mock data
`generateMetrics` uses Mulberry32 seeded by shift. Seeds: `day=1001`, `night=3003`.
Set `DEMO_SEED` env var to override for deterministic demos.
