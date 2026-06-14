import { useCallback, useEffect, useState } from 'react';
import type {
  Employee,
  Job,
  Note,
  Project,
  RoutePlan,
  Scope,
  TimeLog,
  WeekBoard,
} from './types';

const BASE = '/api';

async function http<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => http<{ ok: boolean; travelTimeProvider: string }>('/health'),
  employees: () => http<Employee[]>('/employees'),
  createEmployee: (body: Partial<Employee> & { name: string }) =>
    http<Employee>('/employees', { method: 'POST', body: JSON.stringify(body) }),
  updateEmployee: (id: number, patch: Partial<Employee>) =>
    http<Employee>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  scopes: () => http<Scope[]>('/scopes'),
  projects: () => http<Project[]>('/projects'),
  project: (id: number) =>
    http<{ project: Project; jobs: Job[]; notes: Note[]; timeLogs: TimeLog[] }>(`/projects/${id}`),
  updateProject: (id: number, patch: Partial<Project>) =>
    http<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createProject: (body: Partial<Project>) =>
    http<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),

  stats: (weekStart?: string) =>
    http<any>(`/dashboard/stats${weekStart ? `?weekStart=${weekStart}` : ''}`),
  week: (start?: string) => http<WeekBoard>(`/schedule/week${start ? `?start=${start}` : ''}`),

  jobs: (q: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => v !== undefined && params.set(k, String(v)));
    return http<Job[]>(`/jobs?${params.toString()}`);
  },
  job: (id: number) => http<{ job: Job; notes: Note[]; timeLogs: TimeLog[] }>(`/jobs/${id}`),
  createJob: (body: Partial<Job>) =>
    http<Job>('/jobs', { method: 'POST', body: JSON.stringify(body) }),
  updateJob: (id: number, patch: Partial<Job>) =>
    http<Job>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteJob: (id: number) => http<{ ok: boolean }>(`/jobs/${id}`, { method: 'DELETE' }),

  addNote: (jobId: number, body: { body: string; source: 'office' | 'field'; author?: string }) =>
    http<Note>(`/jobs/${jobId}/notes`, { method: 'POST', body: JSON.stringify(body) }),
  addTimeLog: (
    jobId: number,
    body: {
      arrived_at?: string;
      departed_at?: string;
      completion_status?: string;
      note?: string;
      employee_id?: number;
    },
  ) => http<TimeLog>(`/jobs/${jobId}/timelogs`, { method: 'POST', body: JSON.stringify(body) }),

  optimize: (body: {
    employeeId: number | null;
    date: string;
    save?: boolean;
    lockOrder?: boolean;
    startTime?: string;
    returnToStart?: boolean;
  }) => http<RoutePlan>('/route/optimize', { method: 'POST', body: JSON.stringify(body) }),
  previewRoute: (body: { jobIds: number[]; date?: string; employeeId?: number | null }) =>
    http<RoutePlan>('/route/preview', { method: 'POST', body: JSON.stringify(body) }),
};

/** Tiny data hook with manual refetch. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const memo = useCallback(fn, deps);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    memo()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(String(e.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [memo, tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}
