import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dialect, getDb, initSchema, type Querier } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeedData {
  office: { name: string; address: string; lat: number; lng: number };
  employees: { name: string; initials: string; role: string; color: string }[];
  scopes: { code: string; label: string; category: string; default_minutes: number }[];
  projects: {
    name: string; builder: string; address: string; city: string;
    lat: number; lng: number; top_scopes: string[]; sample_units: string[]; total_history: number;
  }[];
  historical_jobs: any[];
  upcoming_jobs: any[];
  week_start: string;
}

function timeToHHMM(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2}):(\d{2})\s*([ap])m/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'p') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

async function run(): Promise<void> {
  await initSchema();
  const db = await getDb();

  // wipe (idempotent reseed)
  if (dialect === 'pg') {
    await db.run(
      'TRUNCATE time_logs, notes, jobs, projects, scopes, employees RESTART IDENTITY CASCADE',
    );
  } else {
    for (const t of ['time_logs', 'notes', 'jobs', 'projects', 'scopes', 'employees']) {
      await db.run(`DELETE FROM ${t}`);
    }
    await db.run(
      `DELETE FROM sqlite_sequence WHERE name IN ('jobs','projects','employees','notes','time_logs')`,
    );
  }

  const data = JSON.parse(readFileSync(resolve(__dirname, 'seed-data.json'), 'utf-8')) as SeedData;

  await db.tx(async (q: Querier) => {
    for (const e of data.employees) {
      await q.run(
        `INSERT INTO employees (name, initials, role, color, home_address, home_lat, home_lng)
         VALUES (?,?,?,?,?,?,?)`,
        [e.name, e.initials, e.role, e.color, data.office.name, data.office.lat, data.office.lng],
      );
    }

    for (const s of data.scopes) {
      await q.run('INSERT INTO scopes (code, label, category, default_minutes) VALUES (?,?,?,?)', [
        s.code, s.label, s.category, s.default_minutes,
      ]);
    }

    const projIds: number[] = []; // seed uses 1-based project_id
    for (let i = 0; i < data.projects.length; i++) {
      const p = data.projects[i];
      const row = (await q.get(
        `INSERT INTO projects (name, builder, address, city, lat, lng, office_notes)
         VALUES (?,?,?,?,?,?,?) RETURNING id`,
        [
          p.name, p.builder, p.address, p.city, p.lat, p.lng,
          i % 4 === 0
            ? `Active project — ${p.total_history} measures logged historically. Coordinate access with the site super before each visit.`
            : null,
        ],
      )) as any;
      projIds[i + 1] = row.id;
    }

    const insJob = async (j: any): Promise<number> => {
      const row = (await q.get(
        `INSERT INTO jobs (project_id, employee_id, unit, scope_code, scope_raw, job_type, status,
           scheduled_date, measure_date, install_date, est_minutes, sequence, priority)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        [
          j.project_id, j.employee_id ?? null, j.unit ?? '', j.scope_code ?? '', j.scope_raw ?? '',
          j.job_type ?? 'measure', j.status, j.scheduled_date ?? null, j.measure_date ?? null,
          j.install_date ?? null, j.est_minutes ?? 60, j.sequence ?? null, j.priority ?? 0,
        ],
      )) as any;
      return row.id;
    };

    // historical (completed) jobs with paper trail
    for (const h of data.historical_jobs) {
      const pid = projIds[h.project_id];
      if (!pid) continue;
      const jobId = await insJob({ ...h, project_id: pid, status: h.status ?? 'completed' });

      for (const n of h.notes_timeline ?? []) {
        const officeish = /per |rec'd|angie|liz|kevin|orren|office|sched/i.test(n.body);
        await q.run(
          `INSERT INTO notes (job_id, project_id, author, source, body, entry_date, created_at)
           VALUES (?,?,?,?,?,?,?)`,
          [jobId, pid, officeish ? 'Office' : 'Field', officeish ? 'office' : 'field', n.body, n.date, `${n.date} 12:00:00`],
        );
      }

      const arr = timeToHHMM(h.arrived_raw);
      const dep = timeToHHMM(h.departed_raw);
      if (arr || dep || h.actual_minutes) {
        await q.run(
          `INSERT INTO time_logs (job_id, employee_id, arrived_at, departed_at, actual_minutes, completion_status, note)
           VALUES (?,?,?,?,?,?,?)`,
          [
            jobId, h.employee_id ?? null, arr, dep, h.actual_minutes ?? null,
            h.completion_status ?? 'complete',
            h.completion_status === 'partial' ? 'Partially complete — see notes for what remains.' : null,
          ],
        );
      }
    }

    // upcoming jobs to schedule/route
    for (const u of data.upcoming_jobs) {
      const pid = projIds[u.project_id];
      if (!pid) continue;
      const jobId = await insJob({ ...u, project_id: pid, status: u.status ?? 'unscheduled' });
      if (u.office_note) {
        await q.run(
          `INSERT INTO notes (job_id, project_id, author, source, body, entry_date, created_at)
           VALUES (?,?,?,?,?,?,?)`,
          [jobId, pid, 'Coordinator', 'office', u.office_note, u.scheduled_date ?? data.week_start, `${u.scheduled_date ?? data.week_start} 08:00:00`],
        );
      }
    }
  });

  const count = async (t: string) => ((await db.get(`SELECT COUNT(*) c FROM ${t}`)) as any).c;
  console.log('Seed complete:', {
    employees: await count('employees'),
    scopes: await count('scopes'),
    projects: await count('projects'),
    jobs: await count('jobs'),
    notes: await count('notes'),
    time_logs: await count('time_logs'),
  });
  process.exit(0);
}

run().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
