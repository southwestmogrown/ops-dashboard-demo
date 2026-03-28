---
name: ops-dashboard-session-2026-03-28
description: First session — full codebase evaluation and M7 SQLite persistence
type: project
---

## Session: 2026-03-28

**Role reviewed as:** Production Shift Manager evaluating the BAK Ops Dashboard

### What happened
- Full codebase evaluation from a floor manager POV
- Identified 6 critical pain points, 9 bugs, ~10 missing operational features, UX issues
- Built M7 (SQLite persistence) — biggest blocker fixed
- Fixed all 9 bugs found during evaluation

### Key decisions made
- **FPY policy:** Scrapped panels do NOT count against FPY (caught before Final Inspection). Only `KickedLid` reduces FPY. This is intentional per site quality policy and is now documented in CLAUDE.md.
- **Storage:** SQLite via `better-sqlite3` chosen over other options. Data lives at `./data/ops.db`.
- **`AdminLineConfig` type:** lives in `mesTypes.ts` (shared between `db.ts` and `mesStore.ts`) to avoid circular imports.

### What was built
- `src/lib/db.ts` — full SQLite persistence layer
- `src/lib/mesStore.ts` — refactored to use db.ts write-through cache
- Bugs 1-9 all fixed (contrast violations, stale closure, dead code, type casts, middleware loop)
- `better-sqlite3` + `@types/better-sqlite3` installed
- `data/` added to `.gitignore`

### Outstanding priorities (from evaluation)
1. **M8: Downtime logging** — most important missing feature
2. **M9: Real-time alerts** — proactive banner for stalls/Fpy drops
3. **M10: OEE card** — availability × performance × quality
4. **M11: Shift handoff** — structured outgoing/incoming
5. **M12: EOS scrap auto-fill** — pull from scrap log into EOS form

### Code quirks to be aware of
- `simClock` uses a ref pattern in `Header.tsx` to avoid the stale-closure issue
- `AdminLineConfig` must be imported from `mesTypes.ts` — not `mesStore.ts`
- Middleware (`middleware.ts`) only protects `/admin`; `/team-lead` is open to all roles (client-side `AdminLayout` does further gating)
