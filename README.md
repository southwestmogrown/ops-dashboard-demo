# Ops Dashboard — RealTruck BAK Demo

A real-time manufacturing floor KPI dashboard built with Next.js, React, and Recharts. Designed as a portfolio case study demonstrating production-monitoring patterns for a high-throughput assembly environment.

**Live demo →** https://ops-dashboard-demo.vercel.app

---

## Case study context

BAK Industries (a RealTruck brand) manufactures retractable truck bed covers across multiple production lines grouped into two value streams — VS1 and VS2. Supervisors historically tracked shift performance in spreadsheets, making it difficult to spot at-risk lines in real time.

This dashboard simulates the monitoring layer that would replace that workflow:

- **At-risk detection** — lines where FPY drops below 90 % *and* output lags target are flagged with a red border before they miss shift goals.
- **Shift-level KPIs** — total output vs target, average first-pass yield, average hours-per-unit, and headcount are surfaced at a glance.
- **Per-line drill-down** — clicking any row opens a slide-out drawer with hourly output, FPY trend, and HPU trend charts, plus changeover markers.
- **CSV export** — supervisors can download a timestamped snapshot for shift handover reports.

Data is generated with a seedable pseudo-random function (Mulberry32) so the demo is deterministic and repeatable without a live data source.

---

## Local setup

**Prerequisites:** Node.js 18+ and npm.

```bash
# 1. Clone
git clone https://github.com/southwestmogrown/ops-dashboard-demo.git
cd ops-dashboard-demo

# 2. Install dependencies
npm install

# 3. (Optional) Set a fixed demo seed — see env vars below
cp .env.example .env.local

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard polls `/api/metrics` every 30 seconds and accepts a Day / Night shift toggle.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DEMO_SEED` | No | Integer seed that overrides the per-shift RNG seed. Locks in a specific data run across refreshes. Omit to use shift-default seeds (`day=1001`, `night=3003`). |

**Recommended production value:** `DEMO_SEED=7957`

Seed `7957` produces a visually varied dataset: VS1 Line 1 runs clean (≈ 98 % FPY), while the remaining four lines fall into at-risk territory with high changeover counts — a realistic scenario that exercises every status colour and alert in the UI.

To set this in Vercel: **Project → Settings → Environment Variables → Add** `DEMO_SEED` = `7957`, environment: Production.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Charts | Recharts 3 |
| Language | TypeScript 5 |
| Deploy | Vercel |

---

## Future features

- **Per-line routes (`/line/[id]`)** — the LineDrawer slide-out is earmarked for promotion to a dedicated route, enabling shareable deep-links to individual lines and per-line access control for value-stream leads.

- **Changeover tracking** — changeover counts are already surfaced in the table and drawer charts. A future release will capture start/end timestamps to enable MTCO (mean time for changeover) reporting and integration with the plant scheduling system.

- **Live data adapter** — the mock `generateMetrics` function will be replaced by a thin adapter connecting to the plant's MES (Manufacturing Execution System) via WebSocket for true real-time updates.

- **Role-based views** — supervisor, operator, and plant-manager permission tiers gating export, drill-down, and cross-value-stream visibility.
