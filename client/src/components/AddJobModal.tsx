import { useMemo, useState } from 'react';
import { api, useAsync } from '../api';
import type { Employee, Scope } from '../types';
import { AddProjectModal } from './AddProjectModal';
import { Button, Field, Modal, inputCls } from './ui';

export function AddJobModal({
  open,
  onClose,
  onCreated,
  employees,
  scopes,
  defaultDate,
  defaultEmployeeId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  employees: Employee[];
  scopes: Scope[];
  defaultDate?: string;
  defaultEmployeeId?: number | null;
}) {
  const { data: projects, reload: reloadProjects } = useAsync(() => api.projects(), []);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [unit, setUnit] = useState('');
  const [scopeCode, setScopeCode] = useState('');
  const [estMinutes, setEstMinutes] = useState<number | ''>('');
  const [employeeId, setEmployeeId] = useState<number | ''>(defaultEmployeeId ?? '');
  const [date, setDate] = useState(defaultDate ?? '');
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [priority, setPriority] = useState(0);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (projects ?? []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 50);
  }, [projects, search]);

  function pickScope(code: string) {
    setScopeCode(code);
    const s = scopes.find((x) => x.code === code);
    if (s) setEstMinutes(s.default_minutes);
  }

  async function submit() {
    if (!projectId) return;
    setBusy(true);
    try {
      await api.createJob({
        project_id: Number(projectId),
        unit,
        scope_code: scopeCode || undefined,
        scope_raw: scopeCode || undefined,
        est_minutes: estMinutes === '' ? undefined : Number(estMinutes),
        employee_id: employeeId === '' ? null : Number(employeeId),
        scheduled_date: date || undefined,
        measure_date: date || undefined,
        time_window_start: windowStart || undefined,
        time_window_end: windowEnd || undefined,
        priority,
      });
      onCreated();
      onClose();
      // reset
      setProjectId('');
      setSearch('');
      setUnit('');
      setScopeCode('');
      setEstMinutes('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a job" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Project / builder">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className={inputCls}
                />
              </Field>
            </div>
            <Button variant="secondary" onClick={() => setAddingProject(true)}>
              + New site
            </Button>
          </div>
          <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProjectId(p.id);
                  setSearch(p.name);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
                  projectId === p.id ? 'bg-brand-50 text-brand-700' : ''
                }`}
              >
                {p.name} <span className="text-slate-400">· {p.city}</span>
              </button>
            ))}
          </div>
        </div>

        <Field label="Building / lot / unit">
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} placeholder="e.g. L3 East 311-318" />
        </Field>
        <Field label="Scope / product">
          <select value={scopeCode} onChange={(e) => pickScope(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {scopes.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Estimated minutes onsite">
          <input
            type="number"
            value={estMinutes}
            onChange={(e) => setEstMinutes(e.target.value === '' ? '' : Number(e.target.value))}
            className={inputCls}
          />
        </Field>
        <Field label="Assign to tech">
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value === '' ? '' : Number(e.target.value))}
            className={inputCls}
          >
            <option value="">Unassigned (backlog)</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.role}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Scheduled date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={inputCls}>
            <option value={0}>Normal</option>
            <option value={1}>High</option>
            <option value={2}>Urgent</option>
          </select>
        </Field>
        <Field label="Arrive after (optional window)">
          <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Arrive before (optional window)">
          <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || !projectId}>
          Create job
        </Button>
      </div>

      {addingProject && (
        <AddProjectModal
          open
          onClose={() => setAddingProject(false)}
          onCreated={(p) => {
            reloadProjects();
            setProjectId(p.id);
            setSearch(p.name);
          }}
        />
      )}
    </Modal>
  );
}
