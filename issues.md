# Code Review Issues

Generated from post-build code review. 10 issues across 7 files.

---

## Parallel Execution Plan

All 7 branches touch **different files** with no overlap — they can be opened and worked simultaneously.

```
Wave 1 (all parallel)
├── branch: fix/export-button-bugs         → issues #1 #2 #3  (ExportButton.tsx)
├── branch: fix/api-seed-nan-guard         → issue  #4         (route.ts)
├── branch: refactor/extract-rng-util      → issues #5 #9      (generateMetrics.ts + LineDrawer.tsx + new rng.ts)
├── branch: chore/remove-dead-code         → issue  #6         (page.tsx)
├── branch: refactor/line-table-component  → issue  #7         (LineTable.tsx)
├── branch: fix/shift-selector-name        → issue  #8         (ShiftSelector.tsx)
└── branch: chore/update-claude-md         → issue  #10        (CLAUDE.md)

Wave 2
└── Merge all into main (no conflicts expected)
```

Issues #5 and #9 are batched onto one branch because both modify `generateMetrics.ts` and the fix for #9 (extracting `rng.ts`) makes #5 (removing the orphaned call) a natural cleanup in the same pass.

---

## Issues

---

### Issue #1 — ExportButton download fails in Firefox

**Label:** `bug`
**File:** `src/components/ExportButton.tsx`
**Branch:** `fix/export-button-bugs`

#### Description

The anchor element used to trigger the CSV download is never appended to the DOM. Firefox requires the element to exist in the document tree to fire a download; Chrome does not. Any Firefox user clicking Export CSV receives no file.

#### Steps to reproduce

1. Open the dashboard in Firefox
2. Click **Export CSV**
3. No download is triggered

#### Fix

```ts
// Before
const a = document.createElement("a");
a.href = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);

// After
const a = document.createElement("a");
a.href = url;
a.download = filename;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
```

#### Acceptance criteria
- CSV download works in Firefox, Chrome, and Safari
- Anchor element is removed from the DOM after click

---

### Issue #2 — `revokeObjectURL` race condition produces empty downloads

**Label:** `bug`
**File:** `src/components/ExportButton.tsx`
**Branch:** `fix/export-button-bugs`

#### Description

`URL.revokeObjectURL(url)` is called synchronously immediately after `a.click()`. The click only schedules the download — the browser has not yet fetched the Blob URL when the URL is revoked. On slower machines or in certain Chromium builds this results in an empty or failed download.

#### Fix

```ts
// After click and DOM cleanup:
setTimeout(() => URL.revokeObjectURL(url), 100);
```

#### Acceptance criteria
- Downloaded file is never empty due to a revoked URL
- Blob URL is still cleaned up after the download initiates

---

### Issue #3 — CSV export does not quote string fields

**Label:** `bug`
**File:** `src/components/ExportButton.tsx`
**Branch:** `fix/export-button-bugs`

#### Description

`valueStream` and `name` fields are joined directly with commas and written to the CSV without quoting. If either field ever contains a comma, quote character, or newline the output will be malformed and parse incorrectly in Excel and Google Sheets. The current mock data is safe, but this violates the CSV spec and is a latent bug waiting on a data change.

#### Fix

```ts
const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

const rows = lines.map((l) =>
  [
    escape(l.valueStream),
    escape(l.name),
    l.output,
    l.target,
    l.fpy.toFixed(1),
    l.hpu.toFixed(2),
    l.headcount,
    l.changeovers,
  ].join(",")
);
```

#### Acceptance criteria
- All string fields are wrapped in double quotes
- Internal double-quote characters are escaped as `""`
- Output passes CSV validation and opens correctly in Excel and Google Sheets

---

### Issue #4 — Invalid `DEMO_SEED` silently corrupts the RNG

**Label:** `bug`
**File:** `src/app/api/metrics/route.ts`

**Branch:** `fix/api-seed-nan-guard`

#### Description

```ts
const overrideSeed = envSeed ? parseInt(envSeed, 10) : undefined;
```

If `DEMO_SEED` is set to a non-numeric string (typo, copy-paste error in Vercel), `parseInt` returns `NaN`. Because `NaN` is not `null` or `undefined`, the nullish coalescing operator `??` in `generateMetrics` does not fall back to the shift default — `createRng(NaN)` runs and silently produces a broken sequence. No error is logged and the response still returns 200 with corrupt data.

#### Fix

```ts
const parsed = envSeed ? parseInt(envSeed, 10) : NaN;
const overrideSeed = Number.isFinite(parsed) ? parsed : undefined;
```

#### Acceptance criteria
- A non-numeric `DEMO_SEED` falls back to the shift default seed
- No silent data corruption
- Behaviour is the same as omitting the variable entirely

---

### Issue #5 — Module-scope `generateMetrics("day")` call ships to production

**Label:** `bug`
**File:** `src/lib/generateMetrics.ts`
**Branch:** `refactor/extract-rng-util`

#### Description

