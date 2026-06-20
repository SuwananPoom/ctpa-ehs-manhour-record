import type { IncidentType, Role } from "./types";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  EHS_MANAGER: "EHS Manager",
  CONTRACTOR_SAFETY: "Contractor Safety",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "แก้ไข / ลบ / จัดการข้อมูลหลัก / Export ได้ทั้งหมด",
  EHS_MANAGER: "เพิ่ม / แก้ไข / ลบ / Export ได้ (ไม่จัดการผู้ใช้)",
  CONTRACTOR_SAFETY: "เพิ่ม/แก้ไขข้อมูลของบริษัทตัวเองได้",
  VIEWER: "ดู Dashboard และรายงานเท่านั้น",
};

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  NEAR_MISS: "Near Miss",
  FIRST_AID: "First Aid Case",
  MEDICAL_TREATMENT: "Medical Treatment Case",
  RESTRICTED_WORK: "Restricted Work Case",
  LOST_TIME_INJURY: "Lost Time Injury (LTI)",
  FATALITY: "Fatality",
  PROPERTY_DAMAGE: "Property Damage",
  ENVIRONMENTAL: "Environmental",
};

// OSHA-style classification used by the KPI engine.
export const RECORDABLE_TYPES: IncidentType[] = [
  "MEDICAL_TREATMENT",
  "RESTRICTED_WORK",
  "LOST_TIME_INJURY",
  "FATALITY",
];

export const LTI_TYPES: IncidentType[] = ["LOST_TIME_INJURY", "FATALITY"];

export const INCIDENT_ORDER: IncidentType[] = [
  "NEAR_MISS",
  "FIRST_AID",
  "MEDICAL_TREATMENT",
  "RESTRICTED_WORK",
  "LOST_TIME_INJURY",
  "FATALITY",
  "PROPERTY_DAMAGE",
  "ENVIRONMENTAL",
];

// ---- Incident mechanism classification (cause/energy) ----
export interface IncidentCode {
  code: string;
  label: string;
}

export const TYPE_A_INCIDENTS: IncidentCode[] = [
  { code: "CFSE", label: "Collapse / Failure of structure & equipment" },
  { code: "VEH", label: "Vehicle Incidents" },
  { code: "FFH", label: "Falls From Height" },
  { code: "SBMO", label: "Struck By Moving Object" },
  { code: "SBFO", label: "Struck By Falling Object" },
  { code: "CIBO", label: "Caught In Between Objects" },
  { code: "SOD", label: "Suffocation / Drowning" },
  { code: "CRANE", label: "Crane Related Incident" },
  { code: "FE", label: "Fire & Explosion" },
];

export const TYPE_B_INCIDENTS: IncidentCode[] = [
  { code: "STF", label: "Slips Trips Falls" },
  { code: "ETEC", label: "Exposure to Electric Current" },
  { code: "OTH", label: "Other Incident Type" },
  { code: "CSBO", label: "Cut / Stabbed By Others" },
  { code: "MAC", label: "Machinery Incident" },
  { code: "DODS", label: "Discharge of Dangerous Substance" },
  { code: "ETBM", label: "Exposure to Biological Materials" },
  { code: "ETET", label: "Exposure to Extreme Temperature" },
  { code: "ETHS", label: "Exposure to Hazardous Substance" },
  { code: "PA", label: "Physical Assault" },
];

export const ALL_INCIDENT_CODES: IncidentCode[] = [...TYPE_A_INCIDENTS, ...TYPE_B_INCIDENTS];

export const INCIDENT_CODE_LABEL: Record<string, string> = Object.fromEntries(
  ALL_INCIDENT_CODES.map((c) => [c.code, c.label]),
);

export function codeGroup(code: string | null | undefined): "A" | "B" | null {
  if (!code) return null;
  if (TYPE_A_INCIDENTS.some((c) => c.code === code)) return "A";
  if (TYPE_B_INCIDENTS.some((c) => c.code === code)) return "B";
  return null;
}

// Leading = proactive (Near Miss / observations), Lagging = reactive (injuries)
export const LAGGING_TYPES: IncidentType[] = [
  "FIRST_AID",
  "MEDICAL_TREATMENT",
  "RESTRICTED_WORK",
  "LOST_TIME_INJURY",
  "FATALITY",
];

// Palette for charts (green-forward, professional)
export const CHART_COLORS = [
  "#00cc79",
  "#0ea5e9",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#ec4899",
  "#64748b",
  "#84cc16",
  "#f97316",
];

export const MODULE_TABS = [
  { key: "dashboard", label: "Safety KPI", icon: "LayoutDashboard" },
  { key: "entry", label: "Daily Manpower", icon: "ClipboardList" },
  { key: "incidents", label: "Incidents", icon: "TriangleAlert" },
  { key: "stats", label: "Statistics", icon: "TrendingUp" },
  { key: "contractor", label: "Contractor", icon: "Building2" },
  { key: "building", label: "Building / Area", icon: "MapPin" },
  { key: "worktype", label: "Work Type", icon: "HardHat" },
  { key: "io", label: "Import / Export", icon: "FileSpreadsheet" },
  { key: "admin", label: "Admin", icon: "Settings" },
] as const;

export type ModuleKey = (typeof MODULE_TABS)[number]["key"];
