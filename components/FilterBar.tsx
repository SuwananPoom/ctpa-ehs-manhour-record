"use client";

import React from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { isoDaysAgo, todayISO } from "@/lib/format";
import { format, startOfMonth } from "date-fns";

export default function FilterBar() {
  const { filters, setFilters, resetFilters, contractors, buildings, workTypes, perms, session } =
    useApp();

  const preset = (from: string, to: string) => setFilters({ dateFrom: from, dateTo: to });
  const lockedContractor = perms.contractorScoped ? session?.contractorId || "" : null;

  return (
    <div className="card p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        <SlidersHorizontal size={14} /> ตัวกรองข้อมูล
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-1">
          <label className="label">จากวันที่</label>
          <input
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo}
            onChange={(e) => setFilters({ dateFrom: e.target.value })}
            className="input"
          />
        </div>
        <div className="col-span-1">
          <label className="label">ถึงวันที่</label>
          <input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom}
            max={todayISO()}
            onChange={(e) => setFilters({ dateTo: e.target.value })}
            className="input"
          />
        </div>
        <div className="col-span-1">
          <label className="label">Contractor</label>
          <select
            value={lockedContractor ?? filters.contractorId}
            disabled={!!lockedContractor}
            onChange={(e) => setFilters({ contractorId: e.target.value })}
            className="input"
          >
            <option value="">ทุกบริษัท</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-1">
          <label className="label">Building / Area</label>
          <select
            value={filters.buildingId}
            onChange={(e) => setFilters({ buildingId: e.target.value })}
            className="input"
          >
            <option value="">ทุกพื้นที่</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-1">
          <label className="label">Work Type</label>
          <select
            value={filters.workTypeId}
            onChange={(e) => setFilters({ workTypeId: e.target.value })}
            className="input"
          >
            <option value="">ทุกประเภทงาน</option>
            {workTypes.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-1">
          <label className="label">Shift</label>
          <select
            value={filters.shift}
            onChange={(e) => setFilters({ shift: e.target.value as any })}
            className="input"
          >
            <option value="ALL">ทั้งหมด</option>
            <option value="DAY">Day Shift</option>
            <option value="NIGHT">Night Shift</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-slate-400">เลือกช่วงด่วน:</span>
        <button className="chip bg-slate-100 text-slate-600 hover:bg-slate-200" onClick={() => preset(todayISO(), todayISO())}>
          วันนี้
        </button>
        <button className="chip bg-slate-100 text-slate-600 hover:bg-slate-200" onClick={() => preset(isoDaysAgo(6), todayISO())}>
          7 วัน
        </button>
        <button className="chip bg-slate-100 text-slate-600 hover:bg-slate-200" onClick={() => preset(isoDaysAgo(29), todayISO())}>
          30 วัน
        </button>
        <button
          className="chip bg-slate-100 text-slate-600 hover:bg-slate-200"
          onClick={() => preset(format(startOfMonth(new Date()), "yyyy-MM-dd"), todayISO())}
        >
          เดือนนี้
        </button>
        <button
          className="chip bg-slate-100 text-slate-600 hover:bg-slate-200"
          onClick={() => preset(isoDaysAgo(364), todayISO())}
        >
          1 ปี
        </button>
        <button className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600" onClick={resetFilters}>
          <RotateCcw size={13} /> ล้างตัวกรอง
        </button>
      </div>
    </div>
  );
}
