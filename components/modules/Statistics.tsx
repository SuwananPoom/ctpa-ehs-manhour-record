"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { useApp, type StatHours } from "@/context/AppContext";
import {
  codeDistribution,
  filterIncidentsByDim,
  incidentBucket,
  incidentsInRange,
  incidentsUpTo,
  monthlyIncidentSeries,
  nearMissDistribution,
  topCategories,
  type IncidentBucket,
} from "@/lib/kpi";
import {
  CHART_COLORS,
  INCIDENT_CODE_LABEL,
  LTI_TYPES,
  TYPE_A_INCIDENTS,
  TYPE_B_INCIDENTS,
} from "@/lib/constants";
import { daysBetween, fmtInt, fmtNum, isoWeek, todayISO } from "@/lib/format";
import { Empty, Section, useToast } from "@/components/ui";
import { logAudit } from "@/lib/audit";

type Mode = "WEEK" | "MONTH";
type StatusColor = "green" | "yellow" | "red";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtISO(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function weekToRange(w: string): { start: string; end: string } {
  const m = w.match(/^(\d{4})-W(\d{2})$/);
  if (!m) {
    const t = todayISO();
    return { start: t, end: t };
  }
  const year = +m[1];
  const week = +m[2];
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - dow + 1);
  else start.setUTCDate(simple.getUTCDate() + 8 - dow);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: fmtISO(start), end: fmtISO(end) };
}
function monthToRange(mo: string): { start: string; end: string } {
  const [y, m] = mo.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${mo}-01`, end: `${mo}-${pad(last)}` };
}
const STATUS_CLASS: Record<StatusColor, string> = {
  green: "bg-brand-50 text-brand-700 border-brand-200",
  yellow: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
};

const COUNT_INDICATORS: { key: keyof IncidentBucket; label: string; sev: StatusColor }[] = [
  { key: "nearMiss", label: "Near Miss (NM)", sev: "yellow" },
  { key: "propertyDamage", label: "Property Damaged (PD)", sev: "yellow" },
  { key: "firstAid", label: "First Aid (FAC)", sev: "yellow" },
  { key: "medicalTreatment", label: "Medical Treatment (MTC)", sev: "red" },
  { key: "restrictedWork", label: "Restricted Work (RWC)", sev: "red" },
  { key: "recordable", label: "Recordable Incident", sev: "red" },
  { key: "lti", label: "Lost Time Injury (LTI)", sev: "red" },
  { key: "fatality", label: "Fatality", sev: "red" },
  { key: "lossOfConsciousness", label: "Loss of Consciousness", sev: "red" },
  { key: "wps", label: "Serious & Pot. Serious (WPS)", sev: "red" },
];

export default function Statistics() {
  const { incidents, settings, globals, getStatHours, contractors, buildings, workTypes, workhours, session } =
    useApp();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>("WEEK");
  const [weekValue, setWeekValue] = useState<string>(isoWeek(new Date()));
  const [monthValue, setMonthValue] = useState<string>(todayISO().slice(0, 7));
  const [contractorId, setContractorId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [workTypeId, setWorkTypeId] = useState("");
  const [hours, setHours] = useState<StatHours | null>(null);

  const { start: periodStart, end: periodEnd } = useMemo(
    () => (mode === "WEEK" ? weekToRange(weekValue) : monthToRange(monthValue)),
    [mode, weekValue, monthValue],
  );

  useEffect(() => {
    let active = true;
    getStatHours(periodStart, periodEnd, contractorId, buildingId, workTypeId).then((h) => {
      if (active) setHours(h);
    });
    return () => {
      active = false;
    };
  }, [periodStart, periodEnd, contractorId, buildingId, workTypeId, workhours, getStatHours]);

  const dimFiltered = useMemo(
    () => filterIncidentsByDim(incidents, { contractorId, buildingId } as any),
    [incidents, contractorId, buildingId],
  );
  const periodIncidents = useMemo(
    () => incidentsInRange(dimFiltered, periodStart, periodEnd),
    [dimFiltered, periodStart, periodEnd],
  );
  const cumulativeIncidents = useMemo(
    () => incidentsUpTo(dimFiltered, periodEnd),
    [dimFiltered, periodEnd],
  );

  const periodBucket = useMemo(
    () => incidentBucket(periodIncidents, hours?.week_hours || 0, settings),
    [periodIncidents, hours, settings],
  );
  const cumBucket = useMemo(
    () => incidentBucket(cumulativeIncidents, hours?.cumulative_hours || 0, settings),
    [cumulativeIncidents, hours, settings],
  );

  const daysWithoutLti = useMemo(() => {
    const ltiDates = [
      settings.last_lti_date,
      ...cumulativeIncidents.filter((i) => LTI_TYPES.includes(i.incident_type)).map((i) => i.incident_date),
    ].filter(Boolean) as string[];
    if (ltiDates.length) return daysBetween(ltiDates.sort().slice(-1)[0], todayISO());
    return globals?.first_record_date ? daysBetween(globals.first_record_date, todayISO()) : 0;
  }, [cumulativeIncidents, settings.last_lti_date, globals]);

  const monthly = useMemo(() => monthlyIncidentSeries(dimFiltered), [dimFiltered]);
  const codeDist = useMemo(() => codeDistribution(cumulativeIncidents), [cumulativeIncidents]);
  const nmDist = useMemo(() => nearMissDistribution(cumulativeIncidents), [cumulativeIncidents]);
  const top5 = useMemo(() => topCategories(periodIncidents, 5), [periodIncidents]);

  const periodLabel = mode === "WEEK" ? `สัปดาห์ ${weekValue}` : `เดือน ${monthValue}`;

  async function doExport(kind: "excel" | "pdf") {
    const mod = await import("@/lib/exporters");
    const payload = {
      periodLabel,
      periodStart,
      periodEnd,
      periodBucket,
      cumBucket,
      daysWithoutLti,
      typeA: TYPE_A_INCIDENTS,
      typeB: TYPE_B_INCIDENTS,
      cumulativeIncidents,
      top5,
      settings,
    };
    if (kind === "excel") mod.exportIncidentStatsExcel(payload);
    else mod.exportIncidentStatsPdf(payload, session?.name || "EHS");
    logAudit(session, "EXPORT", kind, null, "incident stats");
    toast(`Export ${kind.toUpperCase()} สำเร็จ`);
  }

  return (
    <div className="space-y-4">
      {/* ---- Filter row (section 5) ---- */}
      <div className="card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(["WEEK", "MONTH"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  mode === m ? "bg-white text-brand-600 shadow-sm" : "text-slate-500"
                }`}
              >
                {m === "WEEK" ? "รายสัปดาห์" : "รายเดือน"}
              </button>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className="label">
                <CalendarDays size={12} className="mr-1 inline" />
                {mode === "WEEK" ? "Week" : "Month"}
              </label>
              {mode === "WEEK" ? (
                <input type="week" className="input" value={weekValue} onChange={(e) => setWeekValue(e.target.value)} />
              ) : (
                <input type="month" className="input" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
              )}
            </div>
            <div>
              <label className="label">Contractor</label>
              <select className="input" value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
                <option value="">ทุกบริษัท</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Building</label>
              <select className="input" value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
                <option value="">ทุกพื้นที่</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Work Type</label>
              <select className="input" value={workTypeId} onChange={(e) => setWorkTypeId(e.target.value)}>
                <option value="">ทุกประเภทงาน</option>
                {workTypes.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => doExport("excel")} title="Export Excel">
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button className="btn-outline" onClick={() => doExport("pdf")} title="Export PDF">
              <FileText size={16} /> PDF
            </button>
            <button className="btn-ghost" disabled title="เร็ว ๆ นี้">
              <Presentation size={16} /> PPT
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          ช่วง {periodLabel} ({periodStart} → {periodEnd}) · Workhours สัปดาห์/เดือน {fmtInt(hours?.week_hours || 0)} ·
          สะสม {fmtInt(hours?.cumulative_hours || 0)}
        </p>
      </div>

      {/* ---- Rate KPI cards (section 1 rates) ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <RateCard label="TRIR" value={cumBucket.trir} target={settings.targets.trir} formula="Recordable × 200,000 / Workhours" />
        <RateCard label="LTIR" value={cumBucket.ltir} target={settings.targets.ltir} formula="LTI × 1,000,000 / Workhours" />
        <RateCard label="WPS Rate" value={cumBucket.wpsRate} target={settings.targets.wps} formula="Lost Workdays / Recordable" />
        <div className={`card flex flex-col justify-center p-4 ${STATUS_CLASS.green} border`}>
          <span className="text-xs font-medium opacity-80">Days Without LTI</span>
          <span className="text-3xl font-bold tabular-nums">{fmtInt(daysWithoutLti)}</span>
          <span className="text-[11px] opacity-70">สะสมถึงปัจจุบัน</span>
        </div>
      </div>

      {/* ---- Leading / Lagging Indicators table (section 1) ---- */}
      <Section
        title="Leading / Lagging Indicators"
        subtitle={`${periodLabel} เทียบกับ Cumulative To Date · สีอัตโนมัติ: เขียว=0, เหลือง=เฝ้าระวัง, แดง=มีเหตุ`}
      >
        <div className="-mx-4 overflow-x-auto scroll-thin sm:mx-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Indicator</th>
                <th className="px-3 py-2 text-right font-medium">Last Period</th>
                <th className="px-3 py-2 text-right font-medium">Cumulative</th>
                <th className="px-3 py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {COUNT_INDICATORS.map((ind) => {
                const pv = periodBucket[ind.key] as number;
                const cv = cumBucket[ind.key] as number;
                const color: StatusColor = pv === 0 ? "green" : ind.sev;
                return (
                  <tr key={ind.key} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{ind.label}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtInt(pv)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtInt(cv)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block h-3 w-3 rounded-full ${color === "green" ? "bg-brand-500" : color === "yellow" ? "bg-amber-400" : "bg-red-500"}`} />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 text-xs text-slate-500">
                <td className="px-3 py-2">Total Workhours</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(hours?.week_hours || 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(hours?.cumulative_hours || 0)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---- Type A & B (sections 2 & 3) ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TypeTable title="Type A Incidents" codes={TYPE_A_INCIDENTS} incidents={cumulativeIncidents} benchmarks={settings.benchmarks} />
        <TypeTable title="Type B Incidents" codes={TYPE_B_INCIDENTS} incidents={cumulativeIncidents} benchmarks={settings.benchmarks} />
      </div>

      {/* ---- Weekly Summary (section 6) ---- */}
      <Section title="Weekly Summary" subtitle={periodLabel}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Total Incident" value={periodBucket.total} />
          <MiniStat label="Near Miss" value={periodBucket.nearMiss} />
          <MiniStat label="FAC" value={periodBucket.firstAid} />
          <MiniStat label="MTC" value={periodBucket.medicalTreatment} />
          <MiniStat label="RWC" value={periodBucket.restrictedWork} />
          <MiniStat label="LTI" value={periodBucket.lti} red />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="TRIR" value={cumBucket.trir} isNum />
            <MiniStat label="LTIR" value={cumBucket.ltir} isNum />
            <MiniStat label="Days w/o LTI" value={daysWithoutLti} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500">Top 5 Incident Categories</div>
            {top5.length === 0 ? (
              <p className="text-sm text-slate-400">ไม่มีเหตุในช่วงนี้ ✓</p>
            ) : (
              <ol className="space-y-1">
                {top5.map((t, i) => (
                  <li key={t.name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1 text-sm">
                    <span className="text-slate-700">
                      <span className="mr-2 text-slate-400">{i + 1}.</span>
                      {INCIDENT_CODE_LABEL[t.name] || t.name}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-800">{fmtInt(t.value)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </Section>

      {/* ---- Charts (section 4) ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Incident Type Distribution">
          <PieBlock data={codeDist} labelMap={INCIDENT_CODE_LABEL} />
        </Section>
        <Section title="Near Miss Distribution (by area)">
          <PieBlock data={nmDist} />
        </Section>
      </div>

      <Section title="Leading vs Lagging Indicator Trend (รายเดือน)">
        {monthly.length === 0 ? (
          <Empty label="ยังไม่มีข้อมูลแนวโน้ม" />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 8, right: 8, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" />
                <XAxis dataKey="month" fontSize={11} stroke="#94a3b8" />
                <YAxis allowDecimals={false} fontSize={11} stroke="#94a3b8" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="leading" name="Leading (Near Miss)" stroke="#00cc79" strokeWidth={2} />
                <Line type="monotone" dataKey="lagging" name="Lagging (Recordable)" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <Section title="Monthly Incident Trend">
        {monthly.length === 0 ? (
          <Empty label="ยังไม่มีข้อมูล" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 8, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" />
                <XAxis dataKey="month" fontSize={11} stroke="#94a3b8" />
                <YAxis allowDecimals={false} fontSize={11} stroke="#94a3b8" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="total" name="Total Incident" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={26} />
                <Bar dataKey="lti" name="LTI" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ---- Benchmark (section 9) ---- */}
      <Section title="Benchmark — CTP vs Target & Industry" subtitle="แสดง Variance % และสถานะ Green/Red">
        <div className="-mx-4 overflow-x-auto scroll-thin sm:mx-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">KPI</th>
                <th className="px-3 py-2 text-right font-medium">Project (CTP)</th>
                <th className="px-3 py-2 text-right font-medium">Target</th>
                <th className="px-3 py-2 text-right font-medium">Industry Benchmark</th>
                <th className="px-3 py-2 text-right font-medium">Variance %</th>
                <th className="px-3 py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <BenchmarkRow label="TRIR" value={cumBucket.trir} target={settings.targets.trir} bench={settings.benchmarks.TRIR} />
              <BenchmarkRow label="LTIR" value={cumBucket.ltir} target={settings.targets.ltir} bench={settings.benchmarks.LTIR} />
              <BenchmarkRow label="WPS Rate" value={cumBucket.wpsRate} target={settings.targets.wps} bench={settings.benchmarks.WPS} />
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ---------------- sub-components ----------------
function RateCard({ label, value, target, formula }: { label: string; value: number; target: number; formula: string }) {
  const ok = value <= target;
  const color: StatusColor = ok ? "green" : "red";
  return (
    <div className={`card flex flex-col gap-0.5 border p-4 ${STATUS_CLASS[color]}`}>
      <span className="text-xs font-medium opacity-80">{label}</span>
      <span className="text-3xl font-bold tabular-nums">{fmtNum(value, 2)}</span>
      <span className="text-[11px] opacity-70">เป้าหมาย ≤ {fmtNum(target, 2)} · {ok ? "ผ่าน ✓" : "เกิน ✗"}</span>
      <span className="mt-0.5 text-[10px] opacity-60">{formula}</span>
    </div>
  );
}

function MiniStat({ label, value, isNum, red }: { label: string; value: number; isNum?: boolean; red?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${red && value > 0 ? "text-red-600" : "text-slate-800"}`}>
        {isNum ? fmtNum(value, 2) : fmtInt(value)}
      </div>
    </div>
  );
}

