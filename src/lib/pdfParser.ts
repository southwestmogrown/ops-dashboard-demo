/**
 * Client-side PDF run sheet parser.
 * Uses pdfjs-dist to extract text, then applies regex patterns matching
 * the standard BAK run sheet format.
 *
 * Run sheet format:
 *   Header row: "3/26/26  LINE 1  276"
 *   Data rows:  "449324TS *449324TS* 40  234S0139 ..."
 *               "MODEL_NUM *MODEL_NUM* QTY  ..."
 */
import type { LineSchedule, RunSheetItem } from "./mesTypes";

/** Map run sheet line numbers to dashboard lineIds */
const LINE_ID_MAP: Record<string, string> = {
  "1": "vs1-l1",
  "2": "vs1-l2",
  "3": "vs1-l3",
  "4": "vs1-l4",
};

// Pattern: model number repeated between asterisks, followed by quantity
// e.g.  "449324TS *449324TS* 40 234S0139 ..."
const DATA_ROW = /^([A-Z0-9]+)\s+\*\1\*\s+(\d+)/;

// Pattern: date, LINE N, total — e.g. "3/26/26 LINE 1 276"
const HEADER_ROW = /(\d+\/\d+\/\d+)\s+LINE\s+(\d+)\s+(\d+)/i;

async function loadPdfJs() {
  // Dynamic import keeps pdfjs out of the server bundle
  const pdfjsLib = await import("pdfjs-dist");
  // Point the worker at the bundled worker script
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
  return pdfjsLib;
}

async function extractText(file: File): Promise<string[]> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Each item.str is a text fragment; join by space within a page
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    lines.push(...pageText.split(/\n|\r\n/));
  }
  return lines;
}

export async function parseRunSheet(file: File, lineId?: string): Promise<LineSchedule> {
  const textLines = await extractText(file);
  // pdfjs often returns everything as one long string — split on whitespace runs
  const fullText = textLines.join(" ");

  // Find header
  const headerMatch = HEADER_ROW.exec(fullText);
  const rawDate = headerMatch?.[1] ?? "";
  const lineNumber = headerMatch?.[2] ?? "1";
  const resolvedLineId = lineId ?? LINE_ID_MAP[lineNumber] ?? `vs1-l${lineNumber}`;

  // Normalise date "3/26/26" → "2026-03-26"
  let date = new Date().toISOString().split("T")[0];
  if (rawDate) {
    const parts = rawDate.split("/");
    if (parts.length === 3) {
      const [m, d, y] = parts;
      const fullYear = y.length === 2 ? `20${y}` : y;
      date = `${fullYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  // Extract data rows — scan the full text for the repeating-model pattern
  // We look for sequences: MODELNUM *MODELNUM* QTY
  const items: RunSheetItem[] = [];
  const dataPattern = /([A-Z0-9]{4,})\s+\*\1\*\s+(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = dataPattern.exec(fullText)) !== null) {
    items.push({
      model: match[1],
      qty: parseInt(match[2], 10),
      completed: 0,
    });
  }

  const totalTarget = items.reduce((sum, it) => sum + it.qty, 0);

  return { lineId: resolvedLineId, date, totalTarget, items };
}
