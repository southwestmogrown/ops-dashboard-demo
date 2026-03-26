/**
 * Client-side PDF run sheet parser.
 * Handles two BAK run sheet formats:
 *
 *   VS1 (HFC):  "449324TS *449324TS* 40  234S0139 ..."   MODEL first, then *MODEL*
 *   VS2 (HRC):  "*80120* 80120 12  234S0102 ..."         *MODEL* first, then MODEL
 *
 * Both formats have the model number repeated — that's the anchor for parsing.
 */
import type { LineSchedule, RunSheetItem } from "./mesTypes";

// VS1 format: MODEL *MODEL* QTY  e.g. "449324TS *449324TS* 40"
const VS1_PATTERN = /([A-Z0-9]{4,})\s+\*\1\*\s+(\d+)/g;

// VS2 format: *MODEL* MODEL QTY  e.g. "*80120* 80120 12"
const VS2_PATTERN = /\*([A-Z0-9]{4,})\*\s+\1\s+(\d+)/g;

// Date anywhere in the text — handles both "3/26/26" and "3/27/2026"
const DATE_PATTERN = /(\d{1,2}\/\d{1,2}\/\d{2,4})/;

async function loadPdfJs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
  return pdfjsLib;
}

async function extractText(file: File): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(pageText);
  }
  return parts.join(" ");
}

function normaliseDate(raw: string): string {
  const parts = raw.split("/");
  if (parts.length !== 3) return new Date().toISOString().split("T")[0];
  const [m, d, y] = parts;
  const fullYear = y.length === 2 ? `20${y}` : y;
  return `${fullYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function extractItems(fullText: string): RunSheetItem[] {
  const items: RunSheetItem[] = [];
  const seen = new Set<string>();

  function collect(pattern: RegExp) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(fullText)) !== null) {
      const model = match[1];
      const qty   = parseInt(match[2], 10);
      // Deduplicate — the same model shouldn't appear twice from both patterns
      const key = `${model}:${match.index}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ model, qty, completed: 0 });
      }
    }
  }

  collect(VS1_PATTERN);
  collect(VS2_PATTERN);

  // Sort by position in text to preserve run sheet order
  return items;
}

export async function parseRunSheet(file: File, lineId?: string): Promise<LineSchedule> {
  const fullText = await extractText(file);

  // Date
  const dateMatch = DATE_PATTERN.exec(fullText);
  const date = dateMatch ? normaliseDate(dateMatch[1]) : new Date().toISOString().split("T")[0];

  // lineId is always passed from the card the user dropped on — no need to parse it
  const resolvedLineId = lineId ?? "vs1-l1";

  const items = extractItems(fullText);
  const totalTarget = items.reduce((sum, it) => sum + it.qty, 0);

  return { lineId: resolvedLineId, date, totalTarget, items };
}