function TypeTable({
  title,
  codes,
  incidents,
  benchmarks,
}: {
  title: string;
  codes: { code: string; label: string }[];
  incidents: any[];
  benchmarks: Record<string, number>;
}) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of incidents) if (i.type_code) m[i.type_code] = (m[i.type_code] || 0) + 1;
    return m;
  }, [incidents]);
  return (
    <Section title={title}>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-2 py-2 font-medium">Code</th>
              <th className="px-2 py-2 font-medium">Type</th>
              <th className="px-2 py-2 text-right font-medium">Project</th>
              <th className="px-2 py-2 text-right font-medium">Benchmark</th>
              <th className="px-2 py-2 text-center font-medium">St.</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => {
              const v = counts[c.code] || 0;
              const bench = benchmarks[c.code] ?? 0;
              const color: StatusColor = v === 0 ? "green" : v > bench ? "red" : "yellow";
              return (
                <tr key={c.code} className="border-b border-slate-100">
                  <td className="px-2 py-1.5 font-mono text-xs font-semibold text-slate-700">{c.code}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-500">{c.label}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtInt(v)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{fmtInt(bench)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${color === "green" ? "bg-brand-500" : color === "yellow" ? "bg-amber-400" : "bg-red-500"}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function PieBlock({ data, labelMap }: { data: { name: string; value: number }[]; labelMap?: Record<string, string> }) {
  if (data.length === 0) return <Empty label="ไม่มีข้อมูล" />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={84} innerRadius={42} paddingAngle={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number, n: string) => [fmtInt(v), labelMap?.[n] || n]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function BenchmarkRow({ label, value, target, bench }: { label: string; value: number; target: number; bench: number }) {
  const variance = bench > 0 ? ((value - bench) / bench) * 100 : null;
  const ok = value <= target;
  return (
    <tr className="border-b border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-700">{label}</td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtNum(value, 2)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtNum(target, 2)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtNum(bench, 2)}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${variance !== null && variance > 0 ? "text-red-600" : "text-brand-600"}`}>
        {variance === null ? "—" : `${variance > 0 ? "+" : ""}${fmtNum(variance, 1)}%`}
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`chip ${ok ? "bg-brand-100 text-brand-700" : "bg-red-100 text-red-700"}`}>{ok ? "Green" : "Red"}</span>
      </td>
    </tr>
  );
}
