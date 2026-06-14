import { Router } from 'express';
import { db } from '../db.js';

export const jobsRouter = Router();

const JOB_SELECT = `
  SELECT j.*, p.name AS project_name, p.builder, p.address, p.city, p.lat, p.lng,
         p.contact_name, p.contact_phone, p.contact_email,
         e.name AS employee_name, e.initials AS employee_initials, e.color AS employee_color,
         s.label AS scope_label, s.category AS scope_category,
         (SELECT COUNT(*) FROM notes n WHERE n.job_id = j.id) AS note_count,
         (SELECT actual_minutes FROM time_logs t WHERE t.job_id = j.id ORDER BY t.id DESC LIMIT 1) AS actual_minutes,
         (SELECT completion_status FROM time_logs t WHERE t.job_id = j.id ORDER BY t.id DESC LIMIT 1) AS completion_status,
         (SELECT arrived_at FROM time_logs t WHERE t.job_id = j.id ORDER BY t.id DESC LIMIT 1) AS arrived_at,
         (SELECT departed_at FROM time_logs t WHERE t.job_id = j.id ORDER BY t.id DESC LIMIT 1) AS departed_at
  FROM jobs j
  JOIN projects p ON p.id = j.project_id
  LEFT JOIN employees e ON e.id = j.employee_id
  LEFT JOIN scopes s ON s.code = j.scope_code
`;

// List jobs with filters
jobsRouter.get('/jobs', (req, res) => {
  const where: string[] = [];
  const params: any[] = [];
  if (req.query.date) {
    where.push('j.scheduled_date = ?');
    params.push(req.query.date);
  }
  if (req.query.from && req.query.to) {
    where.push('j.scheduled_date BETWEEN ? AND ?');
    params.push(req.query.from, req.query.to);
  }
  if (req.query.employee) {
    if (req.query.employee === 'unassigned') where.push('j.employee_id IS NULL');
    else {
      where.push('j.employee_id = ?');
      params.push(Number(req.query.employee));
    }
  }
  if (req.query.status) {
    where.push('j.status = ?');
    params.push(req.query.status);
  }
  if (req.query.project) {
    where.push('j.project_id = ?');
    params.push(Number(req.query.project));
  }
  const sql =
    JOB_SELECT +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY j.scheduled_date, COALESCE(j.sequence, 999), j.id';
  res.json(db.prepare(sql).all(...params));
});

jobsRouter.get('/jobs/:id', (req, res) => {
  const job = db.prepare(JOB_SELECT + ' WHERE j.id = ?').get(Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'not found' });
  const notes = db
    .prepare(
      `SELECT * FROM notes WHERE job_id = ? ORDER BY COALESCE(entry_date, created_at) DESC, id DESC`,
    )
    .all(Number(req.params.id));
  const timeLogs = db
    .prepare(
      `SELECT tl.*, e.initials AS employee_initials FROM time_logs tl
       LEFT JOIN employees e ON e.id = tl.employee_id
       WHERE tl.job_id = ? ORDER BY tl.created_at DESC`,
    )
    .all(Number(req.params.id));
  res.json({ job, notes, timeLogs });
});

