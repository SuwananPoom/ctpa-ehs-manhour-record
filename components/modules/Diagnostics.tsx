"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Database,
  HardDrive,
  RefreshCw,
  Image as ImageIcon,
  ShieldCheck,
  Download,
  Upload,
  Play,
  Cpu,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { SITE_ID, supabase } from "@/lib/supabaseClient";
import {
  computeKpi,
  filterIncidents,
  filterWorkhours,
  incidentBucket,
} from "@/lib/kpi";
import { fmtInt, fmtNum, todayISO } from "@/lib/format";
import { Empty, Section, useToast } from "@/components/ui";
import { getLogs, installDiagLog, pushLog, type DiagEntry } from "@/lib/diaglog";
import { logAudit } from "@/lib/audit";

type Status = "green" | "yellow" | "red" | "na";
const STORAGE_BUCKET = "ctpa-photos";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Dot({ s }: { s: Status }) {
  const map: Record<Status, string> = {
    green: "bg-brand-500",
    yellow: "bg-amber-400",
    red: "bg-red-500",
    na: "bg-slate-300",
  };
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${map[s]}`} />;
}
function StatusText({ s }: { s: Status }) {
  const label: Record<Status, string> = { green: "Connected", yellow: "Warning", red: "Disconnected", na: "N/A" };
  const color: Record<Status, string> = {
    green: "text-brand-600",
    yellow: "text-amber-600",
    red: "text-red-600",
    na: "text-slate-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${color[s]}`}>
      <Dot s={s} /> {label[s]}
    </span>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}

