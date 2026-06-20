"use client";

import React, { useState } from "react";
import {
  Building2,
  ClipboardList,
  FileSpreadsheet,
  HardHat,
  LayoutDashboard,
  LogOut,
  MapPin,
  RefreshCw,
  Settings,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { MODULE_TABS, ROLE_LABELS, type ModuleKey } from "@/lib/constants";
import { Badge } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import Dashboard from "@/components/modules/Dashboard";
import DataEntry from "@/components/modules/DataEntry";
import Incidents from "@/components/modules/Incidents";
import ImportExport from "@/components/modules/ImportExport";
import Admin from "@/components/modules/Admin";
import { ContractorSummary, BuildingSummary, WorkTypeSummary } from "@/components/modules/Summaries";

const ICONS: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={17} />,
  ClipboardList: <ClipboardList size={17} />,
  TriangleAlert: <TriangleAlert size={17} />,
  Building2: <Building2 size={17} />,
  MapPin: <MapPin size={17} />,
  HardHat: <HardHat size={17} />,
  FileSpreadsheet: <FileSpreadsheet size={17} />,
  Settings: <Settings size={17} />,
};

export default function AppShell() {
  const { session, setSession, settings, loading, error, refresh, perms } = useApp();
  const [tab, setTab] = useState<ModuleKey>("dashboard");
  const [refreshing, setRefreshing] = useState(false);

  const tabs = MODULE_TABS.filter((t) => t.key !== "admin" || perms.canAdmin);
  const showFilters = tab !== "admin";

  async function doRefresh() {
    setRefreshing(true);
    await refresh();
    setTimeout(() => setRefreshing(false), 400);
  }

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
            <ShieldCheck size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-slate-800 sm:text-base">
              EHS Manhour & Safety KPI
            </h1>
            <p className="truncate text-[11px] text-slate-400">{settings.site_name}</p>
          </div>
          <button
            onClick={doRefresh}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={17} className={refreshing || loading ? "animate-spin" : ""} />
          </button>
          <div className="hidden text-right sm:block">
            <div className="text-xs font-semibold text-slate-700">{session?.name}</div>
            <Badge color="green">{session ? ROLE_LABELS[session.role] : ""}</Badge>
          </div>
          <button
            onClick={() => setSession(null)}
            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
            title="ออกจากระบบ"
          >
            <LogOut size={17} />
          </button>
        </div>

        {/* Tabs */}
        <nav className="mx-auto max-w-7xl overflow-x-auto scroll-thin px-2 sm:px-5">
          <div className="flex gap-1 pb-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition ${
                  tab === t.key
                    ? "border-brand-500 text-brand-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {ICONS[t.icon]} {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}
        {showFilters && <FilterBar />}

        {tab === "dashboard" && <Dashboard />}
        {tab === "entry" && <DataEntry />}
        {tab === "incidents" && <Incidents />}
        {tab === "contractor" && <ContractorSummary />}
        {tab === "building" && <BuildingSummary />}
        {tab === "worktype" && <WorkTypeSummary />}
        {tab === "io" && <ImportExport />}
        {tab === "admin" && <Admin />}

        <footer className="py-6 text-center text-[11px] text-slate-400">
          CTPA EHS Manhour Record · ข้อมูลบันทึกบน Supabase และ sync ทุกอุปกรณ์แบบเรียลไทม์
        </footer>
      </main>
    </div>
  );
}
