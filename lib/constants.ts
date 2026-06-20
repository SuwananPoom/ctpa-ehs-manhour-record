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
  { key: "contractor", label: "Contractor", icon: "Building2" },
  { key: "building", label: "Building / Area", icon: "MapPin" },
  { key: "worktype", label: "Work Type", icon: "HardHat" },
  { key: "io", label: "Import / Export", icon: "FileSpreadsheet" },
  { key: "admin", label: "Admin", icon: "Settings" },
] as const;

export type ModuleKey = (typeof MODULE_TABS)[number]["key"];
