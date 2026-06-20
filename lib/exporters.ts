"use client";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { INCIDENT_CODE_LABEL, INCIDENT_LABELS } from "./constants";
import { fmtDate, fmtInt, fmtNum, todayISO } from "./format";
import type { IncidentBucket, KpiResult, GroupSummary } from "./kpi";
import type { AppSettings, DailyWorkhour, Filters, Incident } from "./types";

export interface IncidentStatsPayload {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  periodBucket: IncidentBucket;
  cumBucket: IncidentBucket;
  daysWithoutLti: number;
  typeA: { code: string; label: string }[];
  typeB: { code: string; label: string }[];
  cumulativeIncidents: Incident[];
  top5: { name: string; value: number }[];
  settings: AppSettings;
}

function countCodes(incidents: Incident[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const i of incidents) if (i.type_code) m[i.type_code] = (m[i.type_code] || 0) + 1;
  return m;
}

const INDICATOR_ROWS: { key: keyof IncidentBucket; label: string }[] = [
  { key: "nearMiss", label: "Near Miss (NM)" },
  { key: "propertyDamage", label: "Property Damaged (PD)" },
  { key: "firstAid", label: "First Aid (FAC)" },
  { key: "medicalTreatment", label: "Medical Treatment (MTC)" },
  { key: "restrictedWork", label: "Restricted Work (RWC)" },
  { key: "recordable", label: "Recordable Incident" },
  { key: "lti", label: "Lost Time Injury (LTI)" },
  { key: "fatality", label: "Fatality" },
  { key: "lossOfConsciousness", label: "Loss of Consciousness" },
  { key: "wps", label: "Serious & Potentially Serious (WPS)" },
  { key: "total", label: "Total Incident" },
];

// ---------- Import template column headers ----------
export const IMPORT_HEADERS = [
  "Date",
  "Contractor Name",
  "Subcontractor Name",
  "Building / Area",
  "Work Type",
  "Main Activity",
  "Day Shift Manpower",
  "Night Shift Manpower",
  "Male",
  "Female",
  "Working Hours",
  "OT Hours",
  "High Risk (Yes/No)",
  "Remark",
  "Submitted By",
];

export interface ParsedImportRow {
  work_date: string;
  contractor_name: string;
  subcontractor_name: string;
  building_name: string;
  work_type_name: string;
  main_activity: string;
  day_shift_manpower: number;
  night_shift_manpower: number;
  male: number;
  female: number;
  working_hours: number;
  ot_hours: number;
  high_risk_activity: boolean;
  remark: string;
  submitted_by: string;
  _error?: string;
}

function saveBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------- Import template ----------
export function downloadImportTemplate(
  buildings: string[],
  workTypes: string[],
  contractors: string[],
) {
  const wb = XLSX.utils.book_new();

  const sample = [
    {
      Date: todayISO(),
      "Contractor Name": contractors[0] || "Main Contractor (GC)",
      "Subcontractor Name": "",
      "Building / Area": buildings[0] || "Building A",
      "Work Type": workTypes[0] || "Civil Work",
      "Main Activity": "Formwork & rebar - Level 1",
      "Day Shift Manpower": 25,
      "Night Shift Manpower": 5,
      Male: 28,
      Female: 2,
      "Working Hours": 10,
      "OT Hours": 2,
      "High Risk (Yes/No)": "No",
      Remark: "",
      "Submitted By": "",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sample, { header: IMPORT_HEADERS });
  ws["!cols"] = IMPORT_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Template");

  // Reference sheet with valid values
  const maxLen = Math.max(buildings.length, workTypes.length, contractors.length);
  const ref: Record<string, string>[] = [];
  for (let i = 0; i < maxLen; i++) {
    ref.push({
      "Valid Buildings / Areas": buildings[i] || "",
      "Valid Work Types": workTypes[i] || "",
      "Valid Contractors": contractors[i] || "",
    });
  }
  const wsRef = XLSX.utils.json_to_sheet(ref);
  wsRef["!cols"] = [{ wch: 26 }, { wch: 24 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsRef, "Reference");

  XLSX.writeFile(wb, `CTPA_Manhour_Import_Template_${todayISO()}.xlsx`);
}

// ---------- Parse an uploaded workbook ----------
const HEADER_MAP: Record<string, keyof ParsedImportRow> = {
  date: "work_date",
  "contractor name": "contractor_name",
  contractor: "contractor_name",
  "subcontractor name": "subcontractor_name",
  subcontractor: "subcontractor_name",
  "building / area": "building_name",
  "building/area": "building_name",
  building: "building_name",
  area: "building_name",
  "work type": "work_type_name",
  worktype: "work_type_name",
  "main activity": "main_activity",
  activity: "main_activity",
  "day shift manpower": "day_shift_manpower",
  "day shift": "day_shift_manpower",
  "night shift manpower": "night_shift_manpower",
  "night shift": "night_shift_manpower",
  male: "male",
  female: "female",
  "working hours": "working_hours",
  "ot hours": "ot_hours",
  ot: "ot_hours",
  "high risk (yes/no)": "high_risk_activity",
  "high risk": "high_risk_activity",
  remark: "remark",
  "submitted by": "submitted_by",
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function excelDateToISO(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = String(v).trim();
  // Already ISO-ish
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
      parsed.getDate(),
    ).padStart(2, "0")}`;
  }
  return s;
}

export async function parseImportWorkbook(file: File): Promise<ParsedImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  return json.map((raw) => {
    const row: ParsedImportRow = {
      work_date: "",
      contractor_name: "",
      subcontractor_name: "",
      building_name: "",
      work_type_name: "",
      main_activity: "",
      day_shift_manpower: 0,
      night_shift_manpower: 0,
      male: 0,
      female: 0,
      working_hours: 0,
      ot_hours: 0,
      high_risk_activity: false,
      remark: "",
      submitted_by: "",
    };
    for (const [k, v] of Object.entries(raw)) {
      const field = HEADER_MAP[k.trim().toLowerCase()];
      if (!field) continue;
      if (field === "work_date") row.work_date = excelDateToISO(v);
      else if (
        field === "day_shift_manpower" ||
        field === "night_shift_manpower" ||
        field === "male" ||
        field === "female" ||
        field === "working_hours" ||
        field === "ot_hours"
      )
        (row[field] as number) = toNum(v);
      else if (field === "high_risk_activity")
        row.high_risk_activity = /^(y|yes|true|1|high)/i.test(String(v).trim());
      else (row[field] as string) = String(v).trim();
    }
    if (!row.work_date) row._error = "ไม่มีวันที่ (Date)";
    else if (!row.contractor_name) row._error = "ไม่มีชื่อ Contractor";
    return row;
  });
}

// ---------- Excel export of current view ----------
export function exportWorkhoursExcel(
  rows: DailyWorkhour[],
  kpi: KpiResult,
  byContractor: GroupSummary[],
  byBuilding: GroupSummary[],
  byWorkType: GroupSummary[],
  settings: AppSettings,
  filters: Filters,
) {
  const wb = XLSX.utils.book_new();

  // KPI sheet
  const kpiRows: (string | number)[][] = [
    [settings.site_name],
    ["Safety KPI Summary"],
    [`Period: ${filters.dateFrom} to ${filters.dateTo}`],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    ["Metric", "Value"],
    ["Total Manpower (man-days)", kpi.totalManpower],
    ["Average Daily Manpower", kpi.avgDailyManpower],
    ["Peak Daily Manpower", kpi.peakDailyManpower],
    ["Total Working Hours (man-hours)", kpi.totalWorkingHours],
    ["Accumulative Working Hours", kpi.accumulativeManhours],
    ["Rolling Year Workhours", kpi.rollingYearManhours],
    ["Number of Safety Observations", kpi.observations],
    [`Observation Rate (per ${fmtInt(settings.observation_basis)} hrs)`, kpi.observationRate],
    ["First Aid Case", kpi.firstAid],
    ["Medical Treatment Case", kpi.medicalTreatment],
    ["Lost Time Injury", kpi.lostTimeInjury],
    ["Recordable Incident", kpi.recordable],
    ["Near Miss", kpi.nearMiss],
    ["TRIR", Number(kpi.trir.toFixed(3))],
    ["LTIR", Number(kpi.ltir.toFixed(3))],
    ["Days Without LTI", kpi.daysWithoutLti],
    ["High Risk Activities", kpi.highRiskActivities],
  ];
  const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
  wsKpi["!cols"] = [{ wch: 38 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsKpi, "KPI Summary");

  // Daily records
  const recs = rows.map((r) => ({
    Date: r.work_date,
    Contractor: r.contractor_name,
    Subcontractor: r.subcontractor_name || "",
    "Building / Area": r.building_name,
    "Work Type": r.work_type_name,
    "Main Activity": r.main_activity || "",
    "Day Shift": r.day_shift_manpower,
    "Night Shift": r.night_shift_manpower,
    Male: r.male,
    Female: r.female,
    "Total Manpower": r.total_manpower,
    "Working Hours": r.working_hours,
    "OT Hours": r.ot_hours,
    "Total Man-hours": r.total_manhours,
    "High Risk": r.high_risk_activity ? "Yes" : "No",
    Remark: r.remark || "",
    "Submitted By": r.submitted_by || "",
  }));
  const wsRecs = XLSX.utils.json_to_sheet(recs);
  wsRecs["!cols"] = Object.keys(recs[0] || { a: 1 }).map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, wsRecs, "Daily Records");

  // Summaries
  const summarySheet = (data: GroupSummary[], name: string) => {
    const s = data.map((g) => ({
      Name: g.label,
      "Total Manpower": g.manpower,
      "Total Man-hours": g.manhours,
      Records: g.records,
      "High Risk": g.highRisk,
      Incidents: g.incidents,
      Recordable: g.recordable,
    }));
    const ws = XLSX.utils.json_to_sheet(s.length ? s : [{ Name: "(no data)" }]);
    ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  summarySheet(byContractor, "By Contractor");
  summarySheet(byBuilding, "By Building");
  summarySheet(byWorkType, "By Work Type");

  XLSX.writeFile(wb, `CTPA_Manhour_Export_${todayISO()}.xlsx`);
}

// ---------- Weekly PDF Safety KPI report ----------
export function exportKpiPdf(
  kpi: KpiResult,
  byContractor: GroupSummary[],
  incidents: Incident[],
  settings: AppSettings,
  filters: Filters,
  generatedBy: string,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const green: [number, number, number] = [0, 204, 121];
  const dark: [number, number, number] = [15, 23, 42];

  // Header band
  doc.setFillColor(...green);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Weekly Safety KPI Report", 40, 32);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(settings.site_name, 40, 50);
  doc.text(`Period: ${fmtDate(filters.dateFrom)} – ${fmtDate(filters.dateTo)}`, 40, 62);

  doc.setTextColor(...dark);

  // KPI grid
  const kpiCells: [string, string][] = [
    ["Total Manpower (man-days)", fmtInt(kpi.totalManpower)],
    ["Total Working Hours", fmtInt(kpi.totalWorkingHours)],
    ["Accumulative Working Hours", fmtInt(kpi.accumulativeManhours)],
    ["Rolling Year Workhours", fmtInt(kpi.rollingYearManhours)],
    ["Safety Observations", fmtInt(kpi.observations)],
    [`Observation Rate /${fmtInt(settings.observation_basis)}`, fmtNum(kpi.observationRate)],
    ["First Aid Case", fmtInt(kpi.firstAid)],
    ["Medical Treatment", fmtInt(kpi.medicalTreatment)],
    ["Lost Time Injury", fmtInt(kpi.lostTimeInjury)],
    ["Recordable Incident", fmtInt(kpi.recordable)],
    ["Near Miss", fmtInt(kpi.nearMiss)],
    ["TRIR", fmtNum(kpi.trir, 2)],
    ["LTIR", fmtNum(kpi.ltir, 2)],
    ["Days Without LTI", fmtInt(kpi.daysWithoutLti)],
    ["High Risk Activities", fmtInt(kpi.highRiskActivities)],
  ];

  autoTable(doc, {
    startY: 90,
    head: [["Safety KPI", "Value", "Safety KPI", "Value"]],
    body: pairUp(kpiCells),
    theme: "grid",
    headStyles: { fillColor: green, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: {
      1: { halign: "right", fontStyle: "bold" },
      3: { halign: "right", fontStyle: "bold" },
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 22;

  // Contractor summary
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Contractor Summary", 40, y);
  autoTable(doc, {
    startY: y + 8,
    head: [["Contractor", "Manpower", "Man-hours", "High Risk", "Incidents", "Recordable"]],
    body: byContractor
      .slice(0, 18)
      .map((g) => [
        g.label,
        fmtInt(g.manpower),
        fmtInt(g.manhours),
        fmtInt(g.highRisk),
        fmtInt(g.incidents),
        fmtInt(g.recordable),
      ]),
    theme: "striped",
    headStyles: { fillColor: dark, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 22;

  // Incident log (if space) — start a new page if near bottom
  if (y > doc.internal.pageSize.getHeight() - 120) {
    doc.addPage();
    y = 50;
  }
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Incident Log", 40, y);
  autoTable(doc, {
    startY: y + 8,
    head: [["Date", "Type", "Contractor", "Description"]],
    body: incidents.length
      ? incidents
          .slice(0, 20)
          .map((i) => [
            i.incident_date,
            INCIDENT_LABELS[i.incident_type],
            i.contractor_name || "—",
            (i.description || "").slice(0, 60),
          ])
      : [["—", "No incidents in period", "—", "—"]],
    theme: "striped",
    headStyles: { fillColor: dark, textColor: 255 },
    styles: { fontSize: 8, cellPadding: 3 },
  });

  // Footer on each page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Generated by ${generatedBy} · ${new Date().toLocaleString()} · Page ${i}/${pages}`,
      40,
      doc.internal.pageSize.getHeight() - 20,
    );
  }

  doc.save(`CTPA_Weekly_Safety_KPI_${todayISO()}.pdf`);
}