jobsRouter.post('/jobs', (req, res) => {
  const b = req.body;
  if (!b.project_id) return res.status(400).json({ error: 'project_id required' });
  const scope = b.scope_code
    ? (db.prepare('SELECT default_minutes FROM scopes WHERE code = ?').get(b.scope_code) as any)
    : null;
  const r = db
    .prepare(
      `INSERT INTO jobs (project_id, employee_id, unit, scope_code, scope_raw, job_type, status,
        scheduled_date, measure_date, install_date, est_minutes, priority, time_window_start, time_window_end)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      b.project_id,
      b.employee_id ?? null,
      b.unit ?? '',
      b.scope_code ?? null,
      b.scope_raw ?? b.scope_code ?? '',
      b.job_type ?? 'measure',
      b.employee_id && b.scheduled_date ? 'scheduled' : 'unscheduled',
      b.scheduled_date ?? null,
      b.measure_date ?? null,
      b.install_date ?? null,
      b.est_minutes ?? scope?.default_minutes ?? 60,
      b.priority ?? 0,
      b.time_window_start ?? null,
      b.time_window_end ?? null,
    );
  res.json(db.prepare(JOB_SELECT + ' WHERE j.id = ?').get(Number(r.lastInsertRowid)));
});

// Assign / reschedule / edit a job
jobsRouter.patch('/jobs/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
  if (!existing) return res.status(404).json({ error: 'not found' });
  const allowed = [
    'employee_id',
    'scheduled_date',
    'measure_date',
    'install_date',
    'unit',
    'scope_code',
    'scope_raw',
    'est_minutes',
    'sequence',
    'priority',
    'status',
    'time_window_start',
    'time_window_end',
    'job_type',
  ];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of allowed) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  // auto status transitions on (re)assignment unless explicitly set
  if (!('status' in req.body)) {
    const emp = 'employee_id' in req.body ? req.body.employee_id : existing.employee_id;
    const sched = 'scheduled_date' in req.body ? req.body.scheduled_date : existing.scheduled_date;
    if (existing.status !== 'completed' && existing.status !== 'in_progress') {
      const newStatus = emp && sched ? 'scheduled' : 'unscheduled';
      sets.push('status = ?');
      vals.push(newStatus);
    }
  }
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare(JOB_SELECT + ' WHERE j.id = ?').get(id));
});

jobsRouter.delete('/jobs/:id', (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Notes (paper trail) ----
jobsRouter.post('/jobs/:id/notes', (req, res) => {
  const id = Number(req.params.id);
  const job = db.prepare('SELECT project_id FROM jobs WHERE id = ?').get(id) as any;
  if (!job) return res.status(404).json({ error: 'not found' });
  const { body, source, author } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });
  const r = db
    .prepare(
      `INSERT INTO notes (job_id, project_id, author, source, body, entry_date)
       VALUES (?,?,?,?,?,date('now'))`,
    )
    .run(id, job.project_id, author ?? (source === 'office' ? 'Coordinator' : 'Field'), source ?? 'field', body);
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(r.lastInsertRowid)));
});

// ---- Time logs (actual hours + completion) ----
jobsRouter.post('/jobs/:id/timelogs', (req, res) => {
  const id = Number(req.params.id);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
  if (!job) return res.status(404).json({ error: 'not found' });
  const { arrived_at, departed_at, completion_status, note, employee_id } = req.body;
  const actual = minutesBetween(arrived_at, departed_at);
  const r = db
    .prepare(
      `INSERT INTO time_logs (job_id, employee_id, arrived_at, departed_at, actual_minutes, completion_status, note)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      employee_id ?? job.employee_id ?? null,
      arrived_at ?? null,
      departed_at ?? null,
      actual,
      completion_status ?? 'complete',
      note ?? null,
    );

  // reflect completion on the job
  let newStatus = job.status;
  if (completion_status === 'complete') newStatus = 'completed';
  else if (completion_status === 'partial') newStatus = 'in_progress';
  else if (completion_status === 'blocked') newStatus = 'blocked';
  else if (arrived_at && !departed_at) newStatus = 'in_progress';
  db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, id);

  // a completion note becomes part of the paper trail too
  if (note) {
    db.prepare(
      `INSERT INTO notes (job_id, project_id, author, source, body, entry_date)
       VALUES (?,?,?,?,?,date('now'))`,
    ).run(id, job.project_id, 'Field', 'field', `[${completion_status ?? 'update'}] ${note}`);
  }

  res.json(db.prepare('SELECT * FROM time_logs WHERE id = ?').get(Number(r.lastInsertRowid)));
});

function minutesBetween(a?: string, b?: string): number | null {
  const pa = parseHHMM(a);
  const pb = parseHHMM(b);
  if (pa == null || pb == null) return null;
  let d = pb - pa;
  if (d < 0) d += 24 * 60;
  return d;
}
function parseHHMM(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