```ts
generateMetrics("day"); // Example usage — generates metrics for the day shift
```

Line 103 calls `generateMetrics` at module scope with no guard. This runs on every import of the module — every API request in development, once per cold start in production. The comment acknowledges it was never intended to ship. It must be deleted.

#### Fix

Delete line 103.

#### Acceptance criteria
- `generateMetrics` is not called at module import time
- No change to exported API or runtime behaviour

---

### Issue #6 — Dead commented-out test data in `page.tsx`

**Label:** `chore`
**File:** `src/app/page.tsx`
**Branch:** `chore/remove-dead-code`

#### Description

Lines 42–58 contain a commented-out block of hardcoded test lines and derived summary values left over from before the real API was wired up. The comment says "replaced by real API data in Issue #9." The block adds cognitive overhead and creates a false impression that the hardcoded values are a fallback or alternative data source.

#### Fix

Delete lines 42–58 in their entirety.

#### Acceptance criteria
- No commented-out code remains in `page.tsx`
- Runtime behaviour is unchanged

---

### Issue #7 — `LineTable` copy-pastes identical JSX for VS1 and VS2

**Label:** `refactor`
**File:** `src/components/LineTable.tsx`
**Branch:** `refactor/line-table-component`

#### Description

The VS1 and VS2 sections are rendered by two near-identical `<table>` blocks. The only differences are the label string and the `filter` predicate. Any future change — a new column, updated at-risk logic, keyboard navigation, accessibility attributes — must be applied in two places. This is a DRY violation that will cause drift.

#### Fix

Extract a `ValueStreamSection` inner component:

```tsx
interface SectionProps {
  label: string;
  lines: Line[];
  onSelectLine: (id: string) => void;
  selectedLineId: string | null;
}

function ValueStreamSection({ label, lines, onSelectLine, selectedLineId }: SectionProps) {
  // single table implementation
}
```

Render as:
```tsx
<ValueStreamSection label="VS1" lines={lines.filter(l => l.valueStream === "VS1")} ... />
<ValueStreamSection label="VS2" lines={lines.filter(l => l.valueStream === "VS2")} ... />
```

#### Acceptance criteria
- VS1 and VS2 table rendering is backed by a single component
- Visual output is identical to the current implementation
- A change to row structure only requires editing one place

---

### Issue #8 — `ShiftSelector` component exported under the name `Header`

**Label:** `bug`
**File:** `src/components/ShiftSelector.tsx`
**Branch:** `fix/shift-selector-name`

#### Description

```ts
export default function Header({ value, onChange }: ShiftSelectorProps) {
```

The component is named `Header` but lives in `ShiftSelector.tsx` and renders shift toggle buttons. This mismatch surfaces in React DevTools, stack traces, and error boundaries — all of which will show `Header` instead of `ShiftSelector`, making debugging harder and confusing anyone reading the file for the first time.

#### Fix

```ts
export default function ShiftSelector({ value, onChange }: ShiftSelectorProps) {
```

#### Acceptance criteria
- Component function name matches the file name
- React DevTools displays `ShiftSelector` in the component tree
- No change to props, rendering, or behaviour

---

### Issue #9 — RNG utility duplicated across `generateMetrics.ts` and `LineDrawer.tsx`

**Label:** `refactor`
**File:** `src/lib/generateMetrics.ts`, `src/components/LineDrawer.tsx`
**Branch:** `refactor/extract-rng-util`

#### Description

`createRng` and `hashSeed` are copy-pasted verbatim into `LineDrawer.tsx` from `generateMetrics.ts`. The same Mulberry32 algorithm now exists in two files. If the RNG implementation ever needs to change — different distribution, seeding strategy, or a bug fix — it must be updated in both places and the risk of divergence is real.

#### Fix

Create `src/lib/rng.ts`:

```ts
export function createRng(seed: number): () => number { ... }
export function hashSeed(str: string): number { ... }
```

Import in both `generateMetrics.ts` and `LineDrawer.tsx`. Delete the local copies.

#### Acceptance criteria
- `createRng` and `hashSeed` exist in exactly one place
- Both `generateMetrics` and `LineDrawer` import from `src/lib/rng.ts`
- Generated values are identical to before (same algorithm, same seeds)

---

### Issue #10 — `CLAUDE.md` documents `ExportButton` as a placeholder

**Label:** `chore`
**File:** `CLAUDE.md`
**Branch:** `chore/update-claude-md`

#### Description

```
ExportButton.tsx  ← placeholder
```

`ExportButton` is now a full implementation accepting `lines: Line[]` and `shift: ShiftName`, generating a quoted CSV, and triggering a Blob download. The "placeholder" label in `CLAUDE.md` will mislead future agents or developers reading the file for context.

#### Fix

Update the `ExportButton.tsx` entry in the folder layout section and add a note in the data flow or export section describing its props and behaviour.

#### Acceptance criteria
- `CLAUDE.md` accurately reflects `ExportButton`'s current interface and responsibility
- No component in the folder layout is described as a placeholder unless it actually is one
