import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAsync } from '../api';
import { COMPLETION_META, fmtMins, varianceLabel } from '../lib';
import type { CompletionStatus } from '../types';
import { PaperTrail } from './PaperTrail';
import { Button, Field, Modal, ScopeBadge, Spinner, StatusBadge, TechChip, inputCls } from './ui';

export function JobDrawer({
  jobId,
  role,
  currentEmployeeId,
  onClose,
  onChanged,
}: {
  jobId: number;
  role: 'coordinator' | 'driver';
  currentEmployeeId?: number;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { data, loading, reload } = useAsync(() => api.job(jobId), [jobId]);

  function refresh() {
    reload();
    onChanged?.();
  }

  return (
    <Modal open onClose={onClose} title="Job detail" wide>
      {loading || !data ? (
        <Spinner />
      ) : (
        <JobBody data={data} role={role} currentEmployeeId={currentEmployeeId} onChanged={refresh} />
      )}
    </Modal>
  );
}

function JobBody({
  data,
  role,
  currentEmployeeId,
  onChanged,
}: {
  data: Awaited<ReturnType<typeof api.job>>;
  role: 'coordinator' | 'driver';
  currentEmployeeId?: number;
  onChanged: () => void;
}) {
  const { job, notes, timeLogs } = data;
  const officeNotes = notes.filter((n) => n.source === 'office');
  const variance = varianceLabel(job.est_minutes, job.actual_minutes);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          <ScopeBadge code={job.scope_code} label={job.scope_label} />
          {job.employee_initials && <TechChip initials={job.employee_initials} color={job.employee_color} />}
          {job.priority > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
              Priority
            </span>
          )}
        </div>
        <h2 className="mt-2 text-lg font-semibold">{job.project_name}</h2>
        <p className="text-sm text-slate-500">
          {job.unit} · {job.scope_label || job.scope_raw}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {job.address}
          {job.city ? `, ${job.city}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <span>
            <span className="text-slate-400">Estimated: </span>
            {fmtMins(job.est_minutes)}
          </span>
          <span>
            <span className="text-slate-400">Actual: </span>
            {fmtMins(job.actual_minutes)}
            {variance && <span className={`ml-1 text-xs ${variance.cls}`}>({variance.text})</span>}
          </span>
          {job.completion_status && (
            <span className={`rounded px-1.5 py-0.5 text-xs ${COMPLETION_META[job.completion_status].cls}`}>
              {COMPLETION_META[job.completion_status].label}
            </span>
          )}
          <Link to={`/projects/${job.project_id}`} className="text-brand-600 hover:underline">
            View full project file →
          </Link>
        </div>
        {(job.contact_name || job.contact_phone) && (
          <p className="mt-1 text-sm text-slate-500">
            Site contact: {job.contact_name} {job.contact_phone}
          </p>
        )}
      </div>

      {officeNotes.length > 0 && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
            Office instructions for the field
          </p>
          <ul className="space-y-1 text-sm text-violet-900">
            {officeNotes.slice(0, 4).map((n) => (
              <li key={n.id}>• {n.body}</li>
            ))}
          </ul>
        </div>
      )}

      {role === 'driver' && <TimeLogForm jobId={job.id} estMinutes={job.est_minutes} employeeId={currentEmployeeId} onSaved={onChanged} />}

      <NoteComposer jobId={job.id} defaultSource={role === 'coordinator' ? 'office' : 'field'} onSaved={onChanged} />

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Paper trail</h3>
        <PaperTrail notes={notes} timeLogs={timeLogs} />
      </div>
    </div>
  );
}

function TimeLogForm({
  jobId,
  estMinutes,
  employeeId,
  onSaved,
}: {
  jobId: number;
  estMinutes: number;
  employeeId?: number;
  onSaved: () => void;
}) {
  const [arrived, setArrived] = useState('');
  const [departed, setDeparted] = useState('');
  const [completion, setCompletion] = useState<CompletionStatus>('complete');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const actual = computeActual(arrived, departed);

  async function submit() {
    if (!arrived && !departed) return;
    setBusy(true);
    try {
      await api.addTimeLog(jobId, {
        arrived_at: arrived || undefined,
        departed_at: departed || undefined,
        completion_status: completion,
        note: note || undefined,
        employee_id: employeeId,
      });
      setArrived('');
      setDeparted('');
      setNote('');
      setCompletion('complete');
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
      <p className="mb-2 text-sm font-semibold text-emerald-800">Log your visit</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Arrived">
          <input type="time" value={arrived} onChange={(e) => setArrived(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Departed">
          <input type="time" value={departed} onChange={(e) => setDeparted(e.target.value)} className={inputCls} />
        </Field>
      </div>
      {actual != null && (
        <p className="mt-1 text-xs text-slate-500">
          {fmtMins(actual)} onsite · estimate was {fmtMins(estMinutes)}
          {(() => {
            const v = varianceLabel(estMinutes, actual);
            return v ? <span className={`ml-1 ${v.cls}`}>({v.text})</span> : null;
          })()}
        </p>
      )}
      <Field label="Completion status">
        <div className="flex flex-wrap gap-2">
          {(['complete', 'partial', 'blocked'] as CompletionStatus[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCompletion(c)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                completion === c ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              {COMPLETION_META[c].label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="What did you complete / what's left for the next visit?">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. Measured all shades on L1–L3. Mbath mirrors held — no countertops yet, return after 6/20."
          className={inputCls}
        />
      </Field>
      <div className="mt-2 flex justify-end">
        <Button onClick={submit} disabled={busy || (!arrived && !departed)}>
          Save visit log
        </Button>
      </div>
    </div>
  );
}

function NoteComposer({
  jobId,
  defaultSource,
  onSaved,
}: {
  jobId: number;
  defaultSource: 'office' | 'field';
  onSaved: () => void;
}) {
  const [source, setSource] = useState<'office' | 'field'>(defaultSource);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.addNote(jobId, { body: body.trim(), source });
      setBody('');
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-semibold text-slate-700">Add a note</p>
        <div className="ml-auto flex rounded-lg border border-slate-200 p-0.5 text-xs">
          {(['office', 'field'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`rounded px-2 py-1 ${source === s ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
            >
              {s === 'office' ? 'Office → field' : 'Field note'}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder={
          source === 'office'
            ? 'Detail the field team needs (gate codes, access, what to confirm onsite)…'
            : 'Note for anyone who shows up next…'
        }
        className={inputCls}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={submit} disabled={busy || !body.trim()}>
          Post note
        </Button>
      </div>
    </div>
  );
}

function computeActual(a: string, b: string): number | null {
  if (!a || !b) return null;
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  let d = bh * 60 + bm - (ah * 60 + am);
  if (d < 0) d += 1440;
  return d;
}
