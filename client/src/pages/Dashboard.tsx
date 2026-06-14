import { useMemo, useState } from 'react';
import { api, useAsync } from '../api';
import { addDays, dayLabel, fmtMins, mondayOf } from '../lib';
import { useSession } from '../session';
import type { Job } from '../types';
import { AddJobModal } from '../components/AddJobModal';
import { JobDrawer } from '../components/JobDrawer';
import { RoutePanel } from '../components/RoutePanel';
import { Button, Modal, ScopeBadge, Spinner, StatusBadge } from '../components/ui';

export function Dashboard() {
  const { employees, scopes } = useSession();
  const [start, setStart] = useState<string | null>(null);
  const board = useAsync(() => api.week(start ?? undefined), [start]);
  const effStart = board.data?.start ?? start ?? mondayOf(new Date());
  const stats = useAsync(() => api.stats(effStart), [effStart]);

  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [routeCell, setRouteCell] = useState<{ empId: number; date: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [assigning, setAssigning] = useState<Job | null>(null);

  const fieldEmployees = employees;
  const days = board.data?.days ?? [];

  const jobsByCell = useMemo(() => {
    const map = new Map<string, Job[]>();
    (board.data?.jobs ?? []).forEach((j) => {
      const key = `${j.employee_id ?? 'none'}|${j.scheduled_date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    });
    return map;
  }, [board.data]);

  function reloadAll() {
    board.reload();
    stats.reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <WeekNav
          start={effStart}
          onPrev={() => setStart(addDays(effStart, -7))}
          onNext={() => setStart(addDays(effStart, 7))}
          onToday={() => setStart(mondayOf(new Date()))}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => setAddOpen(true)}>+ Add job</Button>
        </div>
      </div>

      {stats.data && <StatsBar stats={stats.data} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Board */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          {board.loading ? (
            <div className="p-6">
              <Spinner label="Loading schedule…" />
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold">Tech</th>
                  {days.map((d) => {
                    const { dow, date } = dayLabel(d);
                    return (
                      <th key={d} className="min-w-[200px] px-3 py-2 font-semibold">
                        {dow} <span className="text-slate-400">{date}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {fieldEmployees.map((emp) => (
                  <tr key={emp.id} className="border-b align-top">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: emp.color }}
                        >
                          {emp.initials}
                        </span>
                        <div className="leading-tight">
                          <div className="text-sm font-medium">{emp.name}</div>
                          <div className="text-[11px] text-slate-400">{emp.role}</div>
                        </div>
                      </div>
                    </td>
                    {days.map((d) => {
                      const cellJobs = jobsByCell.get(`${emp.id}|${d}`) ?? [];
                      const est = cellJobs.reduce((a, j) => a + (j.est_minutes ?? 0), 0);
                      return (
                        <td key={d} className="px-2 py-2">
                          {cellJobs.length > 0 && (
                            <button
                              onClick={() => setRouteCell({ empId: emp.id, date: d })}
                              className="mb-1 flex w-full items-center justify-between rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-500 hover:bg-brand-50 hover:text-brand-700"
                            >
                              <span>{cellJobs.length} stops · {fmtMins(est)}</span>
                              <span>route ⚡</span>
                            </button>
                          )}
                          <div className="space-y-1">
                            {cellJobs.map((j) => (
                              <JobMiniCard key={j.id} job={j} onClick={() => setSelectedJob(j.id)} />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Backlog */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-sm font-semibold">Unscheduled backlog</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {board.data?.unassigned.length ?? 0}
            </span>
          </div>
          <div className="max-h-[70vh] space-y-1.5 overflow-y-auto p-2 scrollbar-thin">
            {(board.data?.unassigned ?? []).map((j) => (
              <div key={j.id} className="rounded-lg border border-slate-200 p-2">
                <button onClick={() => setSelectedJob(j.id)} className="block w-full text-left">
                  <div className="flex items-center gap-1.5">
                    <ScopeBadge code={j.scope_code} label={j.scope_label} />
                    {j.priority > 0 && (
                      <span className="rounded bg-rose-100 px-1 text-[10px] font-medium text-rose-600">
                        {j.priority === 2 ? 'URGENT' : 'HIGH'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-sm font-medium">{j.project_name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {j.unit} · {j.city}
                  </div>
                </button>
                <Button size="sm" variant="secondary" className="mt-1.5 w-full" onClick={() => setAssigning(j)}>
                  Assign →
                </Button>
              </div>
            ))}
            {(board.data?.unassigned.length ?? 0) === 0 && (
              <p className="p-4 text-center text-sm text-slate-400">Backlog is clear 🎉</p>
            )}
          </div>
        </div>
      </div>

      {/* Route modal */}
      {routeCell && (
        <Modal
          open
          onClose={() => setRouteCell(null)}
          title={`Route · ${employees.find((e) => e.id === routeCell.empId)?.name} · ${dayLabel(routeCell.date).dow} ${dayLabel(routeCell.date).date}`}
          wide
        >
          <RoutePanel
            employeeId={routeCell.empId}
            employeeName={employees.find((e) => e.id === routeCell.empId)?.name ?? ''}
            color={employees.find((e) => e.id === routeCell.empId)?.color}
            date={routeCell.date}
            onChanged={reloadAll}
          />
        </Modal>
      )}

      {selectedJob != null && (
        <JobDrawer
          jobId={selectedJob}
          role="coordinator"
          onClose={() => setSelectedJob(null)}
          onChanged={reloadAll}
        />
      )}

      {assigning && (
        <AssignModal
          job={assigning}
          weekStart={effStart}
          onClose={() => setAssigning(null)}
          onAssigned={() => {
            setAssigning(null);
            reloadAll();
          }}
        />
      )}

      <AddJobModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={reloadAll}
        employees={employees}
        scopes={scopes}
        defaultDate={days[0]}
      />
    </div>
  );
}

function JobMiniCard({ job, onClick }: { job: Job; onClick: () => void }) {
  const completion = job.completion_status;
  const ring =
    job.status === 'completed'
      ? 'border-l-emerald-500'
      : job.status === 'in_progress'
        ? 'border-l-amber-500'
        : job.status === 'blocked'
          ? 'border-l-rose-500'
          : 'border-l-blue-500';
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-md border border-slate-200 border-l-4 ${ring} bg-white px-2 py-1 text-left hover:bg-slate-50`}
    >
      <div className="flex items-center gap-1">
        {job.sequence != null && (
          <span className="text-[10px] font-bold text-slate-400">#{job.sequence}</span>
        )}
        <ScopeBadge code={job.scope_code} label={job.scope_label} />
        {completion === 'partial' && <span className="text-[10px] text-amber-600">↩ return</span>}
      </div>
      <div className="mt-0.5 truncate text-xs font-medium text-slate-800">{job.project_name}</div>
      <div className="truncate text-[11px] text-slate-400">{job.unit}</div>
    </button>
  );
}

function WeekNav({
  start,
  onPrev,
  onNext,
  onToday,
}: {
  start: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const end = addDays(start, 4);
  return (
    <div className="flex items-center gap-2">
      <h1 className="text-lg font-semibold">Schedule</h1>
      <div className="flex items-center rounded-lg border border-slate-200 bg-white">
        <button onClick={onPrev} className="px-2 py-1.5 text-slate-500 hover:bg-slate-50">
          ‹
        </button>
        <span className="px-2 text-sm font-medium">
          {dayLabel(start).date} – {dayLabel(end).date}
        </span>
        <button onClick={onNext} className="px-2 py-1.5 text-slate-500 hover:bg-slate-50">
          ›
        </button>
      </div>
      <button onClick={onToday} className="rounded-lg px-2 py-1 text-sm text-brand-600 hover:bg-brand-50">
        This week
      </button>
    </div>
  );
}

function StatsBar({ stats }: { stats: any }) {
  const get = (s: string) => stats.statusCounts.find((x: any) => x.status === s)?.c ?? 0;
  const chips = [
    { label: 'Scheduled', value: get('scheduled'), cls: 'text-blue-600' },
    { label: 'In progress', value: get('in_progress'), cls: 'text-amber-600' },
    { label: 'Completed', value: get('completed'), cls: 'text-emerald-600' },
    { label: 'Unscheduled', value: stats.unscheduled, cls: 'text-slate-600' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {chips.map((c) => (
        <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
          <div className="text-xs text-slate-500">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function AssignModal({
  job,
  weekStart,
  onClose,
  onAssigned,
}: {
  job: Job;
  weekStart: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { employees } = useSession();
  const [empId, setEmpId] = useState<number | ''>('');
  const [date, setDate] = useState(weekStart);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!empId || !date) return;
    setBusy(true);
    try {
      await api.updateJob(job.id, { employee_id: Number(empId), scheduled_date: date, measure_date: date });
      onAssigned();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Assign · ${job.project_name}`}>
      <p className="mb-3 text-sm text-slate-500">
        {job.unit} · <ScopeBadge code={job.scope_code} /> · est {fmtMins(job.est_minutes)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Tech</span>
          <select
            value={empId}
            onChange={(e) => setEmpId(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || !empId}>
          Assign & route
        </Button>
      </div>
    </Modal>
  );
}
