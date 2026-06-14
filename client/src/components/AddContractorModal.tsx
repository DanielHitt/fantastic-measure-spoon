import { useState } from 'react';
import { api } from '../api';
import type { Employee } from '../types';
import { Button, Field, Modal, inputCls } from './ui';

const ROLES = ['Field Measure Tech', 'Installer', 'Measure & Install', 'Lead', 'Subcontractor'];
const PALETTE = ['#2563eb', '#16a34a', '#db2777', '#d97706', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626', '#0d9488', '#9333ea'];

export function AddContractorModal({
  open,
  onClose,
  onCreated,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (emp: Employee) => void;
  existing?: Employee | null;
}) {
  const editing = Boolean(existing);
  const [name, setName] = useState(existing?.name ?? '');
  const [initials, setInitials] = useState(existing?.initials ?? '');
  const [role, setRole] = useState(existing?.role ?? ROLES[0]);
  const [color, setColor] = useState(existing?.color ?? PALETTE[0]);
  const [home_address, setHome] = useState(existing?.home_address ?? '');
  const [work_start, setStart] = useState(existing?.work_start ?? '07:30');
  const [work_end, setEnd] = useState(existing?.work_end ?? '16:30');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!name.trim()) {
      setErr('Name is required.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const body = {
        name: name.trim(),
        initials: initials.trim() || undefined,
        role,
        color,
        home_address: home_address.trim() || undefined,
        work_start,
        work_end,
      };
      const emp = editing
        ? await api.updateEmployee(existing!.id, body)
        : await api.createEmployee(body as any);
      onCreated(emp);
      onClose();
    } catch (e: any) {
      setErr(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit contractor' : 'Add a contractor / tech'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Micaiah Brown"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Initials (badge)">
          <input
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase())}
            placeholder="auto from name"
            maxLength={4}
            className={inputCls}
          />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>

        <Field label="Workday start">
          <input type="time" value={work_start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Workday end">
          <input type="time" value={work_end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Home / start address (where their day begins — used for routing)">
            <input
              value={home_address}
              onChange={(e) => setHome(e.target.value)}
              placeholder="Leave blank to start from the Monroe office"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">Map color</span>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-slate-800' : ''}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      </div>

      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || !name.trim()}>
          {editing ? 'Save changes' : 'Add contractor'}
        </Button>
      </div>
    </Modal>
  );
}