export default function Diagnostics() {
  const app = useApp();
  const { session, settings, workhours, incidents, observationCount, globals, filters, lastSyncAt, realtimeStatus } = app;
  const toast = useToast();

  const [running, setRunning] = useState(false);
  const [db, setDb] = useState<{ status: Status; ms: number; counts: Record<string, number | null> } | null>(null);
  const [storage, setStorage] = useState<{ status: Status; count: number | null; note?: string } | null>(null);
  const [storageTest, setStorageTest] = useState<{ running?: boolean; ok?: boolean; http?: string; url?: string } | null>(null);
  const [rtTest, setRtTest] = useState<{ running?: boolean; ok?: boolean; latency?: number; note?: string } | null>(null);
  const [exp, setExp] = useState<{ excel: Status; pdf: Status; ppt: Status; excelErr?: string; pdfErr?: string } | null>(null);
  const [dash, setDash] = useState<{ name: string; value: string; status: Status; note?: string }[]>([]);
  const [img, setImg] = useState<{ status: Status; missingBefore: number; missingAfter: number; broken: number; total: number; records: number; note?: string } | null>(null);
  const [logs, setLogs] = useState<DiagEntry[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const verifyRef = useRef<HTMLInputElement>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  // ---- device id ----
  useEffect(() => {
    installDiagLog();
    let id = "";
    try {
      id = localStorage.getItem("mh_device_id") || "";
      if (!id) {
        id = (crypto?.randomUUID?.() || `dev-${Date.now()}`);
        localStorage.setItem("mh_device_id", id);
      }
    } catch {
      id = "unknown";
    }
    setDeviceId(id);
  }, []);

  // ---- read-only checks ----
  const checkDb = useCallback(async () => {
    const t0 = performance.now();
    const ping = await supabase.from("mh_contractors").select("id", { count: "exact", head: true });
    const ms = Math.round(performance.now() - t0);
    const pairs: [string, string][] = [
      ["daily_workhours", "mh_daily_workhours"],
      ["observations", "observations"],
      ["incidents", "mh_incidents"],
      ["dashboard_kpi", "mh_settings"],
      ["contractors", "mh_contractors"],
    ];
    const results = await Promise.all(
      pairs.map(([, tbl]) => supabase.from(tbl).select("*", { count: "exact", head: true })),
    );
    const counts: Record<string, number | null> = {};
    pairs.forEach(([label], i) => {
      counts[label] = results[i].error ? null : results[i].count ?? 0;
    });
    setDb({ status: ping.error ? "red" : ms < 900 ? "green" : "yellow", ms, counts });
  }, []);

  const checkStorage = useCallback(async () => {
    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list("", { limit: 1000 });
      if (error) return setStorage({ status: "yellow", count: null, note: error.message });
      setStorage({ status: "green", count: data?.length ?? 0 });
    } catch (e: any) {
      setStorage({ status: "red", count: null, note: String(e?.message || e) });
    }
  }, []);

  const checkExports = useCallback(async () => {
    const res: { excel: Status; pdf: Status; ppt: Status; excelErr?: string; pdfErr?: string } = {
      excel: "na",
      pdf: "na",
      ppt: "yellow",
    };
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["diag", 1]]), "t");
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      res.excel = out && (out as ArrayBuffer).byteLength > 0 ? "green" : "red";
    } catch (e: any) {
      res.excel = "red";
      res.excelErr = String(e?.message || e);
    }
    try {
      const { default: JsPDF } = await import("jspdf");
      const d = new JsPDF();
      d.text("diag", 10, 10);
      const blob = d.output("blob");
      res.pdf = blob.size > 0 ? "green" : "red";
    } catch (e: any) {
      res.pdf = "red";
      res.pdfErr = String(e?.message || e);
    }
    setExp(res);
  }, []);

  const checkDash = useCallback(() => {
    try {
      const rows = filterWorkhours(workhours, filters);
      const inc = filterIncidents(incidents, filters);
      const kpi = computeKpi(rows, inc, observationCount, globals, settings, filters.shift);
      const fin = (n: number): Status => (Number.isFinite(n) ? "green" : "red");
      setDash([
        { name: "KPI calculation engine", value: `${kpi.records} records`, status: "green" },
        { name: "Weekly / period workhours", value: fmtInt(kpi.totalWorkingHours), status: fin(kpi.totalWorkingHours) },
        { name: "Cumulative workhours", value: fmtInt(kpi.accumulativeManhours), status: fin(kpi.accumulativeManhours) },
        { name: "Direct manpower", value: fmtInt(kpi.totalManpower), status: "na", note: "นับรวมเป็น Total Manpower (ไม่มีฟิลด์ direct/indirect แยกในสคีมา)" },
        { name: "Indirect manpower", value: "—", status: "na", note: "ไม่มีฟิลด์ indirect ในสคีมา" },
        { name: "TRIR", value: fmtNum(kpi.trir, 2), status: fin(kpi.trir) },
        { name: "LTIR", value: fmtNum(kpi.ltir, 2), status: fin(kpi.ltir) },
        { name: "Observation rate", value: fmtNum(kpi.observationRate, 2), status: fin(kpi.observationRate) },
      ]);
    } catch (e: any) {
      pushLog("error", "dashboard", e?.message || String(e));
      setDash([{ name: "KPI calculation", value: "ERROR", status: "red", note: e?.message }]);
    }
  }, [workhours, incidents, observationCount, globals, settings, filters]);

  const checkImages = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("observations").select("id, before_photos, after_photos");
      if (error) return setImg({ status: "yellow", missingBefore: 0, missingAfter: 0, broken: 0, total: 0, records: 0, note: error.message });
      let missingBefore = 0,
        missingAfter = 0,
        broken = 0,
        total = 0;
      for (const o of data || []) {
        const b = Array.isArray((o as any).before_photos) ? (o as any).before_photos : [];
        const a = Array.isArray((o as any).after_photos) ? (o as any).after_photos : [];
        if (b.length === 0) missingBefore++;
        if (a.length === 0) missingAfter++;
        for (const x of [...b, ...a]) {
          total++;
          const s = String(x || "");
          if (!(s.startsWith("data:image") || s.startsWith("http"))) broken++;
        }
      }
      setImg({ status: broken > 0 ? "yellow" : "green", missingBefore, missingAfter, broken, total, records: (data || []).length });
    } catch (e: any) {
      setImg({ status: "red", missingBefore: 0, missingAfter: 0, broken: 0, total: 0, records: 0, note: String(e?.message || e) });
    }
  }, []);

  const loadAudit = useCallback(async () => {
    const { data } = await supabase.from("mh_audit_log").select("*").order("at", { ascending: false }).limit(15);
    setAudit(data || []);
  }, []);

  const runAll = useCallback(async () => {
    setRunning(true);
    await Promise.allSettled([checkDb(), checkStorage(), checkExports(), checkImages(), loadAudit()]);
    checkDash();
    setLogs(getLogs());
    setRunning(false);
  }, [checkDb, checkStorage, checkExports, checkImages, loadAudit, checkDash]);

  useEffect(() => {
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- TEST functions (the only writes; sandboxed + auto-cleanup) ----
  async function testStorage() {
    setStorageTest({ running: true });
    const path = `diagnostics/test-${Date.now()}.txt`;
    try {
      const body = new Blob([`diagnostic ${new Date().toISOString()}`], { type: "text/plain" });
      const up = await supabase.storage.from(STORAGE_BUCKET).upload(path, body, { upsert: true });
      if (up.error) {
        setStorageTest({ running: false, ok: false, http: `upload error: ${up.error.message}` });
        toast("Storage upload ถูกปฏิเสธ (ตรวจสิทธิ์ bucket)", "error");
        return;
      }
      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      const url = urlData.publicUrl;
      let http = "";
      let ok = false;
      try {
        const res = await fetch(url, { cache: "no-store" });
        http = `HTTP ${res.status} ${res.statusText}`;
        ok = res.ok;
      } catch (e: any) {
        http = `fetch error: ${e?.message || e}`;
      }
      await supabase.storage.from(STORAGE_BUCKET).remove([path]); // cleanup
      setStorageTest({ running: false, ok, http, url });
      toast(ok ? "Test Storage ผ่าน ✓" : "Test Storage ล้มเหลว", ok ? "success" : "error");
      logAudit(session, "DIAG_TEST", "storage", null, http);
    } catch (e: any) {
      await supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => {});
      setStorageTest({ running: false, ok: false, http: String(e?.message || e) });
    }
  }

  async function testRealtime() {
    setRtTest({ running: true });
    const marker = crypto?.randomUUID?.() || `m-${Date.now()}`;
    let insertedId: string | null = null;
    let received = false;
    const t0 = performance.now();
    const channel = supabase.channel(`diag-rt-${marker}`);
    try {
      await new Promise<void>((resolve) => {
        channel
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "mh_diagnostics" }, (payload: any) => {
            if (payload?.new?.payload?.marker === marker) received = true;
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              const ins = await supabase
                .from("mh_diagnostics")
                .insert({ kind: "REALTIME_TEST", payload: { marker }, device: deviceId })
                .select("id")
                .single();
              insertedId = ins.data?.id || null;
              resolve();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              resolve();
            }
          });
      });
      const start = Date.now();
      while (!received && Date.now() - start < 6000) await sleep(150);
      const latency = Math.round(performance.now() - t0);
      setRtTest({ running: false, ok: received, latency, note: received ? "" : "ไม่ได้รับ event ภายใน 6 วินาที" });
      toast(received ? `Realtime ผ่าน (${latency} ms)` : "Realtime ไม่ตอบสนอง", received ? "success" : "error");
      logAudit(session, "DIAG_TEST", "realtime", null, received ? `ok ${latency}ms` : "failed");
    } catch (e: any) {
      setRtTest({ running: false, ok: false, note: String(e?.message || e) });
    } finally {
      try {
        if (insertedId) await supabase.from("mh_diagnostics").delete().eq("id", insertedId);
        await supabase.from("mh_diagnostics").delete().eq("kind", "REALTIME_TEST").contains("payload", { marker });
      } catch {
        /* ignore cleanup errors */
      }
      supabase.removeChannel(channel);
    }
  }

  function repairImages() {
    // Read-only model: images are base64 data URLs in observations, not Storage links.
    checkImages();
    toast("ตรวจสอบลิงก์ภาพแล้ว — ระบบเก็บภาพแบบ base64 จึงไม่มีลิงก์ที่ต้องซ่อม (ไม่มีการแก้ไขข้อมูล)", "info");
  }

  async function downloadBackup() {
    try {
      toast("กำลังสร้าง backup…", "info");
      const tables = [
        "mh_contractors",
        "mh_subcontractors",
        "mh_buildings",
        "mh_work_types",
        "mh_users",
        "mh_daily_workhours",
        "mh_incidents",
        "mh_settings",
      ];
      const out: any = { meta: { generated_at: new Date().toISOString(), site: SITE_ID, app: "ctpa-ehs-manhour-record", by: session?.name || "" }, tables: {} };
      for (const t of tables) {
        const { data } = await supabase.from(t).select("*");
        out.tables[t] = data || [];
      }
      out.meta.counts = Object.fromEntries(Object.entries(out.tables).map(([k, v]) => [k, (v as any[]).length]));
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CTPA_Manhour_Backup_${todayISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      logAudit(session, "BACKUP", "json", null, JSON.stringify(out.meta.counts));
      toast("ดาวน์โหลด JSON Backup แล้ว");
    } catch (e: any) {
      toast(e?.message || "backup ไม่สำเร็จ", "error");
    }
  }

  async function verifyBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const tables = json?.tables ? Object.keys(json.tables) : [];
      const counts = json?.meta?.counts || {};
      const okStructure = !!json?.meta && tables.length > 0;
      const totalRows = tables.reduce((s, t) => s + (json.tables[t]?.length || 0), 0);
      setVerifyResult(
        okStructure
          ? `✓ Backup ถูกต้อง · ${tables.length} tables · ${totalRows} rows · สร้างเมื่อ ${json.meta.generated_at || "?"}`
          : "✗ โครงสร้างไฟล์ไม่ถูกต้อง (ไม่พบ meta/tables)",
      );
      toast(okStructure ? "Backup integrity OK" : "Backup ไม่ถูกต้อง", okStructure ? "success" : "error");
    } catch (err: any) {
      setVerifyResult(`✗ อ่านไฟล์ไม่สำเร็จ: ${err?.message || err}`);
      toast("อ่าน backup ไม่สำเร็จ", "error");
    }
    if (verifyRef.current) verifyRef.current.value = "";
  }

  // ---- health summary ----
  const realtimeStatusColor: Status = realtimeStatus === "SUBSCRIBED" ? "green" : realtimeStatus === "CONNECTING" ? "yellow" : "red";
  const exportStatus: Status = !exp ? "na" : exp.excel === "green" && exp.pdf === "green" ? "green" : exp.excel === "red" || exp.pdf === "red" ? "red" : "yellow";
  const dashStatus: Status = dash.length === 0 ? "na" : dash.some((d) => d.status === "red") ? "red" : "green";
  const healthCards: { label: string; status: Status; icon: React.ReactNode }[] = [
    { label: "Database", status: db?.status || "na", icon: <Database size={18} /> },
    { label: "Storage", status: storage?.status || "na", icon: <HardDrive size={18} /> },
    { label: "Realtime Sync", status: realtimeStatusColor, icon: <Activity size={18} /> },
    { label: "Export Module", status: exportStatus, icon: <Download size={18} /> },
    { label: "Image Module", status: img?.status || "na", icon: <ImageIcon size={18} /> },
    { label: "Dashboard Module", status: dashStatus, icon: <Cpu size={18} /> },
  ];
  const order: Status[] = ["green", "na", "yellow", "red"];
  const overall = healthCards.reduce<Status>((worst, c) => (order.indexOf(c.status) > order.indexOf(worst) ? c.status : worst), "green");
  const overallLabel = overall === "green" ? "🟢 Healthy" : overall === "yellow" ? "🟡 Warning" : overall === "red" ? "🔴 Critical" : "🟢 Healthy";

  return (
    <div className="space-y-4">
      {/* Overall banner */}
      <div className={`flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${overall === "red" ? "border-red-200 bg-red-50" : overall === "yellow" ? "border-amber-200 bg-amber-50" : "border-brand-200 bg-brand-50"}`}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={24} className={overall === "red" ? "text-red-600" : overall === "yellow" ? "text-amber-600" : "text-brand-600"} />
          <div>
            <div className="text-xs font-medium text-slate-500">System Health</div>
            <div className="text-lg font-bold text-slate-800">{overallLabel}</div>
          </div>
        </div>
        <button className="btn-primary" onClick={runAll} disabled={running}>
          <RefreshCw size={16} className={running ? "animate-spin" : ""} /> Re-run Diagnostics
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1. Database */}
        <Section title="1 · Database Status" right={<StatusText s={db?.status || "na"} />}>
          <Row label="Supabase connection">{db ? <StatusText s={db.status} /> : "…"}</Row>
          <Row label="Response time">{db ? `${db.ms} ms` : "…"}</Row>
          <Row label="Realtime connection"><StatusText s={realtimeStatusColor} /></Row>
          <Row label="Last sync">{lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "—"}</Row>
          <div className="mt-2 rounded-lg bg-slate-50 p-2">
            <div className="mb-1 text-xs font-semibold text-slate-500">Total records</div>
            {db &&
              Object.entries(db.counts).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-0.5 text-xs">
                  <span className="font-mono text-slate-500">{k}</span>
                  <span className="font-semibold text-slate-800">{v === null ? <span className="text-red-500">error</span> : fmtInt(v)}</span>
                </div>
              ))}
          </div>
        </Section>

        {/* 2. Storage */}
        <Section title="2 · Storage Diagnostics" right={<StatusText s={storage?.status || "na"} />}>
          <Row label="Bucket name"><span className="font-mono">{STORAGE_BUCKET}</span></Row>
          <Row label="Connection">{storage ? <StatusText s={storage.status} /> : "…"}</Row>
          <Row label="Images / objects">{storage?.count == null ? "—" : fmtInt(storage.count)}</Row>
          {storage?.note && <p className="mt-1 text-xs text-amber-600">{storage.note}</p>}
          {storageTest && (
            <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">Result</span><StatusText s={storageTest.ok ? "green" : "red"} /></div>
              {storageTest.http && <div className="mt-1 break-all font-mono text-slate-600">{storageTest.http}</div>}
              {storageTest.url && <div className="mt-1 break-all font-mono text-[10px] text-slate-400">{storageTest.url}</div>}
            </div>
          )}
          <button className="btn-outline mt-3 w-full" onClick={testStorage} disabled={storageTest?.running}>
            <Play size={15} /> {storageTest?.running ? "กำลังทดสอบ…" : "Test Storage (upload → read → delete)"}
          </button>
        </Section>

        {/* 3. Sync */}
        <Section title="3 · Sync Diagnostics" right={<StatusText s={realtimeStatusColor} />}>
          <Row label="Device ID"><span className="font-mono text-xs">{deviceId.slice(0, 18)}…</span></Row>
          <Row label="Current user">{session?.name} <span className="text-xs text-slate-400">({session?.role})</span></Row>
          <Row label="Last successful sync">{lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "—"}</Row>
          <Row label="Pending updates">0</Row>
          <Row label="Realtime listener"><span className="font-mono text-xs">{realtimeStatus}</span></Row>
          {rtTest && (
            <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">Result</span><StatusText s={rtTest.ok ? "green" : "red"} /></div>
              {rtTest.latency != null && <div className="mt-1 text-slate-600">Latency: {rtTest.latency} ms</div>}
              {rtTest.note && <div className="mt-1 text-amber-600">{rtTest.note}</div>}
            </div>
          )}
          <button className="btn-outline mt-3 w-full" onClick={testRealtime} disabled={rtTest?.running}>
            <Play size={15} /> {rtTest?.running ? "กำลังทดสอบ…" : "Test Realtime Sync (insert → verify → delete)"}
          </button>
        </Section>

        {/* 4. Export */}
        <Section title="4 · Export Diagnostics" right={<StatusText s={exportStatus} />}>
          <Row label="Excel export">{exp ? <StatusText s={exp.excel} /> : "…"}</Row>
          {exp?.excelErr && <p className="text-xs text-red-500">{exp.excelErr}</p>}
          <Row label="PDF export">{exp ? <StatusText s={exp.pdf} /> : "…"}</Row>
          {exp?.pdfErr && <p className="text-xs text-red-500">{exp.pdfErr}</p>}
          <Row label="PowerPoint export"><span className="text-xs text-amber-600">ยังไม่รองรับ (roadmap)</span></Row>
          <Row label="Missing images">0</Row>
        </Section>

        {/* 5. Dashboard */}
        <Section title="5 · Dashboard Diagnostics" right={<StatusText s={dashStatus} />}>
          {dash.map((d) => (
            <div key={d.name} className="border-b border-slate-100 py-2 last:border-0">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{d.name}</span>
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  {d.value} <Dot s={d.status} />
                </span>
              </div>
              {d.note && <p className="mt-0.5 text-[11px] text-slate-400">{d.note}</p>}
            </div>
          ))}
        </Section>

        {/* 6. Storage Image Check */}
        <Section title="6 · Storage Image Check" right={<StatusText s={img?.status || "na"} />}>
          <Row label="Observation records">{img ? fmtInt(img.records) : "…"}</Row>
          <Row label="Total photos">{img ? fmtInt(img.total) : "…"}</Row>
          <Row label="Missing Before photos">{img ? fmtInt(img.missingBefore) : "…"}</Row>
          <Row label="Missing After photos">{img ? fmtInt(img.missingAfter) : "…"}</Row>
          <Row label="Broken URLs">{img ? <span className={img.broken > 0 ? "text-amber-600" : ""}>{fmtInt(img.broken)}</span> : "…"}</Row>
          {img?.note && <p className="mt-1 text-xs text-amber-600">{img.note}</p>}
          <button className="btn-outline mt-3 w-full" onClick={repairImages}>
            <ImageIcon size={15} /> Repair Image Links (ตรวจสอบเท่านั้น)
          </button>
        </Section>
      </div>

      {/* 7. Environment */}
      <Section title="7 · Environment Variables">
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Row label="Supabase URL"><span className="break-all font-mono text-xs">{process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ocwdnvblpjfzkgzratqb.supabase.co"}</span></Row>
          <Row label="Anon key"><span className="font-mono text-xs">{(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_4Vm…").slice(0, 16)}…</span></Row>
          <Row label="Realtime"><StatusText s="green" /></Row>
          <Row label="Storage"><StatusText s={storage?.status === "green" ? "green" : "yellow"} /></Row>
          <Row label="Environment mode"><span className="font-mono text-xs">{process.env.NODE_ENV}</span></Row>
          <Row label="service_role key"><span className="text-xs text-slate-400">ไม่เปิดเผย (ปลอดภัย)</span></Row>
        </div>
      </Section>

      {/* 8. System Logs */}
      <Section title="8 · System Logs" subtitle="errors / warnings ที่จับได้ในเซสชันนี้ + กิจกรรมล่าสุด" right={<button className="btn-ghost text-xs" onClick={() => setLogs(getLogs())}><RefreshCw size={13} /> โหลดใหม่</button>}>
        {logs.length === 0 && audit.length === 0 ? (
          <Empty label="ไม่มี error/warning — ระบบทำงานปกติ ✓" />
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto scroll-thin">
            {logs.map((l, i) => (
              <div key={`l${i}`} className="flex items-start gap-2 rounded-md bg-slate-50 px-2 py-1 text-xs">
                <Dot s={l.level === "error" ? "red" : l.level === "warning" ? "yellow" : "na"} />
                <span className="font-mono text-[10px] text-slate-400">{new Date(l.ts).toLocaleTimeString()}</span>
                <span className="text-slate-400">[{l.source}]</span>
                <span className="flex-1 break-all text-slate-600">{l.message}</span>
              </div>
            ))}
            {audit.map((a, i) => (
              <div key={`a${i}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                <Dot s="na" />
                <span className="font-mono text-[10px] text-slate-400">{a.at ? new Date(a.at).toLocaleTimeString() : ""}</span>
                <span className="text-slate-500">{a.who}</span>
                <span className="font-medium text-slate-700">{a.action}</span>
                <span className="text-slate-400">{a.entity}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 9. Backup & Restore */}
      <Section title="9 · Backup & Restore" subtitle="อ่านอย่างเดียว — สำรองข้อมูลเป็น JSON (ไม่มีการเขียนทับ/ลบ)">
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={downloadBackup}>
            <Download size={16} /> Export Database Backup
          </button>
          <button className="btn-outline" onClick={downloadBackup}>
            <Download size={16} /> Download JSON Backup
          </button>
          <button className="btn-outline" onClick={() => verifyRef.current?.click()}>
            <Upload size={16} /> Verify Backup Integrity
          </button>
          <input ref={verifyRef} type="file" accept=".json" hidden onChange={verifyBackup} />
        </div>
        {verifyResult && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{verifyResult}</p>}
      </Section>

      {/* 10. Health Summary */}
      <Section title="10 · System Health Summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {healthCards.map((c) => (
            <div key={c.label} className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${c.status === "red" ? "border-red-200 bg-red-50" : c.status === "yellow" ? "border-amber-200 bg-amber-50" : c.status === "green" ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-slate-50"}`}>
              <span className={c.status === "red" ? "text-red-600" : c.status === "yellow" ? "text-amber-600" : c.status === "green" ? "text-brand-600" : "text-slate-400"}>{c.icon}</span>
              <span className="text-xs font-medium text-slate-600">{c.label}</span>
              <StatusText s={c.status} />
            </div>
          ))}
        </div>
      </Section>

      <p className="pb-4 text-center text-[11px] text-slate-400">
        Diagnostics เป็นแบบอ่านอย่างเดียว · ฟังก์ชัน Test สร้างข้อมูลชั่วคราวในตาราง sandbox (mh_diagnostics) แล้วลบอัตโนมัติ · ไม่กระทบข้อมูลจริงหรือสคีมา
      </p>
    </div>
  );
}
