"use client";

import React, { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, AlertTriangle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabaseClient";
import { filterWorkhours } from "@/lib/kpi";
import { fmtDate, fmtInt, todayISO } from "@/lib/format";
import { Badge, Empty, Modal, Section, useToast } from "@/components/ui";
import { logAudit } from "@/lib/audit";
import type { DailyWorkhour } from "@/lib/types";

interface FormState {
  id: string | null;
  work_date: string;
  contractor_id: string;
  subcontractor_name: string;
  building_id: string;
  work_type_id: string;
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
}

function blankForm(contractorId = "", submittedBy = ""): FormState {
  return {
    id: null,
    work_date: todayISO(),
    contractor_id: contractorId,
    subcontractor_name: "",
    building_id: "",
    work_type_id: "",
    main_activity: "",
    day_shift_manpower: 0,
    night_shift_manpower: 0,
    male: 0,
    female: 0,
    working_hours: 10,
    ot_hours: 0,
    high_risk_activity: false,
    remark: "",
    submitted_by: submittedBy,
  };
}

export default function DataEntry() {
  const {
    workhours,
    filters,
    contractors,
    subcontractors,
    buildings,
    workTypes,
    perms,
    session,
    refresh,
  } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm());
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const base = filterWorkhours(workhours, filters);
    if (!q.trim()) return base;
    const s = q.toLowerCase();
    return base.filter(
      (r) =>
        r.contractor_name.toLowerCase().includes(s) ||
        (r.subcontractor_name || "").toLowerCase().includes(s) ||
        r.building_name.toLowerCase().includes(s) ||
        r.work_type_name.toLowerCase().includes(s) ||
        (r.main_activity || "").toLowerCase().includes(s),
    );
  }, [workhours, filters, q]);

  const totalManpower = form.day_shift_manpower + form.night_shift_manpower;
  const totalManhours = totalManpower * (form.working_hours + form.ot_hours);

  function openNew() {
    setForm(
      blankForm(
        perms.contractorScoped ? session?.contractorId || "" : "",
        session?.name || "",
      ),
    );
    setOpen(true);
  }

  function openEdit(r: DailyWorkhour) {
    setForm({
      id: r.id,
      work_date: r.work_date,
      contractor_id: r.contractor_id || "",
      subcontractor_name: r.subcontractor_name || "",
      building_id: r.building_id || "",
      work_type_id: r.work_type_id || "",
      main_activity: r.main_activity || "",
      day_shift_manpower: r.day_shift_manpower,
      night_shift_manpower: r.night_shift_manpower,
      male: r.male,
      female: r.female,
      working_hours: Number(r.working_hours),
      ot_hours: Number(r.ot_hours),
      high_risk_activity: r.high_risk_activity,
      remark: r.remark || "",
      submitted_by: r.submitted_by || "",
    });
    setOpen(true);
  }

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  // Auto-flag high risk when a high-risk work type is chosen
  function onWorkTypeChange(id: string) {
    const wt = workTypes.find((w) => w.id === id);
    patch({ work_type_id: id, high_risk_activity: wt?.high_risk || form.high_risk_activity });
  }

  async function save() {
    if (!form.work_date) return toast("กรุณาระบุวันที่", "error");
    if (!form.contractor_id) return toast("กรุณาเลือก Contractor", "error");
    if (form.day_shift_manpower + form.night_shift_manpower <= 0)
      return toast("กรุณาระบุจำนวน Manpower", "error");

    const contractor = contractors.find((c) => c.id === form.contractor_id);
    const building = buildings.find((b) => b.id === form.building_id);
    const workType = workTypes.find((w) => w.id === form.work_type_id);
    const sub = subcontractors.find(
      (s) => s.name === form.subcontractor_name && s.contractor_id === form.contractor_id,
    );

    const payload = {
      work_date: form.work_date,
      contractor_id: form.contractor_id,
      contractor_name: contractor?.name || "",
      subcontractor_id: sub?.id || null,
      subcontractor_name: form.subcontractor_name || null,
      building_id: form.building_id || null,
      building_name: building?.name || "",
      work_type_id: form.work_type_id || null,
      work_type_name: workType?.name || "",
      main_activity: form.main_activity || null,
      day_shift_manpower: Math.max(0, Math.round(form.day_shift_manpower)),
      night_shift_manpower: Math.max(0, Math.round(form.night_shift_manpower)),
      male: Math.max(0, Math.round(form.male)),
      female: Math.max(0, Math.round(form.female)),
      working_hours: form.working_hours,
      ot_hours: form.ot_hours,
      high_risk_activity: form.high_risk_activity,
      remark: form.remark || null,
      submitted_by: form.submitted_by || session?.name || null,
    };

    setSaving(true);
    try {
      if (form.id) {
        const { error } = await supabase.from("mh_daily_workhours").update(payload).eq("id", form.id);
        if (error) throw error;
        await logAudit(session, "UPDATE", "daily_workhours", form.id, payload.contractor_name);
        toast("บันทึกการแก้ไขแล้ว");
      } else {
        const { data, error } = await supabase
          .from("mh_daily_workhours")
          .insert({ ...payload, created_by: session?.name || null })
          .select("id")
          .single();
        if (error) throw error;
        await logAudit(session, "CREATE", "daily_workhours", data?.id || null, payload.contractor_name);
        toast("เพิ่มข้อมูลรายวันแล้ว");
      }
      setOpen(false);
      await refresh();
    } catch (e: any) {
      toast(e?.message || "บันทึกไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: DailyWorkhour) {
    if (!confirm(`ลบข้อมูลของ ${r.contractor_name} วันที่ ${r.work_date}?`)) return;
    const { error } = await supabase.from("mh_daily_workhours").delete().eq("id", r.id);
    if (error) return toast(error.message, "error");
    await logAudit(session, "DELETE", "daily_workhours", r.id, r.contractor_name);
    toast("ลบข้อมูลแล้ว");
    await refresh();
  }

  const subOptions = subcontractors.filter((s) => s.contractor_id === form.contractor_id);

  return (
    <Section
      title="Daily Manpower & Working Hours"
      subtitle={`${rows.length} รายการ`}
      right={
        perms.canEdit ? (
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} /> เพิ่มข้อมูล
          </button>
        ) : (
          <Badge color="slate">โหมดอ่านอย่างเดียว</Badge>
        )
      }
    >
      <div className="mb-3 relative">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="ค้นหา contractor / พื้นที่ / กิจกรรม…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <Empty label="ยังไม่มีข้อมูลในช่วง/ตัวกรองที่เลือก" />
      ) : (
        <div className="-mx-4 overflow-x-auto scroll-thin sm:mx-0">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Contractor</th>
                <th className="px-3 py-2 font-medium">Area</th>
                <th className="px-3 py-2 font-medium">Work Type</th>
                <th className="px-3 py-2 text-right font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Night</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Man-hrs</th>
                <th className="px-3 py-2 text-center font-medium">Risk</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDate(r.work_date)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.contractor_name}</div>
                    {r.subcontractor_name && (
                      <div className="text-xs text-slate-400">{r.subcontractor_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.building_name || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.work_type_name || "—"}
                    {r.main_activity && (
                      <div className="max-w-[160px] truncate text-xs text-slate-400">{r.main_activity}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.day_shift_manpower)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.night_shift_manpower)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{fmtInt(r.total_manpower)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-sky-700">{fmtInt(r.total_manhours)}</td>
                  <td className="px-3 py-2 text-center">
                    {r.high_risk_activity ? <Badge color="red">High</Badge> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {perms.canEdit && (
                      <button className="btn-ghost px-2 py-1" onClick={() => openEdit(r)} title="แก้ไข">
                        <Pencil size={15} />
                      </button>
                    )}
                    {perms.canDelete && (
                      <button className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => remove(r)} title="ลบ">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? "แก้ไขข้อมูลรายวัน" : "เพิ่มข้อมูลรายวัน"} size="lg">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Date *</label>
            <input type="date" max={todayISO()} className="input" value={form.work_date} onChange={(e) => patch({ work_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Contractor *</label>
            <select
              className="input"
              value={form.contractor_id}
              disabled={perms.contractorScoped}
              onChange={(e) => patch({ contractor_id: e.target.value, subcontractor_name: "" })}
            >
              <option value="">— เลือก —</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Subcontractor</label>
            <input
              className="input"
              list="sub-list"
              value={form.subcontractor_name}
              onChange={(e) => patch({ subcontractor_name: e.target.value })}
              placeholder="พิมพ์หรือเลือก"
            />
            <datalist id="sub-list">
              {subOptions.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Building / Area</label>
            <select className="input" value={form.building_id} onChange={(e) => patch({ building_id: e.target.value })}>
              <option value="">— เลือก —</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Work Type</label>
            <select className="input" value={form.work_type_id} onChange={(e) => onWorkTypeChange(e.target.value)}>
              <option value="">— เลือก —</option>
              {workTypes.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.high_risk ? " ⚠" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Main Activity</label>
            <input className="input" value={form.main_activity} onChange={(e) => patch({ main_activity: e.target.value })} placeholder="เช่น Formwork Level 2" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <div>
              <label className="label">Day Shift Manpower</label>
              <input type="number" min={0} className="input" value={form.day_shift_manpower} onChange={(e) => patch({ day_shift_manpower: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Night Shift Manpower</label>
              <input type="number" min={0} className="input" value={form.night_shift_manpower} onChange={(e) => patch({ night_shift_manpower: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Male</label>
              <input type="number" min={0} className="input" value={form.male} onChange={(e) => patch({ male: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Female</label>
              <input type="number" min={0} className="input" value={form.female} onChange={(e) => patch({ female: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Working Hours / คน</label>
              <input type="number" min={0} step={0.5} className="input" value={form.working_hours} onChange={(e) => patch({ working_hours: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">OT Hours / คน</label>
              <input type="number" min={0} step={0.5} className="input" value={form.ot_hours} onChange={(e) => patch({ ot_hours: Number(e.target.value) })} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 sm:col-span-2">
            <span className="text-sm text-slate-600">
              Total Manpower: <b className="text-slate-900">{fmtInt(totalManpower)}</b> คน
            </span>
            <span className="text-sm text-slate-600">
              Total Man-hours: <b className="text-sky-700">{fmtInt(totalManhours)}</b>
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-red-500" checked={form.high_risk_activity} onChange={(e) => patch({ high_risk_activity: e.target.checked })} />
            <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
              <AlertTriangle size={15} className="text-red-500" /> High Risk Activity
            </span>
          </label>

          <div className="sm:col-span-2">
            <label className="label">Remark</label>
            <textarea className="input min-h-[64px]" value={form.remark} onChange={(e) => patch({ remark: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Submitted by</label>
            <input className="input" value={form.submitted_by} onChange={(e) => patch({ submitted_by: e.target.value })} placeholder={session?.name || ""} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>
            ยกเลิก
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "กำลังบันทึก…" : form.id ? "บันทึกการแก้ไข" : "เพิ่มข้อมูล"}
          </button>
        </div>
      </Modal>
    </Section>
  );
}
