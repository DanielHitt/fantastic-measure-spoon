import { useEffect, useMemo, useState } from 'react';
import { api, useAsync } from '../api';
import { COMPLETION_META, dayLabel, fmtMins, fmtTime } from '../lib';
import { useSession } from '../session';
import type { Job, RoutePlan } from '../types';
import { JobDrawer } from '../components/JobDrawer';
import { RouteMap } from '../components/RouteMap';
import { ScopeBadge, Spinner } from '../components/ui';

export function DriverDay() {
  const { employeeId, currentEmployee } = useSession();
  const weekBoard = useAsync(() => api.week(), []);
  const weekStart = weekBoard.data?.start;
  const end = weekStart ? addDaysStr(weekStart, 6) : undefined;

  const jobsQ = useAsync(
    () =>
      employeeId && weekStart
        ? api.jobs({ employee: employeeId, from: weekStart, to: end! })
        : Promise.resolve([] as Job[]),
    [employeeId, weekStart],
  );

  const availableDays = useMemo(() => {
    const set = new Set<string>();
    (jobsQ.data ?? []).forEach((j) => j.scheduled_date && set.add(j.scheduled_date));
    return [...set].sort();
  }, [jobsQ.data]);

  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    if (!date && availableDays.length) {
      const today = new Date().toISOString().slice(0, 10);
      setDate(availableDays.includes(today) ? today : availableDays[0]);
    }
  }, [availableDays, date]);

  const planQ = useAsync(
    () =>
      employeeId && date
        ? api.optimize({ employeeId, date, lockOrder: true })
        : Promise.resolve(null as RoutePlan | null),
    [employeeId, date],
  );

  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const jobByStop = useMemo(() => {
    const m = new Map<number, Job>();
    (jobsQ.data ?? []).forEach((j) => m.set(j.id, j));
    return m;
  }, [jobsQ.data]);

  function reload() {
    jobsQ.reload();
    planQ.reload();
  }

  if (!employeeId) return <p className="text-slate-500">Select a driver in the top bar.</p>;

  const plan = planQ.data;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{currentEmployee?.name}'s Day</h1>
        <p className="text-sm text-slate-500">Your route, in order. Tap a stop to log time and add notes.</p>
      </div>

      {/* day selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {availableDays.map((d) => {
          const { dow, date: dt } = dayLabel(d);
          const count = (jobsQ.data ?? []).filter((j) => j.scheduled_date === d).length;
          return (
            <button
              key={d}
              onClick={() => setDate(d)}
              className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-1.5 text-sm ${
                date === d ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <span className="font-medium">{dow}</span>
              <span className="text-xs">{dt}</span>
              <span className="text-[10px] text-slate-400">{count} stops</span>
            </button>
          );
        })}
        {availableDays.length === 0 && !jobsQ.loading && (
          <p className="text-sm text-slate-400">No scheduled jobs this week.</p>
        )}
      </div>

      {plan && plan.stops.length > 0 && (
        <>
          <RouteMap plan={plan} color={currentEmployee?.color} height={260} />
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
            {plan.stops.length} stops · depart {fmtTime(plan.startTime)} · finish ~{fmtTime(plan.finishTime)} · drive{' '}
            {fmtMins(plan.totalDriveMinutes)}
          </div>
        </>
      )}

      {planQ.loading ? (
        <Spinner />
      ) : (
        <ol className="space-y-2">
          {(plan?.stops ?? []).map((s) => {
            const job = jobByStop.get(s.jobId);
            const completion = job?.completion_status;
            return (
              <li key={s.jobId}>
                <button
                  onClick={() => setSelectedJob(s.jobId)}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-brand-300"
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ background: currentEmployee?.color }}
                  >
                    {s.sequence}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{fmtTime(s.etaArrive)}</span>
                      <span className="text-xs text-slate-400">drive {fmtMins(s.driveMinutesFromPrev)}</span>
                    </div>
                    <div className="truncate font-medium">{s.projectName}</div>
                    <div className="truncate text-sm text-slate-500">{s.unit}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <ScopeBadge code={s.scopeCode} />
                      <span className="text-slate-500">est {fmtMins(s.estMinutes)}</span>
                      {job?.note_count ? <span className="text-violet-600">{job.note_count} notes</span> : null}
                      {completion && (
                        <span className={`rounded px-1.5 py-0.5 ${COMPLETION_META[completion].cls}`}>
                          {COMPLETION_META[completion].label}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
          {plan && plan.stops.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
              Nothing scheduled for this day.
            </p>
          )}
        </ol>
      )}

      {selectedJob != null && (
        <JobDrawer
          jobId={selectedJob}
          role="driver"
          currentEmployeeId={employeeId}
          onClose={() => setSelectedJob(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function addDaysStr(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
