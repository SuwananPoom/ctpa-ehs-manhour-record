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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlarmClock,
  CalendarClock,
  Clock,
  Eye,
  HeartPulse,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  computeKpi,
  dailySeries,
  filterIncidents,
  filterWorkhours,
  groupBy,
} from "@/lib/kpi";
import { CHART_COLORS, INCIDENT_LABELS, INCIDENT_ORDER } from "@/lib/constants";
import { fmtDateShort, fmtInt, fmtNum } from "@/lib/format";
import { Empty, KpiCard, Section } from "@/components/ui";

export default function Dashboard() {
  const { workhours, incidents, observationCount, globals, settings, filters } = useApp();

  const rows = useMemo(() => filterWorkhours(workhours, filters), [workhours, filters]);
  const inc = useMemo(() => filterIncidents(incidents, filters), [incidents, filters]);
  const kpi = useMemo(
    () => computeKpi(rows, inc, observationCount, globals, settings, filters.shift),
    [rows, inc, observationCount, globals, settings, filters.shift],
  );
  const series = useMemo(() => dailySeries(rows, filters.shift), [rows, filters.shift]);
  const byBuilding = useMemo(() => groupBy(rows, inc, filters.shift, "building"), [rows, inc, filters.shift]);
  const byWorkType = useMemo(() => groupBy(rows, inc, filters.shift, "worktype"), [rows, inc, filters.shift]);

  const incidentBars = useMemo(
    () =>
      INCIDENT_ORDER.map((t) => ({
        name: INCIDENT_LABELS[t].replace(" Case", ""),
        value: inc.filter((i) => i.incident_type === t).length,
      })).filter((d) => d.value > 0),
    [inc],
  );

  const trirOk = kpi.trir <= settings.targets.trir;
  const ltirOk = kpi.ltir <= settings.targets.ltir;

  return (
    <div className="space-y-4">
      {/* Primary KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total Manpower (man-days)"
          value={fmtInt(kpi.totalManpower)}
          sub={`เฉลี่ย ${fmtInt(kpi.avgDailyManpower)}/วัน · สูงสุด ${fmtInt(kpi.peakDailyManpower)}`}
          icon={<Users size={18} />}
        />
        <KpiCard
          label="Total Working Hours"
          value={fmtInt(kpi.totalWorkingHours)}
          sub={`OT ${fmtInt(kpi.otHours)} ชม.`}
          accent="blue"
          icon={<Clock size={18} />}
        />
        <KpiCard
          label="Accumulative Working Hours"
          value={fmtInt(kpi.accumulativeManhours)}
          sub="สะสมทั้งโครงการ"
          accent="violet"
          icon={<TrendingUp size={18} />}
        />
        <KpiCard
          label="Rolling Year Workhours"
          value={fmtInt(kpi.rollingYearManhours)}
          sub="ย้อนหลัง 365 วัน"
          accent="slate"
          icon={<CalendarClock size={18} />}
        />
      </div>

      {/* Safety metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Safety Observations"
          value={fmtInt(kpi.observations)}
          sub={`Rate ${fmtNum(kpi.observationRate)} /${fmtInt(settings.observation_basis)} ชม.`}
          accent="brand"
          icon={<Eye size={18} />}
        />
        <KpiCard
          label="Days Without LTI"
          value={fmtInt(kpi.daysWithoutLti)}
          sub={kpi.lastLtiDate ? `LTI ล่าสุด ${kpi.lastLtiDate}` : "ไม่มี LTI บันทึกไว้"}
          accent="brand"
          icon={<ShieldAlert size={18} />}
        />
        <KpiCard
          label="TRIR"
          value={fmtNum(kpi.trir, 2)}
          sub={`เป้าหมาย ≤ ${fmtNum(settings.targets.trir, 2)} · ${trirOk ? "ผ่าน ✓" : "เกิน ✗"}`}
          accent={trirOk ? "brand" : "red"}
          icon={<Activity size={18} />}
        />
        <KpiCard
          label="LTIR"
          value={fmtNum(kpi.ltir, 2)}
          sub={`เป้าหมาย ≤ ${fmtNum(settings.targets.ltir, 2)} · ${ltirOk ? "ผ่าน ✓" : "เกิน ✗"}`}
          accent={ltirOk ? "brand" : "red"}
          icon={<Activity size={18} />}
        />
      </div>

      {/* Incident counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="First Aid" value={fmtInt(kpi.firstAid)} accent="amber" icon={<HeartPulse size={16} />} />
        <KpiCard label="Medical Treatment" value={fmtInt(kpi.medicalTreatment)} accent="amber" icon={<Stethoscope size={16} />} />
        <KpiCard label="Lost Time Injury" value={fmtInt(kpi.lostTimeInjury)} accent="red" icon={<ShieldAlert size={16} />} />
        <KpiCard label="Recordable" value={fmtInt(kpi.recordable)} accent="red" icon={<ShieldAlert size={16} />} />
        <KpiCard label="Near Miss" value={fmtInt(kpi.nearMiss)} accent="slate" icon={<AlarmClock size={16} />} />
        <KpiCard label="High Risk Activities" value={fmtInt(kpi.highRiskActivities)} accent="violet" icon={<ShieldAlert size={16} />} />
      </div>

      {/* Daily trend */}
      <Section title="แนวโน้มรายวัน — Manpower & Working Hours" subtitle={`${rows.length} รายการในช่วงที่เลือก`}>
        {series.length === 0 ? (
          <Empty label="ยังไม่มีข้อมูลในช่วงที่เลือก — เพิ่มข้อมูลที่เมนู Daily Manpower" />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" />
                <XAxis dataKey="date" tickFormatter={fmtDateShort} fontSize={11} stroke="#94a3b8" />
                <YAxis yAxisId="l" fontSize={11} stroke="#94a3b8" />
                <YAxis yAxisId="r" orientation="right" fontSize={11} stroke="#94a3b8" />
                <Tooltip
                  formatter={(v: number, n: string) => [fmtInt(v), n]}
                  labelFormatter={(l) => fmtDateShort(l as string)}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="manpower" name="Manpower" fill="#00cc79" radius={[4, 4, 0, 0]} barSize={18} />
                <Line yAxisId="r" type="monotone" dataKey="manhours" name="Man-hours" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Man-hours แยกตาม Building / Area">
          {byBuilding.length === 0 ? (
            <Empty label="ไม่มีข้อมูล" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byBuilding} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" horizontal={false} />
                  <XAxis type="number" fontSize={11} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="label" width={90} fontSize={11} stroke="#94a3b8" />
                  <Tooltip formatter={(v: number) => fmtInt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Bar dataKey="manhours" name="Man-hours" fill="#00cc79" radius={[0, 4, 4, 0]} barSize={16}>
                    {byBuilding.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>

        <Section title="สัดส่วน Man-hours ตามประเภทงาน">
          {byWorkType.length === 0 ? (
            <Empty label="ไม่มีข้อมูล" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byWorkType}
                    dataKey="manhours"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={86}
                    innerRadius={44}
                    paddingAngle={2}
                  >
                    {byWorkType.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtInt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>

      {incidentBars.length > 0 && (
        <Section title="สรุปอุบัติการณ์ (Incidents) ในช่วงที่เลือก">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incidentBars} margin={{ left: -8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" />
                <XAxis dataKey="name" fontSize={10} stroke="#94a3b8" interval={0} angle={-12} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} fontSize={11} stroke="#94a3b8" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="value" name="จำนวน" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}
    </div>
  );
}
