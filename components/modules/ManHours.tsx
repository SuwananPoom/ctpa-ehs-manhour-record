"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabaseClient";
import { fmtInt, todayISO } from "@/lib/format";
import { Empty, Spinner } from "@/components/ui";

interface WeeklyRow {
  week_start: string;
  iso_year: number;
  iso_week: number;
  man_days: number;
  man_hours: number;
  work_days: number;
}
interface WeekPoint {
  week: string;
  weekStart: string;
  manDays: number;
  manHours: number;
  accumulated: number;
  target: number;
  avgMpDay: number;
}

const ORANGE = "#f97316";
const GOLD = "#f5b50a";
const GREEN = "#16a34a";
const BLUE = "#1d4ed8";

const WINDOWS = [
  { label: "12 สัปดาห์", value: 12 },
  { label: "26 สัปดาห์", value: 26 },
  { label: "52 สัปดาห์", value: 52 },
  { label: "ทั้งหมด", value: 9999 },
];

export default function ManHours() {
  const { settings, contractors, buildings, workTypes, workhours } = useApp();
  const [rows, setRows] = useState<WeeklyRow[] | null>(null);
  const [contractorId, setContractorId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [workTypeId, setWorkTypeId] = useState("");
  const [window, setWindow] = useState(26);

  useEffect(() => {
    let active = true;
    supabase
      .rpc("mh_weekly", {
        p_to: todayISO(),
        p_contractor: contractorId || null,
        p_building: buildingId || null,
        p_worktype: workTypeId || null,
      })
      .then(({ data }) => {
        if (active) setRows((data as WeeklyRow[]) || []);
      });
    return () => {
      active = false;
    };
  }, [contractorId, buildingId, workTypeId, workhours]);

  const target = settings.manhour_target || 2000000;

  const allPoints: WeekPoint[] = useMemo(() => {
    if (!rows) return [];
    let acc = settings.baseline_manhours || 0;
    return rows.map((r) => {
      acc += Number(r.man_hours);
      return {
        week: `W${r.iso_week}`,
        weekStart: r.week_start,
        manDays: Math.round(Number(r.man_days)),
        manHours: Math.round(Number(r.man_hours)),
        accumulated: Math.round(acc),
        target,
        avgMpDay: r.work_days > 0 ? Math.round(Number(r.man_days) / Number(r.work_days)) : 0,
      };
    });
  }, [rows, settings.baseline_manhours, target]);

  const points = useMemo(() => allPoints.slice(-window), [allPoints, window]);
  const achieved = allPoints.length ? allPoints[allPoints.length - 1].accumulated : 0;
  const remaining = Math.max(target - achieved, 0);
  const pctAchieved = target > 0 ? Math.round((achieved / target) * 100) : 0;
  const showLabels = points.length <= 16;

  const donut = [
    { name: "Achieved MH without LTI", value: achieved, color: GREEN },
    { name: "Remaining MH", value: remaining, color: GOLD },
  ];
  const avgMp = points.slice(-5);
  const maxWeekly = Math.max(10, ...points.map((p) => Math.max(p.manHours, p.manDays)));
  const rightMax = Math.max(target, achieved) * 1.05;

  if (!rows) return <Spinner label="กำลังคำนวณ Man-Hours รายสัปดาห์…" />;

  return (
    <div className="space-y-4">
      {/* filter row */}
      <div className="card p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="label">Contractor</label>
            <select className="input" value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
              <option value="">ทุกบริษัท</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Building</label>
            <select className="input" value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
              <option value="">ทุกพื้นที่</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Work Type</label>
            <select className="input" value={workTypeId} onChange={(e) => setWorkTypeId(e.target.value)}>
              <option value="">ทุกประเภทงาน</option>
              {workTypes.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ช่วงที่แสดง</label>
            <select className="input" value={window} onChange={(e) => setWindow(Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* LEFT: weekly combo chart */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 shadow-card lg:col-span-2">
          <h3 className="mb-3 text-center text-sm font-bold uppercase tracking-wide text-blue-700">
            Total Man-hours / Week & Accumulated Man-hours
          </h3>
          {points.length === 0 ? (
            <Empty label="ยังไม่มีข้อมูล Man-hours — เพิ่มที่เมนู Daily Manpower" />
          ) : (
            <div className="h-[420px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 24, right: 12, bottom: 4, left: -4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6efe2" vertical={false} />
                  <XAxis dataKey="week" fontSize={11} stroke="#64748b" interval={0} angle={points.length > 16 ? -45 : 0} textAnchor={points.length > 16 ? "end" : "middle"} height={points.length > 16 ? 48 : 24} />
                  <YAxis yAxisId="l" fontSize={10} stroke="#64748b" domain={[0, Math.ceil((maxWeekly * 1.25) / 10000) * 10000]} tickFormatter={(v) => fmtInt(v)} width={52} />
                  <YAxis yAxisId="r" orientation="right" fontSize={10} stroke="#64748b" domain={[0, rightMax]} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={44} />
                  <Tooltip formatter={(v: number, n: string) => [fmtInt(v), n]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="l" dataKey="manDays" name="Man-Days (prs.)/Week" fill={ORANGE} radius={[3, 3, 0, 0]} barSize={points.length > 20 ? 7 : 12}>
                    {showLabels && <LabelList dataKey="manDays" position="top" fontSize={8} fill="#9a3412" formatter={(v: number) => fmtInt(v)} />}
                  </Bar>
                  <Bar yAxisId="l" dataKey="manHours" name="Total man-hours(hrs.)/Week" fill={GOLD} radius={[3, 3, 0, 0]} barSize={points.length > 20 ? 7 : 12}>
                    {showLabels && <LabelList dataKey="manHours" position="top" fontSize={8} fill="#92400e" formatter={(v: number) => fmtInt(v)} />}
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="accumulated" name="Accumulated man-hours(hrs.)" stroke={GREEN} strokeWidth={2.5} dot={{ r: 2.5, fill: GREEN }}>
                    {showLabels && <LabelList dataKey="accumulated" position="top" fontSize={8} fill={GREEN} formatter={(v: number) => fmtInt(v)} />}
                  </Line>
                  <Line yAxisId="r" type="monotone" dataKey="target" name="Man-Hours Target(hrs.)" stroke={BLUE} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* RIGHT column */}
        <div className="space-y-4">
          {/* Donut */}
          <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 shadow-card">
            <h3 className="mb-1 text-center text-sm font-bold uppercase leading-tight tracking-wide text-blue-700">
              Man-Hours Target & Achieved MH without LTI
            </h3>
            <div className="relative h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={68} outerRadius={100} paddingAngle={2} startAngle={90} endAngle={-270}>
                    {donut.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [fmtInt(v), n]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs font-semibold text-slate-600">MH Targets</span>
                <span className="text-2xl font-extrabold text-blue-700">{fmtInt(target)}</span>
                <span className="text-[11px] text-slate-500">Hours</span>
              </div>
            </div>
            <div className="mt-1 flex justify-between text-xs">
              <span className="font-semibold text-brand-700">
                ● Achieved {fmtInt(achieved)} ({pctAchieved}%)
              </span>
              <span className="font-semibold text-amber-600">
                Remaining {fmtInt(remaining)} ({100 - pctAchieved}%)
              </span>
            </div>
          </div>

          {/* Average MP/Day */}
          <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 shadow-card">
            <h3 className="mb-2 text-center text-sm font-bold uppercase tracking-wide text-blue-700">Average MP / Day</h3>
            {avgMp.length === 0 ? (
              <Empty label="ไม่มีข้อมูล" />
            ) : (
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={avgMp} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d6efe2" vertical={false} />
                    <XAxis dataKey="week" fontSize={11} stroke="#64748b" />
                    <YAxis fontSize={10} stroke="#64748b" width={36} />
                    <Tooltip formatter={(v: number) => fmtInt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Bar dataKey="avgMpDay" name="Avg MP/Day" fill={ORANGE} radius={[4, 4, 0, 0]} barSize={34}>
                      <LabelList dataKey="avgMpDay" position="top" fontSize={11} fontWeight={600} fill="#9a3412" formatter={(v: number) => fmtInt(v)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
