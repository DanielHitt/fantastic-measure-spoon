export interface Employee {
  id: number;
  name: string;
  initials: string;
  role: string;
  color: string;
  home_address?: string;
  home_lat?: number;
  home_lng?: number;
  work_start: string;
  work_end: string;
}

export interface Scope {
  code: string;
  label: string;
  category: string;
  default_minutes: number;
}

export interface Project {
  id: number;
  name: string;
  builder?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  office_notes?: string;
  job_count?: number;
  completed_count?: number;
  last_measure?: string;
}

export type JobStatus = 'unscheduled' | 'scheduled' | 'in_progress' | 'completed' | 'blocked';
export type CompletionStatus = 'not_started' | 'complete' | 'partial' | 'blocked';

export interface Job {
  id: number;
  project_id: number;
  employee_id: number | null;
  unit: string;
  scope_code: string;
  scope_raw: string;
  scope_label?: string;
  scope_category?: string;
  job_type: string;
  status: JobStatus;
  scheduled_date: string | null;
  measure_date: string | null;
  install_date: string | null;
  est_minutes: number;
  sequence: number | null;
  priority: number;
  time_window_start?: string | null;
  time_window_end?: string | null;
  // joined
  project_name?: string;
  builder?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  employee_name?: string;
  employee_initials?: string;
  employee_color?: string;
  note_count?: number;
  actual_minutes?: number | null;
  completion_status?: CompletionStatus | null;
  arrived_at?: string | null;
  departed_at?: string | null;
}

export interface Note {
  id: number;
  job_id: number | null;
  project_id: number | null;
  author: string;
  source: 'office' | 'field';
  body: string;
  entry_date: string | null;
  created_at: string;
}

export interface TimeLog {
  id: number;
  job_id: number;
  employee_id: number | null;
  employee_initials?: string;
  arrived_at: string | null;
  departed_at: string | null;
  actual_minutes: number | null;
  completion_status: CompletionStatus;
  note: string | null;
  created_at: string;
}

export interface RouteStop {
  jobId: number;
  projectId: number;
  projectName: string;
  unit: string;
  scopeCode: string;
  lat: number;
  lng: number;
  estMinutes: number;
  sequence: number;
  etaArrive: string;
  etaDepart: string;
  driveMinutesFromPrev: number;
  driveKmFromPrev: number;
}

export interface RoutePlan {
  employeeId: number | null;
  date: string;
  startLocation: { name: string; lat: number; lng: number };
  startTime: string;
  stops: RouteStop[];
  totalDriveMinutes: number;
  totalServiceMinutes: number;
  totalKm: number;
  returnDriveMinutes: number;
  finishTime: string;
  provider: 'google' | 'heuristic';
  warnings: string[];
}

export interface WeekBoard {
  start: string;
  days: string[];
  jobs: Job[];
  unassigned: Job[];
}
