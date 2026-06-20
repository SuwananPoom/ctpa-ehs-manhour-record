"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Upload,
  CheckCircle2,
  Presentation,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabaseClient";
import {
  computeKpi,
  filterIncidents,
  filterWorkhours,
  groupBy,
} from "@/lib/kpi";
import type { ParsedImportRow } from "@/lib/exporters";
import { fmtInt } from "@/lib/format";
import { Badge, Empty, Modal, Section, useToast } from "@/components/ui";
import { logAudit } from "@/lib/audit";

export default function ImportExport() {
  const {
    workhours,
    incidents,
    observationCount,
    globals,
    settings,
    filters,
    contractors,
    buildings,
    workTypes,
    perms,
    session,
    refresh,
    refreshMaster,
  } = useApp();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedImportRow[] | null>(null);
  const [preview, setPreview] = useState(false);
  const [importing, setImporting] = useState(false);

  const rows = useMemo(() => filterWorkhours(workhours, filters), [workhours, filters]);
  const inc = useMemo(() => filterIncidents(incidents, filters), [incidents, filters]);
  const kpi = useMemo(
    () => computeKpi(rows, inc, observationCount, globals, settings, filters.shift),
    [rows, inc, observationCount, globals, settings, filters.shift],
  );
  const byContractor = useMemo(() => groupBy(rows, inc, filters.shift, "contractor"), [rows, inc, filters.shift]);
  const byBuilding = useMemo(() => groupBy(rows, inc, filters.shift, "building"), [rows, inc, filters.shift]);
  const byWorkType = useMemo(() => groupBy(rows, inc, filters.shift, "worktype"), [rows, inc, filters.shift]);

  async function doExcel() {
    if (rows.length === 0) return toast("ไม่มีข้อมูลให้ export ในช่วงที่เลือก", "error");
    const { exportWorkhoursExcel } = await import("@/lib/exporters");
    exportWorkhoursExcel(rows, kpi, byContractor, byBuilding, byWorkType, settings, filters);
    logAudit(session, "EXPORT", "excel", null, `${rows.length} rows`);
    toast("Export Excel สำเร็จ");
  }

  async function doPdf() {
    const { exportKpiPdf } = await import("@/lib/exporters");
    exportKpiPdf(kpi, byContractor, inc, settings, filters, session?.name || "EHS");
    logAudit(session, "EXPORT", "pdf", null, "weekly KPI");
    toast("Export PDF สำเร็จ");
  }

  async function doTemplate() {
    const { downloadImportTemplate } = await import("@/lib/exporters");
    downloadImportTemplate(
      buildings.map((b) => b.name),
      workTypes.map((w) => w.name),
      contractors.map((c) => c.name),
    );
    toast("ดาวน์โหลด template แล้ว");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { parseImportWorkbook } = await import("@/lib/exporters");
      const data = await parseImportWorkbook(file);
      setParsed(data);
      setPreview(true);
    } catch (err: any) {
      toast(err?.message || "อ่านไฟล์ไม่สำเร็จ", "error");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function commitImport() {
    if (!parsed) return;
    const valid = parsed.filter((r) => !r._error);
    if (valid.length === 0) return toast("ไม่มีแถวที่นำเข้าได้", "error");
    setImporting(true);
    try {
      // Resolve / auto-create contractors by name
      const cMap = new Map(contractors.map((c) => [c.name.toLowerCase(), c]));
      const newNames = Array.from(
        new Set(valid.map((r) => r.contractor_name).filter((n) => n && !cMap.has(n.toLowerCase()))),
      );
      if (newNames.length) {
        const { data: created } = await supabase
          .from("mh_contractors")
          .insert(newNames.map((name) => ({ name, type: "CONTRACTOR" })))
          .select("*");
        for (const c of created || []) cMap.set(c.name.toLowerCase(), c as any);
      }
      const bMap = new Map(buildings.map((b) => [b.name.toLowerCase(), b]));
      const wMap = new Map(workTypes.map((w) => [w.name.toLowerCase(), w]));

      const payload = valid.map((r) => {
        const c = cMap.get(r.contractor_name.toLowerCase());
        const b = bMap.get(r.building_name.toLowerCase());
        const w = wMap.get(r.work_type_name.toLowerCase());
        return {
          work_date: r.work_date,
          contractor_id: c?.id || null,
          contractor_name: c?.name || r.contractor_name,
          subcontractor_name: r.subcontractor_name || null,
          building_id: b?.id || null,
          building_name: b?.name || r.building_name,
          work_type_id: w?.id || null,
          work_type_name: w?.name || r.work_type_name,
          main_activity: r.main_activity || null,
          day_shift_manpower: Math.max(0, Math.round(r.day_shift_manpower)),
          night_shift_manpower: Math.max(0, Math.round(r.night_shift_manpower)),
          male: Math.max(0, Math.round(r.male)),
          female: Math.max(0, Math.round(r.female)),
          working_hours: r.working_hours,
          ot_hours: r.ot_hours,
          high_risk_activity: r.high_risk_activity || !!w?.high_risk,
          remark: r.remark || null,
          submitted_by: r.submitted_by || session?.name || null,
          created_by: session?.name || null,
        };
      });

      const { error } = await supabase.from("mh_daily_workhours").insert(payload);
      if (error) throw error;
      await logAudit(session, "IMPORT", "daily_workhours", null, `${payload.length} rows`);
      toast(`นำเข้า ${payload.length} รายการสำเร็จ`);
      setPreview(false);
      setParsed(null);
      await Promise.all([refreshMaster(), refresh()]);
    } catch (e: any) {
      toast(e?.message || "นำเข้าไม่สำเร็จ", "error");
    } finally {
      setImporting(false);
    }
  }

  const validCount = parsed?.filter((r) => !r._error).length || 0;
  const errorCount = (parsed?.length || 0) - validCount;

  return (
    <div className="space-y-4">
      <Section title="Export" subtitle="ดาวน์โหลดข้อมูลและรายงานตามช่วง/ตัวกรองที่เลือกอยู่">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button className="card flex items-center gap-3 p-4 text-left hover:border-brand-300" onClick={doExcel}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <FileSpreadsheet size={22} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-800">Export Excel</span>
              <span className="block text-xs text-slate-400">KPI + รายการ + สรุปทุกมิติ</span>
            </span>
          </button>
          <button className="card flex items-center gap-3 p-4 text-left hover:border-brand-300" onClick={doPdf}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <FileText size={22} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-800">Export PDF</span>
              <span className="block text-xs text-slate-400">Weekly Safety KPI Report</span>
            </span>
          </button>
          <div className="card flex items-center gap-3 p-4 text-left opacity-70">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Presentation size={22} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-800">Export PowerPoint</span>
              <span className="block text-xs text-slate-400">Weekly Report — เร็ว ๆ นี้</span>
            </span>
          </div>
        </div>
      </Section>

      <Section title="Import Excel" subtitle="นำเข้าข้อมูลรายวันจากไฟล์ Excel ตาม template">
        {!perms.canEdit ? (
          <Empty label="ต้องมีสิทธิ์ Contractor Safety ขึ้นไปจึงจะนำเข้าข้อมูลได้" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-outline" onClick={doTemplate}>
              <Download size={16} /> ดาวน์โหลด Template
            </button>
            <button className="btn-primary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> เลือกไฟล์ Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
            <span className="text-xs text-slate-400">
              คอลัมน์: Date, Contractor, Building/Area, Work Type, Day/Night Manpower, Male, Female, Working/OT Hours …
            </span>
          </div>
        )}
      </Section>

      <Modal open={preview} onClose={() => setPreview(false)} title="ตรวจสอบก่อนนำเข้า" size="xl">
        {!parsed ? (
          <Empty label="ไม่มีข้อมูล" />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge color="green">นำเข้าได้ {validCount} แถว</Badge>
              {errorCount > 0 && <Badge color="red">มีปัญหา {errorCount} แถว</Badge>}
              <Badge color="slate">ทั้งหมด {parsed.length} แถว</Badge>
            </div>
            <div className="max-h-[50vh] overflow-auto scroll-thin rounded-lg border border-slate-200">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-1.5">Date</th>
                    <th className="px-2 py-1.5">Contractor</th>
                    <th className="px-2 py-1.5">Area</th>
                    <th className="px-2 py-1.5">Work Type</th>
                    <th className="px-2 py-1.5 text-right">Day</th>
                    <th className="px-2 py-1.5 text-right">Night</th>
                    <th className="px-2 py-1.5 text-right">WH</th>
                    <th className="px-2 py-1.5">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 300).map((r, i) => (
                    <tr key={i} className={`border-t border-slate-100 ${r._error ? "bg-red-50" : ""}`}>
                      <td className="px-2 py-1.5">{r.work_date || "—"}</td>
                      <td className="px-2 py-1.5">{r.contractor_name || "—"}</td>
                      <td className="px-2 py-1.5">{r.building_name || "—"}</td>
                      <td className="px-2 py-1.5">{r.work_type_name || "—"}</td>
                      <td className="px-2 py-1.5 text-right">{fmtInt(r.day_shift_manpower)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtInt(r.night_shift_manpower)}</td>
                      <td className="px-2 py-1.5 text-right">{r.working_hours}</td>
                      <td className="px-2 py-1.5">
                        {r._error ? <span className="text-red-600">{r._error}</span> : <CheckCircle2 size={14} className="text-brand-500" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setPreview(false)}>
                ยกเลิก
              </button>
              <button className="btn-primary" onClick={commitImport} disabled={importing || validCount === 0}>
                {importing ? "กำลังนำเข้า…" : `ยืนยันนำเข้า ${validCount} รายการ`}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
