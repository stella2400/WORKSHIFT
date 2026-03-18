export type User = {
  id: number;
  full_name: string;
  employee_code: string;
  company_name?: string | null;
  team_name?: string | null;
  email: string;
};

export type ShiftDefinition = {
  id: number;
  code: string;
  label: string;
  color: string;
  category: string;
  sort_order: number;
  is_active: boolean;
};

export type Shift = {
  id: number;
  shift_date: string;
  shift_code: string;
  shift_label: string;
  notes?: string | null;
  manually_edited: boolean;
};

export type Upload = {
  id: number;
  original_filename: string;
  file_type: string;
  processing_status: string;
  month_label: string;
  source_note?: string | null;
  created_at: string;
};

export type DashboardResponse = {
  user: User;
  summary: {
    total_days: number;
    work_days: number;
    off_days: number;
    uploads_count: number;
  };
  shifts: Shift[];
  uploads: Upload[];
  definitions: ShiftDefinition[];
};
