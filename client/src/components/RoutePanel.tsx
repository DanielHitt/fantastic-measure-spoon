import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmtMins, fmtTime } from '../lib';
import type { RoutePlan } from '../types';
import { Button, ScopeBadge, Spinner } from './ui';
import { RouteMap } from './RouteMap';

export function RoutePanel({
  employeeId,
  employeeName,
  date,
  color = '#2563eb',
  onChanged,
}: {
  employeeId: number;
  employeeName: string;
  date: string;
  color?: string;
  onChanged?: () => void;
}) {
  const [current, setCurrent] = useState<RoutePlan | null>(null);
  const [optimized, setOptimized] = useState<RoutePlan | null>(null);
  const [showOpt, setShowOpt] = useState(false);
  const [startTime, setStartTime] = useState('07:30');
  const [returnToStart, setReturnToStart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function loadCurrent() {
    setBusy(true);
    try {
      const p = await api.optimize({ employeeId, date, lockOrder: true, startTime, returnToStart });
      setCurrent(p);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setShowOpt(false);
    setOptimized(null);
    setSaved(false);
    loadCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, date, startTime, returnToStart]);

  async function runOptimize() {
    setBusy(true);
    try {
      const p = await api.optimize({ employeeId, date, lockOrder: false, startTime, returnToStart });
      setOptimized(p);
      setShowOpt(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveOptimized() {
    setBusy(true);
    try {
      await api.optimize({ employeeId, date, lockOrder: false, save: true, startTime, returnToStart });
      setSaved(true);
      await loadCurrent();
      setShowOpt(false);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const plan = showOpt ? optimized : current;
  const savings =
    current && optimized ? Math.round(current.totalDriveMinutes - optimized.totalDriveMinutes) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <RouteMap plan={plan} color={color} height={460} />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Start</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">
            <input
              type="checkbox"
              checked={returnToStart}
              onChange={(e) => setReturnToStart(e.target.checked)}
            />
            Return to office
          </label>
          {plan && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {plan.provider === 'google' ? 'Google traffic' : 'Estimated drive times'}
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">
              {employeeName}'s day · {plan?.stops.length ?? 0} stops
            </h3>
            {plan && (
              <p className="text-sm text-slate-500">
                {fmtTime(plan.startTime)} – {fmtTime(plan.finishTime)} · drive {fmtMins(plan.totalDriveMinutes)}{' '}
                · onsite {fmtMins(plan.totalServiceMinutes)} · {Math.round(plan.totalKm * 0.621)} mi
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {!showOpt ? (
              <Button size="sm" onClick={runOptimize} disabled={busy || (current?.stops.length ?? 0) < 2}>
                ⚡ Optimize
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => setShowOpt(false)}>
                  Current
                </Button>
                <Button size="sm" onClick={saveOptimized} disabled={busy}>
                  Save order
                </Button>
              </>
            )}
          </div>
        </div>

        {showOpt && optimized && (
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              savings > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'
            }`}
          >
            {savings > 0
              ? `Optimized order saves ~${fmtMins(savings)} of driving vs. the current order.`
              : 'Current order is already efficient.'}
          </div>
        )}
        {saved && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Order saved.</div>}

        {busy && !plan ? (
          <Spinner />
        ) : !plan || plan.stops.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            No stops scheduled for this tech on this day.
          </p>
        ) : (
          <ol className="space-y-2">
            <li className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-white">
                ⌂
              </span>
              Depart {plan.startLocation.name} at {fmtTime(plan.startTime)}
            </li>
            {plan.stops.map((s) => (
              <li key={s.jobId} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>↓ drive {fmtMins(s.driveMinutesFromPrev)} · {Math.round(s.driveKmFromPrev * 0.621)} mi</span>
                </div>
                <div className="mt-1 flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ background: color }}
                  >
                    {s.sequence}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/projects/${s.projectId}`}
                      className="block truncate font-medium text-slate-800 hover:text-brand-600"
                    >
                      {s.projectName}
                    </Link>
                    <p className="truncate text-sm text-slate-500">{s.unit}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <ScopeBadge code={s.scopeCode} />
                      <span className="font-medium text-slate-700">
                        {fmtTime(s.etaArrive)} – {fmtTime(s.etaDepart)}
                      </span>
                      <span>est {fmtMins(s.estMinutes)} onsite</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {plan.returnDriveMinutes > 0 && (
              <li className="flex items-center gap-2 text-xs text-slate-400">
                <span>↓ drive {fmtMins(plan.returnDriveMinutes)} back to office</span>
              </li>
            )}
            <li className="text-right text-sm font-medium text-slate-600">
              Finish ~{fmtTime(plan.finishTime)}
            </li>
          </ol>
        )}

        {plan?.warnings.map((w, i) => (
          <div key={i} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⚠ {w}
          </div>
        ))}
      </div>
    </div>
  );
}
