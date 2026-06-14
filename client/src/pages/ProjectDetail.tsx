import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useAsync } from '../api';
import { COMPLETION_META, fmtDate, fmtMins } from '../lib';
import { PaperTrail } from '../components/PaperTrail';
import { JobDrawer } from '../components/JobDrawer';
import { Button, Field, ScopeBadge, Spinner, StatusBadge, TechChip, inputCls } from '../components/ui';

export function ProjectDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const { data, loading, reload } = useAsync(() => api.project(pid), [pid]);
  const [editing, setEditing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);

  if (loading || !data) return <Spinner />;
  const { project, jobs, notes, timeLogs } = data;

  const completed = jobs.filter((j) => j.status === 'completed').length;
  const open = jobs.filter((j) => j.status !== 'completed').length;

  return (
    <div className="space-y-4">
      <Link to="/projects" className="text-sm text-brand-600 hover:underline">
        ← All projects
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Left: header + jobs + trail */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold">{project.name}</h1>
                <p className="text-sm text-slate-500">
                  {project.address}
                  {project.city ? `, ${project.city}` : ''}
                </p>
              </div>
              <div className="text-right text-sm">
                <div className="text-emerald-600">{completed} completed</div>
                <div className="text-slate-500">{open} open</div>
              </div>
            </div>
          </div>

          {/* Jobs across all visits */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b px-4 py-2 text-sm font-semibold">
              Jobs & visits ({jobs.length})
            </h2>
            <div className="max-h-[360px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <tbody>
                  {jobs.map((j) => (
                    <tr
                      key={j.id}
                      className="cursor-pointer border-b hover:bg-slate-50"
                      onClick={() => setSelectedJob(j.id)}
                    >
                      <td className="px-3 py-2 text-slate-500">{fmtDate(j.measure_date || j.scheduled_date)}</td>
                      <td className="px-3 py-2">
                        <ScopeBadge code={j.scope_code} label={j.scope_label} />
                      </td>
                      <td className="px-3 py-2">{j.unit}</td>
                      <td className="px-3 py-2">
                        {j.employee_initials && <TechChip initials={j.employee_initials} color={j.employee_color} />}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={j.status} />
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500">
                        {j.actual_minutes != null ? fmtMins(j.actual_minutes) : fmtMins(j.est_minutes)}
                        {j.completion_status === 'partial' && (
                          <span className="ml-1 text-xs text-amber-600">↩</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Complete paper trail across the whole site */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Site paper trail — everything done here, most recent first
            </h2>
            <PaperTrail notes={notes} timeLogs={timeLogs} />
          </div>
        </div>

        {/* Right: contacts + office notes */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Site contact & office notes</h2>
              <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Cancel' : 'Edit'}
              </Button>
            </div>
            {editing ? (
              <EditProject project={project} onSaved={() => { setEditing(false); reload(); }} />
            ) : (
              <div className="space-y-2 text-sm">
                <Row label="Builder" value={project.builder} />
                <Row label="Contact" value={project.contact_name} />
                <Row label="Phone" value={project.contact_phone} />
                <Row label="Email" value={project.contact_email} />
                <div>
                  <div className="text-xs font-medium text-slate-400">Standing office notes</div>
                  <p className="whitespace-pre-wrap text-slate-700">
                    {project.office_notes || <span className="text-slate-400">None yet.</span>}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
            <p className="font-medium">How the paper trail works</p>
            <p className="mt-1 text-violet-800">
              Every measure/install visit, office instruction, and field note is logged here permanently. Whoever
              shows up next can see exactly what's been done and where to pick up.
            </p>
          </div>
        </div>
      </div>

      {selectedJob != null && (
        <JobDrawer
          jobId={selectedJob}
          role="coordinator"
          onClose={() => setSelectedJob(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className="text-right text-slate-700">{value || '—'}</span>
    </div>
  );
}

function EditProject({
  project,
  onSaved,
}: {
  project: any;
  onSaved: () => void;
}) {
  const [contact_name, setName] = useState(project.contact_name ?? '');
  const [contact_phone, setPhone] = useState(project.contact_phone ?? '');
  const [contact_email, setEmail] = useState(project.contact_email ?? '');
  const [office_notes, setNotes] = useState(project.office_notes ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.updateProject(project.id, { contact_name, contact_phone, contact_email, office_notes });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Field label="Contact name">
        <input value={contact_name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Phone">
        <input value={contact_phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Email">
        <input value={contact_email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Standing office notes (always shown to field)">
        <textarea value={office_notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={inputCls} />
      </Field>
      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}
