export type JobStatus =
  | 'unscheduled'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'blocked';

export type CompletionStatus = 'not_started' | 'complete' | 'partial' | 'blocked';
export type NoteSource = 'office' | 'field';
export type JobType = 'measure' | 'install';

export interface LatLng {
  lat: number;
  lng: number;
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
  /** ISO time the tech is expected to arrive */
  etaArrive: string;
  /** ISO time the tech is expected to depart */
  etaDepart: string;
  /** drive minutes from previous stop (or office) to here */
  driveMinutesFromPrev: number;
  driveKmFromPrev: number;
}

export interface RoutePlan {
  employeeId: number | null;
  date: string;
  startLocation: LatLng & { name: string };
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
