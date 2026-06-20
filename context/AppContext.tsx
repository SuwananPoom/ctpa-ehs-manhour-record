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

const DEFAULT_SETTINGS: AppSettings = {
  site_name: "CTPA BKK22 – Chonburi Tech Park",
  trir_basis: 200000,
  ltir_basis: 200000,
  observation_basis: 250000,
  baseline_manhours: 0,
  baseline_observations: 0,
  rolling_year_days: 365,
  last_lti_date: null,
  targets: { trir: 0.5, ltir: 0.2, observation_rate: 20 },
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
    if (st.data?.config) setSettings({ ...DEFAULT_SETTINGS, ...(st.data.config as AppSettings) });
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
        supabase
          .from("mh_incidents")
          .select("*")
          .gte("incident_date", filters.dateFrom)
          .lte("incident_date", filters.dateTo)
          .order("incident_date", { ascending: false }),
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
