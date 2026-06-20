import { codeGroup, LAGGING_TYPES, LTI_TYPES, RECORDABLE_TYPES } from "./constants";
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
    if (r.incident_date < f.dateFrom || r.incident_date > f.dateTo) return false;
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

// ============================================================
// Incidents & Events Statistics
// ============================================================

export interface IncidentBucket {
  nearMiss: number;
  propertyDamage: number;
  firstAid: number;
  medicalTreatment: number;
  restrictedWork: number;
  recordable: number;
  lti: number;
  fatality: number;
  lossOfConsciousness: number;
  wps: number; // serious & potentially serious count
  total: number;
  lostWorkdays: number;
  trir: number;
  ltir: number;
  wpsRate: number;
}

export function incidentBucket(
  incidents: Incident[],
  hours: number,
  settings: AppSettings,
): IncidentBucket {
  const c = (t: string) => incidents.filter((i) => i.incident_type === t).length;
  const recordable = incidents.filter((i) => RECORDABLE_TYPES.includes(i.incident_type)).length;
  const lti = incidents.filter((i) => LTI_TYPES.includes(i.incident_type)).length;
  const lostWorkdays = incidents.reduce((s, i) => s + (i.lost_days || 0), 0);
  const trirBasis = settings.trir_basis || 200000;
  const ltirBasis = settings.ltir_basis || 1000000;
  return {
    nearMiss: c("NEAR_MISS"),
    propertyDamage: c("PROPERTY_DAMAGE"),
    firstAid: c("FIRST_AID"),
    medicalTreatment: c("MEDICAL_TREATMENT"),
    restrictedWork: c("RESTRICTED_WORK"),
    recordable,
    lti,
    fatality: c("FATALITY"),
    lossOfConsciousness: incidents.filter((i) => i.loss_of_consciousness).length,
    wps: incidents.filter((i) => i.serious_potential).length,
    total: incidents.length,
    lostWorkdays,
    trir: hours > 0 ? (recordable * trirBasis) / hours : 0,
    ltir: hours > 0 ? (lti * ltirBasis) / hours : 0,
    wpsRate: recordable > 0 ? lostWorkdays / recordable : 0,
  };
}

export function incidentsInRange(incidents: Incident[], from: string, to: string): Incident[] {
  return incidents.filter((i) => i.incident_date >= from && i.incident_date <= to);
}
export function incidentsUpTo(incidents: Incident[], to: string): Incident[] {
  return incidents.filter((i) => i.incident_date <= to);
}

export function filterIncidentsByDim(incidents: Incident[], f: Filters): Incident[] {
  return incidents.filter((i) => {
    if (f.contractorId && i.contractor_id !== f.contractorId) return false;
    if (f.buildingId && i.building_id !== f.buildingId) return false;
    return true;
  });
}

/** Count incidents per mechanism code (Type A/B). */
export function codeCounts(incidents: Incident[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const i of incidents) {
    if (!i.type_code) continue;
    m[i.type_code] = (m[i.type_code] || 0) + 1;
  }
  return m;
}

export interface NamedCount {
  name: string;
  value: number;
}

/** Distribution by mechanism code, for a pie chart. */
export function codeDistribution(incidents: Incident[]): NamedCount[] {
  const m = codeCounts(incidents);
  return Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/** Near-miss distribution by building/area, for a pie chart. */
export function nearMissDistribution(incidents: Incident[]): NamedCount[] {
  const m = new Map<string, number>();
  for (const i of incidents.filter((x) => x.incident_type === "NEAR_MISS")) {
    const k = i.building_name || "(ไม่ระบุ)";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export interface MonthlyIncidentPoint {
  month: string;
  total: number;
  leading: number; // near miss (proactive)
  lagging: number; // recordable (reactive)
  lti: number;
}

export function monthlyIncidentSeries(incidents: Incident[], months = 12): MonthlyIncidentPoint[] {
  const m = new Map<string, MonthlyIncidentPoint>();
  for (const i of incidents) {
    const month = i.incident_date.slice(0, 7); // YYYY-MM
    const p = m.get(month) || { month, total: 0, leading: 0, lagging: 0, lti: 0 };
    p.total += 1;
    if (i.incident_type === "NEAR_MISS") p.leading += 1;
    if (LAGGING_TYPES.includes(i.incident_type)) p.lagging += 1;
    if (LTI_TYPES.includes(i.incident_type)) p.lti += 1;
    m.set(month, p);
  }
  return Array.from(m.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-months);
}

/** Top-N incident categories (by mechanism code label fallback to incident_type). */
export function topCategories(incidents: Incident[], n = 5): NamedCount[] {
  const m = new Map<string, number>();
  for (const i of incidents) {
    const k = i.type_code || i.incident_type;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export function typeGroupCounts(
  incidents: Incident[],
  group: "A" | "B",
): Record<string, number> {
  const counts = codeCounts(incidents);
  const result: Record<string, number> = {};
  for (const [code, v] of Object.entries(counts)) {
    if (codeGroup(code) === group) result[code] = v;
  }
  return result;
}
