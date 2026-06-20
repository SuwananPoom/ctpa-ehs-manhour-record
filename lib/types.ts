// ---------- Roles & auth ----------
export type Role = "ADMIN" | "EHS_MANAGER" | "CONTRACTOR_SAFETY" | "VIEWER";

export interface Session {
  role: Role;
  name: string;
  contractorId: string | null;
  contractorName: string | null;
}

// ---------- Master data ----------
export type ContractorType = "GC" | "CONTRACTOR" | "SUBCONTRACTOR";

export interface Contractor {
  id: string;
  name: string;
  code: string | null;
  type: ContractorType;
  active: boolean;
  created_at: string;
}

export interface Subcontractor {
  id: string;
  contractor_id: string | null;
  name: string;
  code: string | null;
  active: boolean;
  created_at: string;
}

export interface Building {
  id: string;
  name: string;
  category: string; // BUILDING | AREA | FACILITY
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface WorkType {
  id: string;
  name: string;
  code: string | null;
  high_risk: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  contractor_id: string | null;
  active: boolean;
  created_at: string;
}

// ---------- Transactional ----------
export interface DailyWorkhour {
  id: string;
  work_date: string;
  contractor_id: string | null;
  contractor_name: string;
  subcontractor_id: string | null;
  subcontractor_name: string | null;
  building_id: string | null;
  building_name: string;
  work_type_id: string | null;
  work_type_name: string;
  main_activity: string | null;
  day_shift_manpower: number;
  night_shift_manpower: number;
  male: number;
  female: number;
  total_manpower: number; // generated
  working_hours: number;
  ot_hours: number;
  total_manhours: number; // generated
  high_risk_activity: boolean;
  remark: string | null;
  submitted_by: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type IncidentType =
  | "NEAR_MISS"
  | "FIRST_AID"
  | "MEDICAL_TREATMENT"
  | "RESTRICTED_WORK"
  | "LOST_TIME_INJURY"
  | "FATALITY"
  | "PROPERTY_DAMAGE"
  | "ENVIRONMENTAL";

export interface Incident {
  id: string;
  incident_date: string;
  contractor_id: string | null;
  contractor_name: string | null;
  building_id: string | null;
  building_name: string | null;
  work_type_id: string | null;
  incident_type: IncidentType;
  type_code: string | null; // Type A/B mechanism code (CFSE, VEH, STF, ...)
  loss_of_consciousness: boolean;
  serious_potential: boolean; // WPS — serious & potentially serious
  lost_days: number;
  description: string | null;
  corrective_action: string | null;
  reported_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Settings ----------
export interface AppSettings {
  site_name: string;
  trir_basis: number;
  ltir_basis: number;
  observation_basis: number;
  baseline_manhours: number;
  baseline_observations: number;
  rolling_year_days: number;
  last_lti_date: string | null;
  targets: { trir: number; ltir: number; observation_rate: number; wps: number };
  benchmarks: Record<string, number>; // per Type A/B code + TRIR/LTIR/WPS industry values
  auth: { app_password: string; admin_pin: string };
}

export interface Globals {
  accumulative_manhours: number;
  rolling_year_manhours: number;
  total_manpower_alltime: number;
  last_lti_date: string | null;
  total_records: number;
  first_record_date: string | null;
}

// ---------- Filters ----------
export interface Filters {
  dateFrom: string;
  dateTo: string;
  contractorId: string; // "" = all
  buildingId: string;
  workTypeId: string;
  shift: "ALL" | "DAY" | "NIGHT";
}
