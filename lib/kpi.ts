import { LTI_TYPES, RECORDABLE_TYPES } from "./constants";
import { daysBetween, todayISO } from "./format";
import type {
  AppSettings,
  DailyWorkhour,
  Filters,
  Globals,
  Incident,
} from "./types";

// ---------- Filtering ----------

/** Apply the non-date filters (date range is applied server-side at fetch time). */
export function filterWorkhours(rows: DailyWorkhour[], f: Filters): DailyWorkhour[] {
  return rows.filter((r) => {
    if (f.contractorId && r.contractor_id !== f.contractorId) return false;
    if (f.buildingId && r.building_id !== f.buildingId) return false;
    if (f.workTypeId && r.work_type_id !== f.workTypeId) return false;
    if (f.shift === "DAY" && r.day_shift_manpower <= 0) return false;
    if (f.shift === "NIGHT" && r.night_shift_manpower <= 0) return false;
    return true;
  });
}

export function filterIncidents(rows: Incident[], f: Filters): Incident[] {
  return rows.filter((r) => {
    if (f.contractorId && r.contractor_id !== f.contractorId) return false;
    if (f.buildingId && r.building_id !== f.buildingId) return false;
    return true;
  });
}

// ---------- Shift-aware helpers ----------

export function effManpower(r: DailyWorkhour, shift: Filters["shift"]): number {
  if (shift === "DAY") return r.day_shift_manpower;
  if (shift === "NIGHT") return r.night_shift_manpower;
  return r.total_manpower;
}

export function effManhours(r: DailyWorkhour, shift: Filters["shift"]): number {
  const mp = effManpower(r, shift);
  return mp * (Number(r.working_hours) + Number(r.ot_hours));
}

// ---------- KPI result ----------

export interface KpiResult {
  // Manpower
  totalManpower: number; // sum of daily headcount (man-days) in range
  avgDailyManpower: number;
  peakDailyManpower: number;
  male: number;
  female: number;
  dayShift: number;
  nightShift: number;
  highRiskActivities: number;
  records: number;

  // Hours
  totalWorkingHours: number; // man-hours in range
  normalHours: number;
  otHours: number;
  accumulativeManhours: number; // project all-time + baseline
  rollingYearManhours: number;

  // Observations
  observations: number;
  observationRate: number; // per observation_basis hours

  // Incidents
  firstAid: number;
  medicalTreatment: number;
  lostTimeInjury: number;
  recordable: number;
  nearMiss: number;
  fatality: number;

  // Rates
  trir: number;
  ltir: number;
  daysWithoutLti: number;
  lastLtiDate: string | null;
}

