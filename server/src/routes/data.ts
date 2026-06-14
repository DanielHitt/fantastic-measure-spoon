import { Router } from 'express';
import { db } from '../db.js';
import { geocode } from '../geocode.js';

export const dataRouter = Router();

dataRouter.get('/employees', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM employees WHERE active = 1 ORDER BY role, name')
    .all();
  res.json(rows);
});

const OFFICE = { name: 'Dee Inc — Monroe Office', lat: 47.8554, lng: -121.9715 };
const PALETTE = ['#2563eb', '#16a34a', '#db2777', '#d97706', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626', '#0d9488', '#9333ea'];

function autoInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

dataRouter.post('/employees', async (req, res) => {
  const { name, role, color, home_address, work_start, work_end } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const initials = (req.body.initials || autoInitials(name)).slice(0, 4);
  const count = (db.prepare('SELECT COUNT(*) c FROM employees').get() as any).c;
  let lat = OFFICE.lat;
  let lng = OFFICE.lng;
  if (home_address) {
    const g = await geocode(home_address);
    lat = g.lat;
    lng = g.lng;
  }
  const r = db
    .prepare(
      `INSERT INTO employees (name, initials, role, color, home_address, home_lat, home_lng, work_start, work_end)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      name,
      initials,
      role || 'Field Measure Tech',
      color || PALETTE[count % PALETTE.length],
      home_address || OFFICE.name,
      lat,
      lng,
      work_start || '07:30',
      work_end || '16:30',
    );
  res.json(db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(r.lastInsertRowid)));
});

dataRouter.patch('/employees/:id', async (req, res) => {
  const id = Number(req.params.id);
  const fields = ['name', 'initials', 'role', 'color', 'work_start', 'work_end', 'active'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if ('home_address' in req.body) {
    const g = await geocode(req.body.home_address || OFFICE.name);
    sets.push('home_address = ?', 'home_lat = ?', 'home_lng = ?');
    vals.push(req.body.home_address || OFFICE.name, g.lat, g.lng);
  }
  if (sets.length) {
    vals.push(id);
    db.prepare(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM employees WHERE id = ?').get(id));
});


dataRouter.get('/scopes', (_req, res) => {
  res.json(db.prepare('SELECT * FROM scopes ORDER BY category, code').all());
});

dataRouter.get('/projects', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id) AS job_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id AND j.status = 'completed') AS completed_count,
        (SELECT MAX(measure_date) FROM jobs j WHERE j.project_id = p.id) AS last_measure
       FROM projects p ORDER BY p.name`,
    )
    .all();
  res.json(rows);
});

// Full project file: details + every job + the complete paper trail
dataRouter.get('/projects/:id', (req, res) => {
  const id = Number(req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'not found' });

  const jobs = db
    .prepare(
      `SELECT j.*, e.name AS employee_name, e.initials AS employee_initials, e.color AS employee_color
       FROM jobs j LEFT JOIN employees e ON e.id = j.employee_id
       WHERE j.project_id = ?
       ORDER BY COALESCE(j.measure_date, j.scheduled_date) DESC, j.id DESC`,
    )
    .all(id);

  const notes = db
    .prepare(
      `SELECT * FROM notes WHERE project_id = ?
       ORDER BY COALESCE(entry_date, created_at) DESC, id DESC`,
    )
    .all(id);

  const timeLogs = db
    .prepare(
      `SELECT tl.*, e.initials AS employee_initials
       FROM time_logs tl LEFT JOIN employees e ON e.id = tl.employee_id
       WHERE tl.job_id IN (SELECT id FROM jobs WHERE project_id = ?)
       ORDER BY tl.created_at DESC`,
    )
    .all(id);

  res.json({ project, jobs, notes, timeLogs });
});

dataRouter.patch('/projects/:id', (req, res) => {
  const id = Number(req.params.id);
  const fields = ['contact_name', 'contact_phone', 'contact_email', 'office_notes', 'address'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (!sets.length) return res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
  vals.push(id);
  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

dataRouter.post('/projects', async (req, res) => {
  const { name, builder, address, city, contact_name, contact_phone, contact_email } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const g = await geocode(`${name} ${address ?? ''} ${city ?? ''}`, city);
  const r = db
    .prepare(
      `INSERT INTO projects (name, builder, address, city, lat, lng, contact_name, contact_phone, contact_email)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(name, builder ?? null, address ?? null, city ?? null, g.lat, g.lng, contact_name ?? null, contact_phone ?? null, contact_email ?? null);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(r.lastInsertRowid)));
});

// Dashboard summary
dataRouter.get('/dashboard/stats', (req, res) => {
  const weekStart = (req.query.weekStart as string) || todayMonday();
  const weekEnd = addDays(weekStart, 6);

  const statusCounts = db
    .prepare(`SELECT status, COUNT(*) c FROM jobs GROUP BY status`)
    .all() as { status: string; c: number }[];

  const weekByDay = db
    .prepare(
      `SELECT scheduled_date AS day, COUNT(*) c,
              SUM(CASE WHEN employee_id IS NULL THEN 1 ELSE 0 END) AS unassigned
       FROM jobs WHERE scheduled_date BETWEEN ? AND ?
       GROUP BY scheduled_date ORDER BY scheduled_date`,
    )
    .all(weekStart, weekEnd);

  const unscheduled = (
    db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status = 'unscheduled'`).get() as any
  ).c;

  const perTechWeek = db
    .prepare(
      `SELECT e.id, e.name, e.initials, e.color,
              COUNT(j.id) AS jobs,
              COALESCE(SUM(j.est_minutes),0) AS est_minutes
       FROM employees e
       LEFT JOIN jobs j ON j.employee_id = e.id AND j.scheduled_date BETWEEN ? AND ?
       WHERE e.active = 1
       GROUP BY e.id ORDER BY e.name`,
    )
    .all(weekStart, weekEnd);

  res.json({ weekStart, weekEnd, statusCounts, weekByDay, unscheduled, perTechWeek });
});

function todayMonday(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
