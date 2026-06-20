"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SITE_ID, supabase } from "@/lib/supabaseClient";
import { isoDaysAgo, todayISO } from "@/lib/format";
import type {
  AppSettings,
  AppUser,
  Building,
  Contractor,
  DailyWorkhour,
  Filters,
  Globals,
  Incident,
  Role,
  Session,
  Subcontractor,
  WorkType,
} from "@/lib/types";

const DEFAULT_BENCHMARKS: Record<string, number> = {
  CFSE: 0, VEH: 0, FFH: 0, SBMO: 0, SBFO: 0, CIBO: 0, SOD: 0, CRANE: 0, FE: 0,
  STF: 0, ETEC: 0, OTH: 0, CSBO: 0, MAC: 0, DODS: 0, ETBM: 0, ETET: 0, ETHS: 0, PA: 0,
  TRIR: 0.5, LTIR: 1.0, WPS: 0.15,
};

const DEFAULT_SETTINGS: AppSettings = {
  site_name: "CTPA BKK22 – Chonburi Tech Park",
  trir_basis: 200000,
  ltir_basis: 1000000,
  observation_basis: 250000,
  baseline_manhours: 0,
  baseline_observations: 0,
  manhour_target: 2000000,
  rolling_year_days: 365,
  last_lti_date: null,
  targets: { trir: 0.2, ltir: 0.2, observation_rate: 20, wps: 0.15 },
  benchmarks: DEFAULT_BENCHMARKS,
  auth: { app_password: "ctpa2026", admin_pin: "2580" },
};

interface Permissions {
  canEdit: boolean;
  canDelete: boolean;
  canAdmin: boolean;
  contractorScoped: boolean;
}

interface AppContextValue {
  // session
  session: Session | null;
  setSession: (s: Session | null) => void;
  perms: Permissions;
  // settings
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  // master data
  contractors: Contractor[];
  subcontractors: Subcontractor[];
  buildings: Building[];
  workTypes: WorkType[];
  users: AppUser[];
  // transactional (within filter date range)
  workhours: DailyWorkhour[];
  incidents: Incident[];
  observationCount: number;
  globals: Globals | null;
  // filters
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  // status
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshMaster: () => Promise<void>;
  getStatHours: (
    weekStart: string,
    weekEnd: string,
    contractorId?: string,
    buildingId?: string,
    workTypeId?: string,
  ) => Promise<StatHours | null>;
}

export interface StatHours {
  week_hours: number;
  cumulative_hours: number;
  week_manpower: number;
}

const AppContext = createContext<AppContextValue | null>(null);

const defaultFilters: Filters = {
  dateFrom: isoDaysAgo(29),
  dateTo: todayISO(),
  contractorId: "",
  buildingId: "",
  workTypeId: "",
  shift: "ALL",
};

