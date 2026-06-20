"use client";

import React, { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabaseClient";
import { filterIncidents } from "@/lib/kpi";
import { INCIDENT_LABELS, INCIDENT_ORDER, LTI_TYPES, RECORDABLE_TYPES } from "@/lib/constants";
import { fmtDate, todayISO } from "@/lib/format";
import { Badge, Empty, Modal, Section, useToast } from "@/components/ui";
import { logAudit } from "@/lib/audit";
import type { Incident, IncidentType } from "@/lib/types";

interface IForm {
  id: string | null;
  incident_date: string;
  contractor_id: string;
  building_id: string;
  incident_type: IncidentType;
  lost_days: number;
  description: string;
  corrective_action: string;
  reported_by: string;
}

function blank(reportedBy = ""): IForm {
  return {
    id: null,
    incident_date: todayISO(),
    contractor_id: "",
    building_id: "",
    incident_type: "NEAR_MISS",
    lost_days: 0,
    description: "",
    corrective_action: "",
    reported_by: reportedBy,
  };
}

function badgeColor(t: IncidentType) {
  if (LTI_TYPES.includes(t)) return "red" as const;
  if (RECORDABLE_TYPES.includes(t)) return "amber" as const;
  if (t === "NEAR_MISS") return "slate" as const;
  return "blue" as const;
}

export default function Incidents() {
  const { incidents, filters, contractors, buildings, perms, session, refresh } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<IForm>(blank());

  const rows = useMemo(() => filterIncidents(incidents, filters), [incidents, filters]);

  function openNew() {
    setForm(blank(session?.name || ""));
    setOpen(true);
  }
  function openEdit(r: Incident) {
    setForm({
      id: r.id,
      incident_date: r.incident_date,
      contractor_id: r.contractor_id || "",
      building_id: r.building_id || "",
      incident_type: r.incident_type,
      lost_days: r.lost_days,
      description: r.description || "",
      corrective_action: r.corrective_action || "",
      reported_by: r.reported_by || "",
    });
    setOpen(true);
  }
  function patch(p: Partial<IForm>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function save() {
    if (!form.incident_date) return toast("กรุณาระบุวันที่", "error");
    const contractor = contractors.find((c) => c.id === form.contractor_id);
    const building = buildings.find((b) => b.id === form.building_id);
    const payload = {
      incident_date: form.incident_date,
      contractor_id: form.contractor_id || null,
      contractor_name: contractor?.name || "",
      building_id: form.building_id || null,
      building_name: building?.name || "",
      incident_type: form.incident_type,
      lost_days: Math.max(0, Math.round(form.lost_days)),
      description: form.description || null,
      corrective_action: form.corrective_action || null,
      reported_by: form.reported_by || session?.name || null,
    };
    setSaving(true);
    try {
      if (form.id) {
        const { error } = await supabase.from("mh_incidents").update(payload).eq("id", form.id);
        if (error) throw error;
        await logAudit(session, "UPDATE", "incident", form.id, INCIDENT_LABELS[form.incident_type]);
        toast("บันทึกการแก้ไขแล้ว");
      } else {
        const { data, error } = await supabase
          .from("mh_incidents")
          .insert({ ...payload, created_by: session?.name || null })
          .select("id")
          .single();
        if (error) throw error;
        await logAudit(session, "CREATE", "incident", data?.id || null, INCIDENT_LABELS[form.incident_type]);
        toast("บันทึกอุบัติการณ์แล้ว");
      }
      setOpen(false);
      await refresh();
    } catch (e: any) {
      toast(e?.message || "บันทึกไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Incident) {
    if (!confirm(`ลบอุบัติการณ์วันที่ ${r.incident_date}?`)) return;
    const { error } = await supabase.from("mh_incidents").delete().eq("id", r.id);
    if (error) return toast(error.message, "error");
    await logAudit(session, "DELETE", "incident", r.id, INCIDENT_LABELS[r.incident_type]);
    toast("ลบแล้ว");
    await refresh();
  }

  return (
    <Section
      title="Incidents & Injuries"
      subtitle={`${rows.length} รายการ — ใช้คำนวณ TRIR / LTIR / Days without LTI`}
      right={
        perms.canEdit ? (
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} /> บันทึกอุบัติการณ์
          </button>
        ) : (
          <Badge color="slate">โหมดอ่านอย่างเดียว</Badge>
        )
      }
    >
      {rows.length === 0 ? (
        <Empty label="ไม่มีอุบัติการณ์ในช่วงที่เลือก — ถือเป็นเรื่องดี ✓" />
      ) : (
        <div className="-mx-4 overflow-x-auto scroll-thin sm:mx-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Contractor</th>
                <th className="px-3 py-2 font-medium">Area</th>
                <th className="px-3 py-2 text-right font-medium">Lost Days</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDate(r.incident_date)}</td>
                  <td className="px-3 py-2">
                    <Badge color={badgeColor(r.incident_type)}>{INCIDENT_LABELS[r.incident_type]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.contractor_name || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{r.building_name || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.lost_days || "—"}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-slate-600">{r.description || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {perms.canEdit && (
                      <button className="btn-ghost px-2 py-1" onClick={() => openEdit(r)}>
                        <Pencil size={15} />
                      </button>
                    )}
                    {perms.canDelete && (
                      <button className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => remove(r)}>
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

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? "แก้ไขอุบัติการณ์" : "บันทึกอุบัติการณ์"} size="lg">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Date *</label>
            <input type="date" max={todayISO()} className="input" value={form.incident_date} onChange={(e) => patch({ incident_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Incident Type *</label>
            <select className="input" value={form.incident_type} onChange={(e) => patch({ incident_type: e.target.value as IncidentType })}>
              {INCIDENT_ORDER.map((t) => (
                <option key={t} value={t}>
                  {INCIDENT_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Contractor</label>
            <select className="input" value={form.contractor_id} onChange={(e) => patch({ contractor_id: e.target.value })}>
              <option value="">— เลือก —</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
            <label className="label">Lost Days (สำหรับ LTI)</label>
            <input type="number" min={0} className="input" value={form.lost_days} onChange={(e) => patch({ lost_days: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Reported by</label>
            <input className="input" value={form.reported_by} onChange={(e) => patch({ reported_by: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea className="input min-h-[64px]" value={form.description} onChange={(e) => patch({ description: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Corrective Action</label>
            <textarea className="input min-h-[64px]" value={form.corrective_action} onChange={(e) => patch({ corrective_action: e.target.value })} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>
            ยกเลิก
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </Modal>
    </Section>
  );
}
