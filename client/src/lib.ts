import type { CompletionStatus, JobStatus } from './types';

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    // already HH:MM
    const m = String(iso).match(/(\d{1,2}):(\d{2})/);
    if (m) return to12h(Number(m[1]), Number(m[2]));
    return String(iso);
  }
  return to12h(d.getHours(), d.getMinutes());
}
function to12h(h: number, m: number): string {
  const ap = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ap}`;
}

export function fmtMins(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dayLabel(iso: string): { dow: string; date: string } {
  const d = new Date(iso + 'T00:00:00');
  return {
    dow: d.toLocaleDateString(undefined, { weekday: 'short' }),
    date: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
  };
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

export const STATUS_META: Record<JobStatus, { label: string; cls: string; dot: string }> = {
  unscheduled: { label: 'Unscheduled', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  blocked: { label: 'Blocked', cls: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

export const COMPLETION_META: Record<CompletionStatus, { label: string; cls: string }> = {
  not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-600' },
  complete: { label: 'Complete', cls: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'Partial — needs return', cls: 'bg-amber-100 text-amber-700' },
  blocked: { label: 'Blocked', cls: 'bg-rose-100 text-rose-700' },
};

export function varianceLabel(est?: number | null, actual?: number | null): {
  text: string;
  cls: string;
} | null {
  if (est == null || actual == null) return null;
  const diff = actual - est;
  if (Math.abs(diff) <= 5) return { text: 'on estimate', cls: 'text-slate-500' };
  if (diff > 0) return { text: `+${fmtMins(diff)} over`, cls: 'text-rose-600' };
  return { text: `${fmtMins(Math.abs(diff))} under`, cls: 'text-emerald-600' };
}