function pairUp(cells: [string, string][]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const a = cells[i];
    const b = cells[i + 1] || ["", ""];
    out.push([a[0], a[1], b[0], b[1]]);
  }
  return out;
}

// ---------- Incidents & Events Statistics: Excel ----------
export function exportIncidentStatsExcel(p: IncidentStatsPayload) {
  const wb = XLSX.utils.book_new();

  const indRows: (string | number)[][] = [
    [p.settings.site_name],
    ["Incidents & Events Statistics"],
    [`Period: ${p.periodLabel} (${p.periodStart} → ${p.periodEnd})`],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    ["Indicator", "Last Period", "Cumulative To Date"],
    ...INDICATOR_ROWS.map((r) => [
      r.label,
      p.periodBucket[r.key] as number,
      p.cumBucket[r.key] as number,
    ]),
    [],
    ["TRIR (cumulative)", Number(p.cumBucket.trir.toFixed(3)), ""],
    ["LTIR (cumulative)", Number(p.cumBucket.ltir.toFixed(3)), ""],
    ["WPS Rate", Number(p.cumBucket.wpsRate.toFixed(3)), ""],
    ["Days Without LTI", p.daysWithoutLti, ""],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(indRows);
  ws1["!cols"] = [{ wch: 38 }, { wch: 16 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Indicators");

  const counts = countCodes(p.cumulativeIncidents);
  const typeSheet = (codes: { code: string; label: string }[], name: string) => {
    const data = codes.map((c) => ({
      Code: c.code,
      Type: c.label,
      "Project (CTP)": counts[c.code] || 0,
      Benchmark: p.settings.benchmarks[c.code] ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 10 }, { wch: 44 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  typeSheet(p.typeA, "Type A");
  typeSheet(p.typeB, "Type B");

  const log = p.cumulativeIncidents.map((i) => ({
    Date: i.incident_date,
    Severity: INCIDENT_LABELS[i.incident_type],
    Code: i.type_code || "",
    Contractor: i.contractor_name || "",
    Area: i.building_name || "",
    "Lost Days": i.lost_days,
    WPS: i.serious_potential ? "Yes" : "No",
    "Loss of Consc.": i.loss_of_consciousness ? "Yes" : "No",
    Description: i.description || "",
  }));
  const ws3 = XLSX.utils.json_to_sheet(log.length ? log : [{ Date: "(no incidents)" }]);
  XLSX.utils.book_append_sheet(wb, ws3, "Incident Log");

  XLSX.writeFile(wb, `CTPA_Incident_Statistics_${todayISO()}.xlsx`);
}

// ---------- Incidents & Events Statistics: PDF (Weekly EHS Report) ----------
export function exportIncidentStatsPdf(p: IncidentStatsPayload, generatedBy: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const green: [number, number, number] = [0, 204, 121];
  const dark: [number, number, number] = [15, 23, 42];

  doc.setFillColor(...green);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Weekly EHS Report — Incidents & Events", 40, 32);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(p.settings.site_name, 40, 50);
  doc.text(`${p.periodLabel}  (${p.periodStart} → ${p.periodEnd})`, 40, 62);
  doc.setTextColor(...dark);

  autoTable(doc, {
    startY: 90,
    head: [["Indicator", "Last Period", "Cumulative To Date"]],
    body: INDICATOR_ROWS.map((r) => [
      r.label,
      fmtInt(p.periodBucket[r.key] as number),
      fmtInt(p.cumBucket[r.key] as number),
    ]),
    theme: "grid",
    headStyles: { fillColor: green, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });
  let y = (doc as any).lastAutoTable.finalY + 14;

  autoTable(doc, {
    startY: y,
    head: [["TRIR", "LTIR", "WPS Rate", "Days Without LTI"]],
    body: [[fmtNum(p.cumBucket.trir, 2), fmtNum(p.cumBucket.ltir, 2), fmtNum(p.cumBucket.wpsRate, 2), fmtInt(p.daysWithoutLti)]],
    theme: "grid",
    headStyles: { fillColor: dark, textColor: 255 },
    styles: { fontSize: 10, halign: "center", cellPadding: 5 },
  });
  y = (doc as any).lastAutoTable.finalY + 18;

  const counts = countCodes(p.cumulativeIncidents);
  const typeBody = (codes: { code: string; label: string }[]) =>
    codes.map((c) => [c.code, c.label, fmtInt(counts[c.code] || 0), fmtInt(p.settings.benchmarks[c.code] ?? 0)]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Type A Incidents", 40, y);
  autoTable(doc, {
    startY: y + 6,
    head: [["Code", "Type", "Project", "Benchmark"]],
    body: typeBody(p.typeA),
    theme: "striped",
    headStyles: { fillColor: dark, textColor: 255 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 14;
  if (y > doc.internal.pageSize.getHeight() - 160) {
    doc.addPage();
    y = 50;
  }
  doc.setFont("helvetica", "bold");
  doc.text("Type B Incidents", 40, y);
  autoTable(doc, {
    startY: y + 6,
    head: [["Code", "Type", "Project", "Benchmark"]],
    body: typeBody(p.typeB),
    theme: "striped",
    headStyles: { fillColor: dark, textColor: 255 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Generated by ${generatedBy} · ${new Date().toLocaleString()} · Page ${i}/${pages}`,
      40,
      doc.internal.pageSize.getHeight() - 20,
    );
  }
  doc.save(`CTPA_Weekly_EHS_Report_${todayISO()}.pdf`);
}
