import type { EOSFormData, EOSLineDescriptor } from "./eosTypes";

export function calculateHPU(output: string, headcount: string, hoursWorked: string): string {
  const o = parseFloat(output);
  const h = parseFloat(headcount);
  const w = parseFloat(hoursWorked);
  if (isNaN(o) || isNaN(h) || isNaN(w) || o === 0) return "0";
  return ((h * w) / o).toFixed(2);
}

function generateEOSCSV(
  data: EOSFormData,
  activeLines: EOSLineDescriptor[],
): string {
  const headers = [
    "Line", "Output", "HPU", "Hours Worked",
    "Headcount", "Order at Packout", "Remaining on Order",
    "Remaining on Run Sheet", "Changeovers",
  ];
  const rows = activeLines.map(({ lineKey, line }) => {
    const l = data.lines[lineKey];
    return [
      line, l.output, l.hpu, l.hoursWorked,
      l.headcount, l.orderAtPackout, l.remainingOnOrder,
      l.remainingOnRunSheet, l.changeovers,
    ].join(",");
  });
  const meta = [
    "End of Shift Report",
    `Supervisor:,${data.supervisor}`,
    `Date:,${data.date}`,
    `Shift:,${data.shift}`,
    `Top Issue Today:,${data.notes.topIssueToday}`,
    `Resolved During Shift:,${data.notes.resolvedDuringShift}`,
    `Open Items Next Shift:,${data.notes.openItemsNextShift}`,
    `Equipment Concerns:,${data.notes.equipmentConcerns}`,
    `General Notes:,${data.notes.generalNotes}`,
    "",
  ];
  return [...meta, headers.join(","), ...rows].join("\n");
}

function generateLineStatusCSV(
  data: EOSFormData,
  activeLines: EOSLineDescriptor[],
): string {
  const headers = ["Line", "Value Stream", "Output", "Target", "HPU", "Headcount", "Hours Worked", "Changeovers"];
  const rows = activeLines.map(({ vsId, vsName, lineKey, line }) => {
    const l = data.lines[lineKey];
    const output = Number(l.output) || 0;
    const target = vsId === "vs1" ? 225 : 200;
    const pct = target > 0 ? Math.round((output / target) * 100) : 0;
    return [
      line, vsName, l.output || "—", target, l.hpu || "0",
      l.headcount || "—", l.hoursWorked || "8", l.changeovers || "0",
      `${pct}%`,
    ].join(",");
  });
  const meta = [
    "Line Status Summary",
    `Date:,${data.date}`,
    `Shift:,${data.shift}`,
    "",
  ];
  return [...meta, headers.join(","), ...rows].join("\n");
}

function generateLocalCSV(
  data: EOSFormData,
  activeLines: EOSLineDescriptor[],
): string {
  // Same as EOS for now
  return generateEOSCSV(data, activeLines);
}

function generatePrePostCSV(
  data: EOSFormData,
  activeLines: EOSLineDescriptor[],
): string {
  const headers = ["Line", "Output", "HPU", "Hours Worked", "Headcount", "Changeovers", "Remaining on Order", "Remaining on Run Sheet"];
  const rows = activeLines.map(({ lineKey, line }) => {
    const l = data.lines[lineKey];
    return [
      line, l.output || "—", l.hpu || "0", l.hoursWorked || "8",
      l.headcount || "—", l.changeovers || "0",
      l.remainingOnOrder || "—", l.remainingOnRunSheet || "—",
    ].join(",");
  });
  const meta = [
    "Pre-Post Shift Summary",
    `Date:,${data.date}`,
    `Shift:,${data.shift}`,
    `Supervisor:,${data.supervisor}`,
    "",
  ];
  return [...meta, headers.join(","), ...rows].join("\n");
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAllReports(data: EOSFormData, activeLines: EOSLineDescriptor[]): void {
  downloadCSV(generateEOSCSV(data, activeLines), `BAK_EOS_${data.date}_${data.shift}.csv`);
  downloadCSV(generateLineStatusCSV(data, activeLines), `BAK_LineStatus_${data.date}_${data.shift}.csv`);
  downloadCSV(generateLocalCSV(data, activeLines), `BAK_Local_${data.date}_${data.shift}.csv`);
  downloadCSV(generatePrePostCSV(data, activeLines), `BAK_PrePost_${data.date}_${data.shift}.csv`);
}

export function generateEmailBody(
  data: EOSFormData,
  activeLines: EOSLineDescriptor[],
  streamName: string,
): string {
  const lineRows = activeLines
    .map(({ vsName, line, lineKey }) => {
      const l = data.lines[lineKey];
      return `  ${line} (${vsName})
    Output: ${l.output || "—"}  |  HPU: ${l.hpu || "0"}
    Headcount: ${l.headcount || "—"}  |  Hours Worked: ${l.hoursWorked || "8"}  |  Changeovers: ${l.changeovers || "—"}
    Order @ Packout: ${l.orderAtPackout || "—"}  |  Remaining on Order: ${l.remainingOnOrder || "—"}  |  Remaining on Run Sheet: ${l.remainingOnRunSheet || "—"}`;
    })
    .join("\n\n");

  const { topIssueToday, resolvedDuringShift, openItemsNextShift, equipmentConcerns, generalNotes } = data.notes;

  const notesSections = [
    topIssueToday ? `• Top Issue Today: ${topIssueToday}` : null,
    resolvedDuringShift ? `• Resolved During Shift: ${resolvedDuringShift}` : null,
    openItemsNextShift ? `• Open Items for Next Shift: ${openItemsNextShift}` : null,
    equipmentConcerns ? `• Equipment Concerns: ${equipmentConcerns}` : null,
    generalNotes ? `• General Notes: ${generalNotes}` : null,
  ].filter(Boolean);

  const divider = "─".repeat(60);
  return `End of Shift Report (${streamName}) — ${data.shift} Shift | ${data.date}
Supervisor: ${data.supervisor}
${divider}

LINE STATUS SUMMARY

${lineRows}

${divider}
OPERATIONAL SUMMARY
${notesSections.length > 0 ? notesSections.join("\n") : "(no notes entered)"}

${divider}
Reports attached: EOS Report | Line Status | Local Report | Pre/Post Shift
Generated automatically by BAK EOS System`;
}
