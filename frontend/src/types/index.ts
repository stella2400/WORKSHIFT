export type UserRole = "admin" | "manager" | "user";
export type User = {
  id: number; full_name: string; employee_code: string;
  company_name?: string | null; team_name?: string | null; email: string;
  role: UserRole; is_active: boolean; must_change_password: boolean; dashboard_config?: string | null;
};
export type ShiftDefinition = {
  id: number; code: string; label: string; color: string; category: string;
  sort_order: number; is_active: boolean;
  time_start?: string | null; time_end?: string | null; default_hours?: number | null;
};
export type WorkStationDefinition = {
  id: number; code: string; label: string; color: string; sort_order: number; is_active: boolean;
};
export type Shift = {
  id: number; shift_date: string; shift_code: string; shift_label: string;
  notes?: string | null; manually_edited: boolean; user_id: number;
  time_start?: string | null; time_end?: string | null;
  actual_time_start?: string | null; actual_time_end?: string | null;
  hours_worked?: number | null; overtime_hours?: number | null;
};
export type WorkStationEntry = {
  id: number; user_id: number; assigned_date?: string | null;
  month_label?: string | null; station_code: string; station_label?: string | null; validity: string;
};
export type Upload = {
  id: number; original_filename: string; file_type: string; processing_status: string;
  month_label: string; source_note?: string | null; users_processed: number; users_skipped: number;
  created_at: string; upload_kind?: string;
};
export type DashboardSummary = {
  total_days: number; work_days: number; off_days: number; uploads_count: number;
  hours_worked: number; overtime_hours: number; by_code: Record<string, number>;
};
export type TeamConfig = {
  id: number; company_name: string; team_name: string; standard_hours: number; search_by: string;
};
export type DashboardResponse = {
  user: User; summary: DashboardSummary; shifts: Shift[];
  uploads: Upload[]; definitions: ShiftDefinition[];
  station_definitions: WorkStationDefinition[];
  stations: WorkStationEntry[];
  team_config?: TeamConfig | null;
};
export type DashboardCard = { label: string; code: string };
export type SwapDetailRead = {
  id: number; status: string;
  requester_id: number; requester_name: string; requester_employee_code: string;
  target_id: number; target_name: string; target_employee_code: string;
  requester_shift_date?: string | null; requester_shift_code: string; requester_shift_label: string;
  target_shift_date?: string | null; target_shift_code: string; target_shift_label: string;
  requester_note?: string | null; target_note?: string | null; manager_note?: string | null;
  created_at: string; updated_at: string;
};
export type ColleagueRead = {
  id: number; full_name: string; employee_code: string;
  shift_code: string; shift_label: string; station_name?: string | null;
};
export type TeamMember = {
  id: number; full_name: string; employee_code: string;
  team_name?: string | null; company_name?: string | null; role: string;
};
export type TeamMemberShifts = { user: TeamMember; shifts: Shift[] };
export type Company = { id: number; name: string; description?: string | null; created_at: string };
export type Team = { id: number; name: string; description?: string | null; company_id: number; created_at: string };
export type BulkImportResponse = {
  upload: Upload; processed: string[]; skipped: string[]; errors: string[][]; month_label: string;
};
// Helper: build lookup maps from definitions
export function buildShiftMap(defs: ShiftDefinition[]): Record<string, ShiftDefinition> {
  return Object.fromEntries(defs.map(d => [d.code, d]));
}
export function buildStationMap(defs: WorkStationDefinition[]): Record<string, WorkStationDefinition> {
  return Object.fromEntries(defs.map(d => [d.code, d]));
}
