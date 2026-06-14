import { useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import type { Employee } from '../types';
import { AddContractorModal } from '../components/AddContractorModal';
import { Button } from '../components/ui';

export function Team() {
  const { employees, reloadEmployees } = useSession();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  async function deactivate(emp: Employee) {
    if (!confirm(`Remove ${emp.name} from the active team? Their past jobs and history stay intact.`)) return;
    await api.updateEmployee(emp.id, { active: 0 });
    reloadEmployees();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Team / Contractors</h1>
        <span className="text-sm text-slate-400">{employees.length} active</span>
        <Button className="ml-auto" onClick={() => setAdding(true)}>
          + Add contractor
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {employees.map((e) => (
          <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: e.color }}
              >
                {e.initials}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{e.name}</div>
                <div className="text-xs text-slate-500">{e.role}</div>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-sm text-slate-500">
              <div>
                Workday {e.work_start}–{e.work_end}
              </div>
              <div className="truncate">Starts from: {e.home_address || 'Monroe office'}</div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(e)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deactivate(e)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <AddContractorModal open onClose={() => setAdding(false)} onCreated={() => reloadEmployees()} />
      )}
      {editing && (
        <AddContractorModal
          open
          existing={editing}
          onClose={() => setEditing(null)}
          onCreated={() => {
            setEditing(null);
            reloadEmployees();
          }}
        />
      )}
    </div>
  );
}