export function computeKpi(
  rows: DailyWorkhour[],
  incidents: Incident[],
  observations: number,
  globals: Globals | null,
  settings: AppSettings,
  shift: Filters["shift"],
): KpiResult {
  const days = new Map<string, number>();
  let totalManpower = 0;
  let totalWorkingHours = 0;
  let normalHours = 0;
  let otHours = 0;
  let male = 0;
  let female = 0;
  let dayShift = 0;
  let nightShift = 0;
  let highRiskActivities = 0;

  for (const r of rows) {
    const mp = effManpower(r, shift);
    totalManpower += mp;
    totalWorkingHours += effManhours(r, shift);
    normalHours += mp * Number(r.working_hours);
    otHours += mp * Number(r.ot_hours);
    male += r.male;
    female += r.female;
    dayShift += r.day_shift_manpower;
    nightShift += r.night_shift_manpower;
    if (r.high_risk_activity) highRiskActivities += 1;
    days.set(r.work_date, (days.get(r.work_date) || 0) + mp);
  }

  const dayValues = Array.from(days.values());
  const peakDailyManpower = dayValues.length ? Math.max(...dayValues) : 0;
  const avgDailyManpower = dayValues.length
    ? Math.round(totalManpower / dayValues.length)
    : 0;

  // Incident counts
  const countType = (preds: string[]) =>
    incidents.filter((i) => preds.includes(i.incident_type)).length;
  const firstAid = countType(["FIRST_AID"]);
  const medicalTreatment = countType(["MEDICAL_TREATMENT"]);
  const lostTimeInjury = countType(["LOST_TIME_INJURY"]);
  const fatality = countType(["FATALITY"]);
  const nearMiss = countType(["NEAR_MISS"]);
  const recordable = countType(RECORDABLE_TYPES);
  const ltiCount = countType(LTI_TYPES);

  // Rates (guard against divide-by-zero)
  const safe = (num: number, den: number, basis: number) =>
    den > 0 ? (num * basis) / den : 0;

  const trir = safe(recordable, totalWorkingHours, settings.trir_basis);
  const ltir = safe(ltiCount, totalWorkingHours, settings.ltir_basis);
  const observationRate = safe(observations, totalWorkingHours, settings.observation_basis);

  // Days without LTI: latest of settings override / DB max LTI date
  const ltiDates = [settings.last_lti_date, globals?.last_lti_date].filter(
    Boolean,
  ) as string[];
  const lastLtiDate = ltiDates.length
    ? ltiDates.sort().slice(-1)[0]
    : null;
  let daysWithoutLti = 0;
  if (lastLtiDate) {
    daysWithoutLti = daysBetween(lastLtiDate, todayISO());
  } else if (globals?.first_record_date) {
    daysWithoutLti = daysBetween(globals.first_record_date, todayISO());
  }

  const accumulativeManhours =
    (globals?.accumulative_manhours || 0) + (settings.baseline_manhours || 0);
  const rollingYearManhours = globals?.rolling_year_manhours || 0;

  return {
    totalManpower,
    avgDailyManpower,
    peakDailyManpower,
    male,
    female,
    dayShift,
    nightShift,
    highRiskActivities,
    records: rows.length,
    totalWorkingHours,
    normalHours,
    otHours,
    accumulativeManhours,
    rollingYearManhours,
    observations,
    observationRate,
    firstAid,
    medicalTreatment,
    lostTimeInjury,
    recordable,
    nearMiss,
    fatality,
    trir,
    ltir,
    daysWithoutLti,
    lastLtiDate,
  };
}

// ---------- Grouped summaries ----------

export interface GroupSummary {
  key: string;
  label: string;
  manpower: number;
  manhours: number;
  records: number;
  highRisk: number;
  incidents: number;
  recordable: number;
}

function blank(key: string, label: string): GroupSummary {
  return {
    key,
    label,
    manpower: 0,
    manhours: 0,
    records: 0,
    highRisk: 0,
    incidents: 0,
    recordable: 0,
  };
}

export function groupBy(
  rows: DailyWorkhour[],
  incidents: Incident[],
  shift: Filters["shift"],
  dim: "contractor" | "building" | "worktype",
): GroupSummary[] {
  const idKey =
    dim === "contractor"
      ? "contractor_id"
      : dim === "building"
        ? "building_id"
        : "work_type_id";
  const nameKey =
    dim === "contractor"
      ? "contractor_name"
      : dim === "building"
        ? "building_name"
        : "work_type_name";

  const map = new Map<string, GroupSummary>();
  for (const r of rows) {
    const key = (r[idKey as keyof DailyWorkhour] as string) || "—";
    const label = (r[nameKey as keyof DailyWorkhour] as string) || "(ไม่ระบุ)";
    const g = map.get(key) || blank(key, label);
    g.manpower += effManpower(r, shift);
    g.manhours += effManhours(r, shift);
    g.records += 1;
    if (r.high_risk_activity) g.highRisk += 1;
    map.set(key, g);
  }

  // Attach incident counts (contractor/building dims only)
  if (dim === "contractor" || dim === "building") {
    const incIdKey = dim === "contractor" ? "contractor_id" : "building_id";
    for (const i of incidents) {
      const key = (i[incIdKey as keyof Incident] as string) || "—";
      const g = map.get(key);
      if (g) {
        g.incidents += 1;
        if (RECORDABLE_TYPES.includes(i.incident_type)) g.recordable += 1;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.manhours - a.manhours);
}

// ---------- Daily time series ----------

export interface DailyPoint {
  date: string;
  manpower: number;
  manhours: number;
}

export function dailySeries(rows: DailyWorkhour[], shift: Filters["shift"]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const r of rows) {
    const p = map.get(r.work_date) || { date: r.work_date, manpower: 0, manhours: 0 };
    p.manpower += effManpower(r, shift);
    p.manhours += effManhours(r, shift);
    map.set(r.work_date, p);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
