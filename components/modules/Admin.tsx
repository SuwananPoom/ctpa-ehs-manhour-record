"use client";

import React, { useState } from "react";
import { Database, Plus, Save, Trash2, Wrench, Users2, Sliders, Activity } from "lucide-react";
import Diagnostics from "@/components/modules/Diagnostics";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabaseClient";
import { ALL_INCIDENT_CODES, ROLE_LABELS } from "@/lib/constants";
import { isoDaysAgo } from "@/lib/format";
import { Badge, Empty, Section, useToast } from "@/components/ui";
import { logAudit } from "@/lib/audit";
import type { AppSettings, ContractorType, Role } from "@/lib/types";

type Tab = "master" | "users" | "settings" | "tools" | "diagnostics";

export default function Admin() {
  const app = useApp();
  const { perms } = app;
  const [tab, setTab] = useState<Tab>("master");

  if (!perms.canAdmin) {
    return (
      <Section title="Admin">
        <Empty label="เฉพาะ Admin เท่านั้นที่เข้าถึงส่วนนี้ได้" />
      </Section>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "master", label: "ข้อมูลหลัก", icon: <Database size={15} /> },
    { key: "users", label: "ผู้ใช้งาน", icon: <Users2 size={15} /> },
    { key: "settings", label: "KPI Settings", icon: <Sliders size={15} /> },
    { key: "tools", label: "เครื่องมือ", icon: <Wrench size={15} /> },
    { key: "diagnostics", label: "Diagnostics", icon: <Activity size={15} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key ? "bg-brand-500 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === "master" && <MasterData />}
      {tab === "users" && <UsersPanel />}
      {tab === "settings" && <SettingsPanel />}
      {tab === "tools" && <ToolsPanel />}
      {tab === "diagnostics" && <Diagnostics />}
    </div>
  );
}

// ---------------- Master data ----------------
function MasterData() {
  const { contractors, buildings, workTypes, refreshMaster, session } = useApp();
  const toast = useToast();
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState<ContractorType>("CONTRACTOR");
  const [bName, setBName] = useState("");
  const [bCat, setBCat] = useState("BUILDING");
  const [wName, setWName] = useState("");
  const [wRisk, setWRisk] = useState(false);

  async function add(table: string, payload: any, reset: () => void, label: string) {
    const { error } = await supabase.from(table).insert(payload);
    if (error) return toast(error.message, "error");
    await logAudit(session, "CREATE", table, null, label);
    reset();
    await refreshMaster();
    toast("เพิ่มแล้ว");
  }
  async function del(table: string, id: string, label: string) {
    if (!confirm(`ลบ "${label}"? (ข้อมูลที่อ้างอิงจะถูกตั้งเป็นว่าง)`)) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast(error.message, "error");
    await logAudit(session, "DELETE", table, id, label);
    await refreshMaster();
    toast("ลบแล้ว");
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Section title="Contractors">
        <div className="mb-3 flex gap-2">
          <input className="input" placeholder="ชื่อบริษัท" value={cName} onChange={(e) => setCName(e.target.value)} />
          <select className="input w-32" value={cType} onChange={(e) => setCType(e.target.value as ContractorType)}>
            <option value="GC">GC</option>
            <option value="CONTRACTOR">Contractor</option>
            <option value="SUBCONTRACTOR">Sub</option>
          </select>
          <button className="btn-primary px-3" disabled={!cName.trim()} onClick={() => add("mh_contractors", { name: cName.trim(), type: cType }, () => setCName(""), cName.trim())}>
            <Plus size={16} />
          </button>
        </div>
        <ul className="space-y-1.5">
          {contractors.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
              <span className="text-slate-700">
                {c.name} <Badge color="slate">{c.type}</Badge>
              </span>
              <button className="text-red-400 hover:text-red-600" onClick={() => del("mh_contractors", c.id, c.name)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buildings / Areas">
        <div className="mb-3 flex gap-2">
          <input className="input" placeholder="ชื่อพื้นที่" value={bName} onChange={(e) => setBName(e.target.value)} />
          <select className="input w-32" value={bCat} onChange={(e) => setBCat(e.target.value)}>
            <option value="BUILDING">Building</option>
            <option value="AREA">Area</option>
            <option value="FACILITY">Facility</option>
          </select>
          <button className="btn-primary px-3" disabled={!bName.trim()} onClick={() => add("mh_buildings", { name: bName.trim(), category: bCat, sort_order: buildings.length + 1 }, () => setBName(""), bName.trim())}>
            <Plus size={16} />
          </button>
        </div>
        <ul className="space-y-1.5">
          {buildings.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
              <span className="text-slate-700">
                {b.name} <Badge color="slate">{b.category}</Badge>
              </span>
              <button className="text-red-400 hover:text-red-600" onClick={() => del("mh_buildings", b.id, b.name)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Work Types">
        <div className="mb-3 flex gap-2">
          <input className="input" placeholder="ชื่อประเภทงาน" value={wName} onChange={(e) => setWName(e.target.value)} />
          <label className="flex items-center gap-1 whitespace-nowrap text-xs text-slate-600">
            <input type="checkbox" className="accent-red-500" checked={wRisk} onChange={(e) => setWRisk(e.target.checked)} /> High risk
          </label>
          <button className="btn-primary px-3" disabled={!wName.trim()} onClick={() => add("mh_work_types", { name: wName.trim(), high_risk: wRisk, sort_order: workTypes.length + 1 }, () => { setWName(""); setWRisk(false); }, wName.trim())}>
            <Plus size={16} />
          </button>
        </div>
        <ul className="space-y-1.5">
          {workTypes.map((w) => (
            <li key={w.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
              <span className="text-slate-700">
                {w.name} {w.high_risk && <Badge color="red">High</Badge>}
              </span>
              <button className="text-red-400 hover:text-red-600" onClick={() => del("mh_work_types", w.id, w.name)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ---------------- Users ----------------
function UsersPanel() {
  const { users, contractors, refreshMaster, session } = useApp();
  const toast = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [contractorId, setContractorId] = useState("");

  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("mh_users").insert({ name: name.trim(), role, contractor_id: contractorId || null });
    if (error) return toast(error.message, "error");
    await logAudit(session, "CREATE", "user", null, `${name} (${role})`);
    setName("");
    setContractorId("");
    await refreshMaster();
    toast("เพิ่มผู้ใช้แล้ว");
  }
  async function del(id: string, label: string) {
    if (!confirm(`ลบผู้ใช้ "${label}"?`)) return;
    const { error } = await supabase.from("mh_users").delete().eq("id", id);
    if (error) return toast(error.message, "error");
    await refreshMaster();
    toast("ลบแล้ว");
  }

  return (
    <Section title="ผู้ใช้งาน (User Directory)" subtitle="จัดการรายชื่อและบทบาท — ใช้สำหรับอ้างอิง/Submitted by (การเข้าระบบใช้รหัสผ่านร่วม)">
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input className="input" placeholder="ชื่อ-นามสกุล" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select className="input" value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
          <option value="">— ไม่ระบุบริษัท —</option>
          {contractors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={add}>
          <Plus size={16} /> เพิ่มผู้ใช้
        </button>
      </div>
      {users.length === 0 ? (
        <Empty label="ยังไม่มีผู้ใช้" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-700">
                {u.name} <Badge color="blue">{ROLE_LABELS[u.role]}</Badge>
                {u.contractor_id && (
                  <span className="ml-1 text-xs text-slate-400">
                    {contractors.find((c) => c.id === u.contractor_id)?.name}
                  </span>
                )}
              </span>
              <button className="text-red-400 hover:text-red-600" onClick={() => del(u.id, u.name)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------- Settings ----------------
function SettingsPanel() {
  const { settings, saveSettings, session } = useApp();
  const toast = useToast();
  const [s, setS] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  function set(p: Partial<AppSettings>) {
    setS((prev) => ({ ...prev, ...p }));
  }

  async function save() {
    setSaving(true);
    try {
      await saveSettings(s);
      await logAudit(session, "UPDATE", "settings", null, "kpi config");
      toast("บันทึกการตั้งค่าแล้ว");
    } catch (e: any) {
      toast(e?.message || "บันทึกไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="KPI Settings" subtitle="ตัวคูณ/ฐานการคำนวณ และเป้าหมาย" right={<button className="btn-primary" onClick={save} disabled={saving}><Save size={16} /> {saving ? "กำลังบันทึก…" : "บันทึก"}</button>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="ชื่อโครงการ / Site">
          <input className="input" value={s.site_name} onChange={(e) => set({ site_name: e.target.value })} />
        </Field>
        <Field label="TRIR / LTIR Basis (ชม.)">
          <input type="number" className="input" value={s.trir_basis} onChange={(e) => set({ trir_basis: Number(e.target.value), ltir_basis: Number(e.target.value) })} />
        </Field>
        <Field label="Observation Basis (ชม.)">
          <input type="number" className="input" value={s.observation_basis} onChange={(e) => set({ observation_basis: Number(e.target.value) })} />
        </Field>
        <Field label="Baseline Man-hours (ก่อนเริ่มใช้ระบบ)">
          <input type="number" className="input" value={s.baseline_manhours} onChange={(e) => set({ baseline_manhours: Number(e.target.value) })} />
        </Field>
        <Field label="Man-Hours Target (เป้าหมายรวม)">
          <input type="number" className="input" value={s.manhour_target} onChange={(e) => set({ manhour_target: Number(e.target.value) })} />
        </Field>
        <Field label="LTI ล่าสุด (override)">
          <input type="date" className="input" value={s.last_lti_date || ""} onChange={(e) => set({ last_lti_date: e.target.value || null })} />
        </Field>
        <Field label="เป้าหมาย TRIR ≤">
          <input type="number" step={0.01} className="input" value={s.targets.trir} onChange={(e) => set({ targets: { ...s.targets, trir: Number(e.target.value) } })} />
        </Field>
        <Field label="เป้าหมาย LTIR ≤">
          <input type="number" step={0.01} className="input" value={s.targets.ltir} onChange={(e) => set({ targets: { ...s.targets, ltir: Number(e.target.value) } })} />
        </Field>
        <Field label="เป้าหมาย WPS Rate ≤">
          <input type="number" step={0.01} className="input" value={s.targets.wps} onChange={(e) => set({ targets: { ...s.targets, wps: Number(e.target.value) } })} />
        </Field>
        <Field label="รหัสผ่านเข้าใช้งาน (Shared)">
          <input className="input" value={s.auth.app_password} onChange={(e) => set({ auth: { ...s.auth, app_password: e.target.value } })} />
        </Field>
        <Field label="Admin PIN">
          <input className="input" value={s.auth.admin_pin} onChange={(e) => set({ auth: { ...s.auth, admin_pin: e.target.value } })} />
        </Field>
      </div>
      <div className="mt-5">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Benchmark Values (Industry / Target)</h4>
        <p className="mb-2 text-xs text-slate-400">ใช้ในแท็บ Statistics เพื่อเทียบ Project CTP กับค่า Benchmark และคำนวณ Variance %</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {(["TRIR", "LTIR", "WPS", ...ALL_INCIDENT_CODES.map((c) => c.code)] as string[]).map((key) => (
            <div key={key}>
              <label className="label font-mono">{key}</label>
              <input
                type="number"
                step={0.01}
                className="input"
                value={s.benchmarks[key] ?? 0}
                onChange={(e) => set({ benchmarks: { ...s.benchmarks, [key]: Number(e.target.value) } })}
              />
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        ⚠ รหัสผ่าน/PIN ถูกตรวจสอบฝั่ง client (โมเดลน้ำหนักเบา) เหมาะสำหรับใช้งานภายในทีม — แนะนำให้เปลี่ยนค่าเริ่มต้น
      </p>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

// ---------------- Tools ----------------
function ToolsPanel() {
  const { contractors, buildings, workTypes, refresh, session } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function loadSample() {
    if (!confirm("เพิ่มข้อมูลตัวอย่าง ~20 สัปดาห์ เพื่อทดสอบ Dashboard ทั้งหมด (Man-Hours / Statistics)? ลบออกได้ภายหลัง")) return;
    setBusy(true);
    try {
      const gc = contractors[0];
      const wt = workTypes;
      const bs = buildings;
      const rows: any[] = [];
      const DAYS = 140; // ~20 weeks
      for (let d = DAYS - 1; d >= 0; d--) {
        const date = isoDaysAgo(d);
        if (new Date(date).getDay() === 0) continue; // skip Sundays
        const ramp = (DAYS - d) / DAYS; // grows over time, like a ramping project
        const crews = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < crews; k++) {
          const w = wt[Math.floor(Math.random() * wt.length)];
          const b = bs[Math.floor(Math.random() * bs.length)];
          const base = 12 + Math.round(ramp * 85);
          const day = base + Math.floor(Math.random() * 18);
          const night = Math.floor(Math.random() * (1 + ramp * 12));
          const total = day + night;
          rows.push({
            work_date: date,
            contractor_id: gc?.id || null,
            contractor_name: gc?.name || "Main Contractor (GC)",
            building_id: b?.id || null,
            building_name: b?.name || "",
            work_type_id: w?.id || null,
            work_type_name: w?.name || "",
            main_activity: "Sample activity",
            day_shift_manpower: day,
            night_shift_manpower: night,
            male: total - Math.floor(total * 0.1),
            female: Math.floor(total * 0.1),
            working_hours: 10,
            ot_hours: Math.random() > 0.6 ? 2 : 0,
            high_risk_activity: !!w?.high_risk,
            remark: "SAMPLE",
            submitted_by: "Sample",
            created_by: "SAMPLE",
          });
        }
      }
      const { error } = await supabase.from("mh_daily_workhours").insert(rows);
      if (error) throw error;

      // A few sample incidents across the period (for the Statistics dashboard)
      const codes = ["FFH", "STF", "SBFO", "VEH", "MAC", "ETEC"];
      const types = ["NEAR_MISS", "FIRST_AID", "MEDICAL_TREATMENT", "NEAR_MISS", "RESTRICTED_WORK", "LOST_TIME_INJURY"];
      const inc = codes.map((code, i) => ({
        incident_date: isoDaysAgo(8 + i * 20),
        contractor_id: gc?.id || null,
        contractor_name: gc?.name || "",
        building_id: bs[i % bs.length]?.id || null,
        building_name: bs[i % bs.length]?.name || "",
        incident_type: types[i],
        type_code: code,
        lost_days: types[i] === "LOST_TIME_INJURY" ? 5 : 0,
        serious_potential: i === 5,
        description: "Sample incident",
        reported_by: "Sample",
        created_by: "SAMPLE",
      }));
      await supabase.from("mh_incidents").insert(inc);

      await logAudit(session, "IMPORT", "daily_workhours", null, `sample ${rows.length}`);
      toast(`เพิ่มข้อมูลตัวอย่าง ${rows.length} แถว + ${inc.length} incidents`);
      await refresh();
    } catch (e: any) {
      toast(e?.message || "ไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearSample() {
    if (!confirm("ลบเฉพาะข้อมูลตัวอย่าง (created_by = SAMPLE) ทั้งหมด?")) return;
    setBusy(true);
    const a = await supabase.from("mh_daily_workhours").delete().eq("created_by", "SAMPLE");
    const b = await supabase.from("mh_incidents").delete().eq("created_by", "SAMPLE");
    if (a.error || b.error) toast(a.error?.message || b.error?.message || "error", "error");
    else {
      toast("ลบข้อมูลตัวอย่างแล้ว");
      await refresh();
    }
    setBusy(false);
  }

  return (
    <Section title="เครื่องมือ" subtitle="ข้อมูลตัวอย่างสำหรับทดสอบ — ไม่กระทบข้อมูลจริง">
      <div className="flex flex-wrap gap-2">
        <button className="btn-outline" onClick={loadSample} disabled={busy}>
          <Database size={16} /> โหลดข้อมูลตัวอย่าง 14 วัน
        </button>
        <button className="btn-danger" onClick={clearSample} disabled={busy}>
          <Trash2 size={16} /> ลบข้อมูลตัวอย่าง
        </button>
      </div>
    </Section>
  );
}
