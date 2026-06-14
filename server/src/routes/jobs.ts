import { Router } from 'express';
import { getDb } from '../db.js';

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
jobsRouter.get('/jobs', async (req, res) => {
  const db = await getDb();
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
  res.json(await db.query(sql, params));
});

jobsRouter.get('/jobs/:id', async (req, res) => {
  const db = await getDb();
  const id = Number(req.params.id);
  const job = await db.get(JOB_SELECT + ' WHERE j.id = ?', [id]);
  if (!job) return res.status(404).json({ error: 'not found' });
  const notes = await db.query(
    `SELECT * FROM notes WHERE job_id = ? ORDER BY COALESCE(entry_date, created_at) DESC, id DESC`,
    [id],
  );
  const timeLogs = await db.query(
    `SELECT tl.*, e.initials AS employee_initials FROM time_logs tl
     LEFT JOIN employees e ON e.id = tl.employee_id
     WHERE tl.job_id = ? ORDER BY tl.created_at DESC`,
    [id],
  );
  res.json({ job, notes, timeLogs });
});

jobsRouter.post('/jobs', async (req, res) => {
  const db = await getDb();
  const b = req.body;
  if (!b.project_id) return res.status(400).json({ error: 'project_id required' });
  const scope = b.scope_code
    ? ((await db.get('SELECT default_minutes FROM scopes WHERE code = ?', [b.scope_code])) as any)
    : null;
  const created = (await db.get(
    `INSERT INTO jobs (project_id, employee_id, unit, scope_code, scope_raw, job_type, status,
      scheduled_date, measure_date, install_date, est_minutes, priority, time_window_start, time_window_end)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    [
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
    ],
  )) as any;
  res.json(await db.get(JOB_SELECT + ' WHERE j.id = ?', [created.id]));
});

// Assign / reschedule / edit a job
jobsRouter.patch('/jobs/:id', async (req, res) => {
  const db = await getDb();
  const id = Number(req.params.id);
  const existing = (await db.get('SELECT * FROM jobs WHERE id = ?', [id])) as any;
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
  if (!('status' in req.body)) {
    const emp = 'employee_id' in req.body ? req.body.employee_id : existing.employee_id;
    const sched = 'scheduled_date' in req.body ? req.body.scheduled_date : existing.scheduled_date;
    if (existing.status !== 'completed' && existing.status !== 'in_progress') {
      sets.push('status = ?');
      vals.push(emp && sched ? 'scheduled' : 'unscheduled');
    }
  }
  sets.push('updated_at = ?');
  vals.push(new Date().toISOString());
  vals.push(id);
  await db.run(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, vals);
  res.json(await db.get(JOB_SELECT + ' WHERE j.id = ?', [id]));
});

jobsRouter.delete('/jobs/:id', async (req, res) => {
  const db = await getDb();
  await db.run('DELETE FROM jobs WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---- Notes (paper trail) ----
jobsRouter.post('/jobs/:id/notes', async (req, res) => {
  const db = await getDb();
  const id = Number(req.params.id);
  const job = (await db.get('SELECT project_id FROM jobs WHERE id = ?', [id])) as any;
  if (!job) return res.status(404).json({ error: 'not found' });
  const { body, source, author } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.get(
    `INSERT INTO notes (job_id, project_id, author, source, body, entry_date)
     VALUES (?,?,?,?,?,?) RETURNING *`,
    [id, job.project_id, author ?? (source === 'office' ? 'Coordinator' : 'Field'), source ?? 'field', body, today],
  );
  res.json(row);
});

// ---- Time logs (actual hours + completion) ----
jobsRouter.post('/jobs/:id/timelogs', async (req, res) => {
  const db = await getDb();
  const id = Number(req.params.id);
  const job = (await db.get('SELECT * FROM jobs WHERE id = ?', [id])) as any;
  if (!job) return res.status(404).json({ error: 'not found' });
  const { arrived_at, departed_at, completion_status, note, employee_id } = req.body;
  const actual = minutesBetween(arrived_at, departed_at);
  const row = await db.get(
    `INSERT INTO time_logs (job_id, employee_id, arrived_at, departed_at, actual_minutes, completion_status, note)
     VALUES (?,?,?,?,?,?,?) RETURNING *`,
    [
      id,
      employee_id ?? job.employee_id ?? null,
      arrived_at ?? null,
      departed_at ?? null,
      actual,
      completion_status ?? 'complete',
      note ?? null,
    ],
  );

  // reflect completion on the job
  let newStatus = job.status;
  if (completion_status === 'complete') newStatus = 'completed';
  else if (completion_status === 'partial') newStatus = 'in_progress';
  else if (completion_status === 'blocked') newStatus = 'blocked';
  else if (arrived_at && !departed_at) newStatus = 'in_progress';
  await db.run('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?', [newStatus, new Date().toISOString(), id]);

  if (note) {
    await db.run(
      `INSERT INTO notes (job_id, project_id, author, source, body, entry_date)
       VALUES (?,?,?,?,?,?)`,
      [id, job.project_id, 'Field', 'field', `[${completion_status ?? 'update'}] ${note}`, new Date().toISOString().slice(0, 10)],
    );
  }

  res.json(row);
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
