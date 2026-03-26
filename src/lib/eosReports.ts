import type { EOSFormData, EOSLineDescriptor } from "./eosTypes";

export function calculateHPU(output: string, headcount: string, hoursWorked: string): string {
  const o = parseFloat(output);
  const h = parseFloat(headcount);
  const w = parseFloat(hoursWorked);
  if (isNaN(o) || isNaN(h) || isNaN(w) || o === 0) return "0";
  return ((h * w) / o).toFixed(2);
}

export function generateCSV(
  data: EOSFormData,
  title: string,
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
    title,
    `Supervisor:,${data.supervisor}`,
    `Date:,${data.date}`,
    `Shift:,${data.shift}`,
    `Notes:,${data.notes}`,
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
  const reports = [
    { title: "End of Shift Report",   suffix: "EOS" },
    { title: "Line Status Report",    suffix: "LineStatus" },
    { title: "Local Report",          suffix: "Local" },
    { title: "Pre-Post Shift Report", suffix: "PrePost" },
  ];
  reports.forEach(({ title, suffix }) => {
    const csv = generateCSV(data, title, activeLines);
    downloadCSV(csv, `BAK_${suffix}_${data.date}_${data.shift}.csv`);
  });
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
    Headcount: ${l.headcount || "—"}  |  Hours Worked: ${l.hoursWorked || "10"}  |  Changeovers: ${l.changeovers || "—"}
    Order @ Packout: ${l.orderAtPackout || "—"}  |  Remaining on Order: ${l.remainingOnOrder || "—"}  |  Remaining on Run Sheet: ${l.remainingOnRunSheet || "—"}`;
    })
    .join("\n\n");

  const divider = "─".repeat(60);
  return `End of Shift Report (${streamName}) — ${data.shift} Shift | ${data.date}
Supervisor: ${data.supervisor}
${divider}

LINE STATUS SUMMARY

${lineRows}

${divider}
NOTES:
${data.notes || "None"}

${divider}
Reports attached: EOS Report | Line Status | Local Report | Pre/Post Shift
Generated automatically by BAK EOS System`;
}