function permsFor(role: Role | undefined): Permissions {
  return {
    canEdit: role === "ADMIN" || role === "EHS_MANAGER" || role === "CONTRACTOR_SAFETY",
    canDelete: role === "ADMIN" || role === "EHS_MANAGER",
    canAdmin: role === "ADMIN",
    contractorScoped: role === "CONTRACTOR_SAFETY",
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);

  const [workhours, setWorkhours] = useState<DailyWorkhour[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [observationCount, setObservationCount] = useState(0);
  const [globals, setGlobals] = useState<Globals | null>(null);

  const [filters, setFiltersState] = useState<Filters>(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ----- restore session + filters -----
  useEffect(() => {
    try {
      const s = localStorage.getItem("mh_session");
      if (s) setSessionState(JSON.parse(s));
      const f = localStorage.getItem("mh_filters");
      if (f) setFiltersState({ ...defaultFilters, ...JSON.parse(f) });
    } catch {
      /* ignore */
    }
  }, []);

  const setSession = useCallback((s: Session | null) => {
    setSessionState(s);
    try {
      if (s) localStorage.setItem("mh_session", JSON.stringify(s));
      else localStorage.removeItem("mh_session");
    } catch {
      /* ignore */
    }
  }, []);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem("mh_filters", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilters);
    try {
      localStorage.removeItem("mh_filters");
    } catch {
      /* ignore */
    }
  }, []);

  // ----- master data + settings -----
  const refreshMaster = useCallback(async () => {
    const [c, s, b, w, u, st] = await Promise.all([
      supabase.from("mh_contractors").select("*").order("name"),
      supabase.from("mh_subcontractors").select("*").order("name"),
      supabase.from("mh_buildings").select("*").order("sort_order"),
      supabase.from("mh_work_types").select("*").order("sort_order"),
      supabase.from("mh_users").select("*").order("name"),
      supabase.from("mh_settings").select("config").eq("id", SITE_ID).maybeSingle(),
    ]);
    if (c.data) setContractors(c.data as Contractor[]);
    if (s.data) setSubcontractors(s.data as Subcontractor[]);
    if (b.data) setBuildings(b.data as Building[]);
    if (w.data) setWorkTypes(w.data as WorkType[]);
    if (u.data) setUsers(u.data as AppUser[]);
    if (st.data?.config) {
      const cfg = st.data.config as Partial<AppSettings>;
      setSettings({
        ...DEFAULT_SETTINGS,
        ...cfg,
        targets: { ...DEFAULT_SETTINGS.targets, ...(cfg.targets || {}) },
        benchmarks: { ...DEFAULT_SETTINGS.benchmarks, ...(cfg.benchmarks || {}) },
        auth: { ...DEFAULT_SETTINGS.auth, ...(cfg.auth || {}) },
      });
    }
  }, []);

  // ----- transactional data within date range -----
  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [wh, inc, obs, g] = await Promise.all([
        supabase
          .from("mh_daily_workhours")
          .select("*")
          .gte("work_date", filters.dateFrom)
          .lte("work_date", filters.dateTo)
          .order("work_date", { ascending: false })
          .limit(20000),
        // All-time incidents (low volume) — enables cumulative statistics dashboard
        supabase
          .from("mh_incidents")
          .select("*")
          .order("incident_date", { ascending: false })
          .limit(5000),
        supabase
          .from("observations")
          .select("*", { count: "exact", head: true })
          .gte("obs_date", filters.dateFrom)
          .lte("obs_date", filters.dateTo),
        supabase.rpc("mh_globals"),
      ]);
      if (wh.error) throw wh.error;
      setWorkhours((wh.data as DailyWorkhour[]) || []);
      setIncidents((inc.data as Incident[]) || []);
      setObservationCount(obs.count || 0);
      if (g.data) setGlobals(g.data as Globals);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [filters.dateFrom, filters.dateTo]);

  // initial + on date-range change
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await Promise.all([refreshMaster(), refresh()]);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refresh, refreshMaster]);

  // ----- realtime sync across devices -----
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const ping = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        refresh();
      }, 600);
    };
    const channel = supabase
      .channel("mh-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "mh_daily_workhours" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "mh_incidents" }, ping)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const saveSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await supabase
        .from("mh_settings")
        .upsert({ id: SITE_ID, config: next, updated_at: new Date().toISOString() });
    },
    [settings],
  );

  const getStatHours = useCallback(
    async (
      weekStart: string,
      weekEnd: string,
      contractorId?: string,
      buildingId?: string,
      workTypeId?: string,
    ): Promise<StatHours | null> => {
      const { data, error } = await supabase.rpc("mh_stat_hours", {
        p_week_start: weekStart,
        p_week_end: weekEnd,
        p_contractor: contractorId || null,
        p_building: buildingId || null,
        p_worktype: workTypeId || null,
      });
      if (error) return null;
      return data as StatHours;
    },
    [],
  );

  const perms = useMemo(() => permsFor(session?.role), [session?.role]);

  const value: AppContextValue = {
    session,
    setSession,
    perms,
    settings,
    saveSettings,
    contractors,
    subcontractors,
    buildings,
    workTypes,
    users,
    workhours,
    incidents,
    observationCount,
    globals,
    filters,
    setFilters,
    resetFilters,
    loading,
    error,
    refresh,
    refreshMaster,
    getStatHours,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
