import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useAsync } from '../api';
import { fmtDate } from '../lib';
import { AddProjectModal } from '../components/AddProjectModal';
import { Button, Spinner } from '../components/ui';

export function Projects() {
  const { data, loading, reload } = useAsync(() => api.projects(), []);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return (data ?? []).filter(
      (p) => p.name.toLowerCase().includes(s) || (p.city ?? '').toLowerCase().includes(s),
    );
  }, [data, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Projects</h1>
        <span className="text-sm text-slate-400">{filtered.length} sites</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by project or city…"
          className="ml-auto w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <Button onClick={() => setAdding(true)}>+ Add job site</Button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2 text-right">Jobs</th>
                <th className="px-4 py-2 text-right">Completed</th>
                <th className="px-4 py-2">Last measure</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/projects/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    <div className="text-xs text-slate-400">{p.address}</div>
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">{p.city}</td>
                  <td className="px-4 py-2 text-right text-sm">{p.job_count}</td>
                  <td className="px-4 py-2 text-right text-sm text-emerald-600">{p.completed_count}</td>
                  <td className="px-4 py-2 text-sm text-slate-500">{fmtDate(p.last_measure)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddProjectModal
          open
          onClose={() => setAdding(false)}
          onCreated={(p) => {
            reload();
            navigate(`/projects/${p.id}`);
          }}
        />
      )}
    </div>
  );
}
