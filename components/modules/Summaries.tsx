"use client";

import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "@/context/AppContext";
import {
  dailySeries,
  filterIncidents,
  filterWorkhours,
  groupBy,
  type GroupSummary,
} from "@/lib/kpi";
import { CHART_COLORS } from "@/lib/constants";
import { fmtDateShort, fmtInt, fmtNum } from "@/lib/format";
import { Badge, Empty, Section } from "@/components/ui";
import type { Filters } from "@/lib/types";

function useGroups(dim: "contractor" | "building" | "worktype") {
  const { workhours, incidents, filters } = useApp();
  const rows = useMemo(() => filterWorkhours(workhours, filters), [workhours, filters]);
  const inc = useMemo(() => filterIncidents(incidents, filters), [incidents, filters]);
  const groups = useMemo(() => groupBy(rows, inc, filters.shift, dim), [rows, inc, filters.shift, dim]);
  const series = useMemo(() => dailySeries(rows, filters.shift), [rows, filters.shift]);
  return { groups, series, filters };
}

function perfBadge(g: GroupSummary) {
  // Group-level TRIR proxy (recordable per 200,000 man-hours)
  if (g.manhours <= 0) return <Badge color="slate">—</Badge>;
  const trir = (g.recordable * 200000) / g.manhours;
  if (g.recordable === 0) return <Badge color="green">ดีเยี่ยม</Badge>;
  if (trir <= 1) return <Badge color="amber">เฝ้าระวัง</Badge>;
  return <Badge color="red">ต้องปรับปรุง</Badge>;
}

function SummaryTable({
  groups,
  showIncidents,
  firstColLabel,
}: {
  groups: GroupSummary[];
  showIncidents: boolean;
  firstColLabel: string;
}) {
  if (groups.length === 0) return <Empty label="ไม่มีข้อมูลในช่วงที่เลือก" />;
  const totals = groups.reduce(
    (a, g) => ({
      manpower: a.manpower + g.manpower,
      manhours: a.manhours + g.manhours,
      highRisk: a.highRisk + g.highRisk,
      incidents: a.incidents + g.incidents,
      recordable: a.recordable + g.recordable,
    }),
    { manpower: 0, manhours: 0, highRisk: 0, incidents: 0, recordable: 0 },
  );
  return (
    <div className="-mx-4 overflow-x-auto scroll-thin sm:mx-0">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="px-3 py-2 font-medium">{firstColLabel}</th>
            <th className="px-3 py-2 text-right font-medium">Total Manpower</th>
            <th className="px-3 py-2 text-right font-medium">Working Hours</th>
            <th className="px-3 py-2 text-right font-medium">High Risk</th>
            {showIncidents && <th className="px-3 py-2 text-right font-medium">Incidents</th>}
            {showIncidents && <th className="px-3 py-2 text-right font-medium">Recordable</th>}
            <th className="px-3 py-2 text-center font-medium">KPI</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.key} className="border-b border-slate-100 hover:bg-slate-50/60">
              <td className="px-3 py-2 font-medium text-slate-800">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                {g.label}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtInt(g.manpower)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-sky-700">{fmtInt(g.manhours)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtInt(g.highRisk)}</td>
              {showIncidents && <td className="px-3 py-2 text-right tabular-nums">{fmtInt(g.incidents)}</td>}
              {showIncidents && <td className="px-3 py-2 text-right tabular-nums text-red-600">{fmtInt(g.recordable)}</td>}
              <td className="px-3 py-2 text-center">{showIncidents ? perfBadge(g) : <Badge color="slate">—</Badge>}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <td className="px-3 py-2 text-slate-700">รวมทั้งหมด</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtInt(totals.manpower)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-sky-700">{fmtInt(totals.manhours)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtInt(totals.highRisk)}</td>
            {showIncidents && <td className="px-3 py-2 text-right tabular-nums">{fmtInt(totals.incidents)}</td>}
            {showIncidents && <td className="px-3 py-2 text-right tabular-nums text-red-600">{fmtInt(totals.recordable)}</td>}
            <td className="px-3 py-2"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function GroupBarChart({ groups }: { groups: GroupSummary[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={groups} layout="vertical" margin={{ left: 10, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" horizontal={false} />
          <XAxis type="number" fontSize={11} stroke="#94a3b8" />
          <YAxis type="category" dataKey="label" width={110} fontSize={11} stroke="#94a3b8" />
          <Tooltip formatter={(v: number) => fmtInt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Bar dataKey="manhours" name="Man-hours" radius={[0, 4, 4, 0]} barSize={16}>
            {groups.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyTrend({ series }: { series: { date: string; manpower: number; manhours: number }[] }) {
  if (series.length === 0) return null;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 8, right: 8, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" />
          <XAxis dataKey="date" tickFormatter={fmtDateShort} fontSize={11} stroke="#94a3b8" />
          <YAxis yAxisId="l" fontSize={11} stroke="#94a3b8" />
          <YAxis yAxisId="r" orientation="right" fontSize={11} stroke="#94a3b8" />
          <Tooltip formatter={(v: number) => fmtInt(v)} labelFormatter={(l) => fmtDateShort(l as string)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="l" dataKey="manpower" name="Manpower" fill="#00cc79" radius={[4, 4, 0, 0]} barSize={16} />
          <Line yAxisId="r" type="monotone" dataKey="manhours" name="Man-hours" stroke="#0ea5e9" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ContractorSummary() {
  const { groups } = useGroups("contractor");
  return (
    <div className="space-y-4">
      <Section title="Contractor Summary" subtitle="สรุปแยกตามผู้รับเหมา">
        <SummaryTable groups={groups} showIncidents firstColLabel="Contractor" />
      </Section>
      <Section title="เปรียบเทียบ Man-hours แต่ละ Contractor">
        <GroupBarChart groups={groups} />
      </Section>
    </div>
  );
}

export function BuildingSummary() {
  const { groups, series } = useGroups("building");
  return (
    <div className="space-y-4">
      <Section title="Building / Area Summary" subtitle="สรุปแยกตามพื้นที่">
        <SummaryTable groups={groups} showIncidents firstColLabel="Building / Area" />
      </Section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Man-hours แต่ละพื้นที่">
          <GroupBarChart groups={groups} />
        </Section>
        <Section title="แนวโน้มรายวัน (Manpower & Working Hours)">
          <DailyTrend series={series} />
        </Section>
      </div>
    </div>
  );
}

export function WorkTypeSummary() {
  const { groups } = useGroups("worktype");
  return (
    <div className="space-y-4">
      <Section title="Work Type Summary" subtitle="สรุปแยกตามประเภทงาน — ใช้ตัวกรอง Work Type ด้านบนเพื่อเจาะลึก">
        <SummaryTable groups={groups} showIncidents={false} firstColLabel="Work Type" />
      </Section>
      <Section title="เปรียบเทียบ Man-hours แต่ละประเภทงาน">
        <GroupBarChart groups={groups} />
      </Section>
    </div>
  );
}
