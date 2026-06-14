import { Router } from 'express';
import { getDb } from '../db.js';
import { optimizeRoute, type OptStop } from '../routing/optimize.js';

export const routeRouter = Router();

const OFFICE_FALLBACK = { name: 'Dee Inc — Monroe Office', lat: 47.8554, lng: -121.9715 };

async function startLocationFor(employeeId: number | null) {
  const db = await getDb();
  if (employeeId) {
    const e = (await db.get(
      'SELECT name, home_address, home_lat, home_lng, work_start FROM employees WHERE id = ?',
      [employeeId],
    )) as any;
    if (e?.home_lat != null) {
      return {
        loc: { name: e.home_address || OFFICE_FALLBACK.name, lat: e.home_lat, lng: e.home_lng },
        workStart: e.work_start || '07:30',
      };
    }
  }
  return { loc: OFFICE_FALLBACK, workStart: '07:30' };
}

async function stopsFromJobs(jobIds: number[]): Promise<OptStop[]> {
  if (!jobIds.length) return [];
  const db = await getDb();
  const placeholders = jobIds.map(() => '?').join(',');
  const rows = (await db.query(
    `SELECT j.id, j.project_id, j.unit, j.scope_code, j.est_minutes, j.priority,
            j.time_window_start, j.time_window_end, p.name AS project_name, p.lat, p.lng
     FROM jobs j JOIN projects p ON p.id = j.project_id
     WHERE j.id IN (${placeholders})`,
    jobIds,
  )) as any[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return jobIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((r: any) => ({
      jobId: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      unit: r.unit ?? '',
      scopeCode: r.scope_code ?? '',
      lat: r.lat,
      lng: r.lng,
      estMinutes: r.est_minutes ?? 60,
      priority: r.priority ?? 0,
      windowStart: r.time_window_start,
      windowEnd: r.time_window_end,
    }));
}

function buildStartTime(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm.length === 5 ? hhmm : '07:30'}:00`);
}

// Optimize (or just sequence) a tech's day
routeRouter.post('/route/optimize', async (req, res) => {
  const db = await getDb();
  const employeeId: number | null = req.body.employeeId ?? null;
  const date: string = req.body.date;
  if (!date) return res.status(400).json({ error: 'date required' });

  const jobRows = (await db.query(
    `SELECT id FROM jobs
     WHERE scheduled_date = ? AND ${employeeId ? 'employee_id = ?' : 'employee_id IS NULL'}
       AND status NOT IN ('completed')
     ORDER BY COALESCE(sequence, 999), id`,
    employeeId ? [date, employeeId] : [date],
  )) as { id: number }[];

  const { loc, workStart } = await startLocationFor(employeeId);
  const startTime = buildStartTime(date, req.body.startTime ?? workStart);

  const plan = await optimizeRoute({
    start: loc,
    startTime,
    stops: await stopsFromJobs(jobRows.map((j) => j.id)),
    returnToStart: req.body.returnToStart ?? true,
    lockOrder: req.body.lockOrder ?? false,
    workdayMinutes: req.body.workdayMinutes ?? 9 * 60,
  });
  plan.employeeId = employeeId;

  if (req.body.save) {
    await db.tx(async (q) => {
      for (const s of plan.stops) await q.run('UPDATE jobs SET sequence = ? WHERE id = ?', [s.sequence, s.jobId]);
    });
  }

  res.json(plan);
});

// Preview a route for an arbitrary set of jobs (e.g. before committing an assignment)
routeRouter.post('/route/preview', async (req, res) => {
  const jobIds: number[] = req.body.jobIds ?? [];
  const date: string = req.body.date ?? new Date().toISOString().slice(0, 10);
  const employeeId: number | null = req.body.employeeId ?? null;
  const { loc, workStart } = await startLocationFor(employeeId);
  const plan = await optimizeRoute({
    start: loc,
    startTime: buildStartTime(date, req.body.startTime ?? workStart),
    stops: await stopsFromJobs(jobIds),
    returnToStart: req.body.returnToStart ?? true,
    lockOrder: req.body.lockOrder ?? false,
  });
  plan.employeeId = employeeId;
  res.json(plan);
});

// Weekly board: days × techs + unassigned backlog
routeRouter.get('/schedule/week', async (req, res) => {
  const db = await getDb();
  const start = (req.query.start as string) || (await defaultWeekStart());
  const days = Array.from({ length: 5 }, (_, i) => addDays(start, i));
  const end = days[days.length - 1];

  const jobs = await db.query(
    `SELECT j.id, j.project_id, j.employee_id, j.unit, j.scope_code, j.status,
            j.scheduled_date, j.est_minutes, j.sequence, j.priority,
            p.name AS project_name, p.city, p.lat, p.lng,
            s.label AS scope_label,
            (SELECT completion_status FROM time_logs t WHERE t.job_id = j.id ORDER BY t.id DESC LIMIT 1) AS completion_status,
            (SELECT actual_minutes FROM time_logs t WHERE t.job_id = j.id ORDER BY t.id DESC LIMIT 1) AS actual_minutes
     FROM jobs j JOIN projects p ON p.id = j.project_id
     LEFT JOIN scopes s ON s.code = j.scope_code
     WHERE j.scheduled_date BETWEEN ? AND ?
     ORDER BY j.scheduled_date, COALESCE(j.sequence, 999), j.id`,
    [start, end],
  );

  const unassigned = await db.query(
    `SELECT j.id, j.project_id, j.unit, j.scope_code, j.status, j.est_minutes, j.priority,
            p.name AS project_name, p.city, p.lat, p.lng, s.label AS scope_label
     FROM jobs j JOIN projects p ON p.id = j.project_id
     LEFT JOIN scopes s ON s.code = j.scope_code
     WHERE j.status = 'unscheduled'
     ORDER BY j.priority DESC, p.name LIMIT 200`,
  );

  res.json({ start, days, jobs, unassigned });
});

function mondayOf(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}
/** Soonest week (Monday) that has scheduled jobs on/after today; else this week. */
async function defaultWeekStart(): Promise<string> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const row = (await db.get(
    `SELECT MIN(scheduled_date) d FROM jobs WHERE scheduled_date >= ? AND status != 'completed'`,
    [today],
  )) as { d: string | null };
  const anchor = row?.d
    ? row.d
    : ((((await db.get(`SELECT MAX(scheduled_date) d FROM jobs`)) as { d: string | null }) ?? {}).d ?? today);
  return mondayOf(new Date(anchor + 'T00:00:00'));
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
