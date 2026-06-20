"use client";

import React, { useState } from "react";
import { ShieldCheck, HardHat, Eye, UserCog, Lock } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { logAudit } from "@/lib/audit";

const ROLE_CARDS: { role: Role; icon: React.ReactNode }[] = [
  { role: "ADMIN", icon: <UserCog size={20} /> },
  { role: "EHS_MANAGER", icon: <ShieldCheck size={20} /> },
  { role: "CONTRACTOR_SAFETY", icon: <HardHat size={20} /> },
  { role: "VIEWER", icon: <Eye size={20} /> },
];

export default function AuthGate() {
  const { settings, contractors, setSession } = useApp();
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [name, setName] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const needsPin = role === "ADMIN" || role === "EHS_MANAGER";
  const needsContractor = role === "CONTRACTOR_SAFETY";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (password.trim() !== (settings.auth?.app_password || "ctpa2026")) {
      setErr("รหัสผ่านเข้าใช้งานไม่ถูกต้อง");
      return;
    }
    if (needsPin && pin.trim() !== (settings.auth?.admin_pin || "2580")) {
      setErr("Admin PIN ไม่ถูกต้องสำหรับสิทธิ์นี้");
      return;
    }
    if (needsContractor && !contractorId) {
      setErr("กรุณาเลือกบริษัทผู้รับเหมาของคุณ");
      return;
    }
    const contractor = contractors.find((c) => c.id === contractorId);
    const session = {
      role,
      name: name.trim() || ROLE_LABELS[role],
      contractorId: needsContractor ? contractorId : null,
      contractorName: needsContractor ? contractor?.name || null : null,
    };
    setSession(session);
    logAudit(session, "LOGIN", "session", null, ROLE_LABELS[role]);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-soft">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">EHS Manhour & Safety KPI</h1>
          <p className="mt-1 text-sm text-slate-500">{settings.site_name}</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <div>
            <label className="label">รหัสผ่านเข้าใช้งาน (Shared password)</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-9"
                placeholder="••••••••"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="label">เลือกบทบาท (Role)</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_CARDS.map((rc) => (
                <button
                  type="button"
                  key={rc.role}
                  onClick={() => setRole(rc.role)}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                    role === rc.role
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span className={role === rc.role ? "text-brand-600" : "text-slate-400"}>
                    {rc.icon}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {ROLE_LABELS[rc.role]}
                  </span>
                  <span className="text-[11px] leading-tight text-slate-400">
                    {ROLE_DESCRIPTIONS[rc.role]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">ชื่อผู้ใช้งาน (แสดงในบันทึก)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder={ROLE_LABELS[role]}
            />
          </div>

          {needsContractor && (
            <div>
              <label className="label">บริษัทผู้รับเหมาของคุณ *</label>
              <select
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
                className="input"
              >
                <option value="">— เลือกบริษัท —</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsPin && (
            <div>
              <label className="label">Admin PIN *</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="input"
                placeholder="••••"
              />
            </div>
          )}

          {err && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>
          )}

          <button type="submit" className="btn-primary w-full">
            เข้าสู่ระบบ
          </button>
          <p className="text-center text-[11px] text-slate-400">
            ข้อมูลทั้งหมดบันทึกบน Supabase และ sync ทุกอุปกรณ์แบบเรียลไทม์
          </p>
        </form>
      </div>
    </div>
  );
}
