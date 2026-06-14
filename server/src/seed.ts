import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initSchema } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeedData {
  office: { name: string; address: string; lat: number; lng: number };
  employees: { name: string; initials: string; role: string; color: string }[];
  scopes: { code: string; label: string; category: string; default_minutes: number }[];
  projects: {
    name: string;
    builder: string;
    address: string;
    city: string;
    lat: number;
    lng: number;
    top_scopes: string[];
    sample_units: string[];
    total_history: number;
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

function run(): void {
  initSchema();

  // wipe (idempotent reseed)
  db.exec(`
    DELETE FROM time_logs; DELETE FROM notes; DELETE FROM jobs;
    DELETE FROM projects; DELETE FROM scopes; DELETE FROM employees;
    DELETE FROM sqlite_sequence WHERE name IN ('jobs','projects','employees','notes','time_logs');
  `);

  const data = JSON.parse(
    readFileSync(resolve(__dirname, 'seed-data.json'), 'utf-8'),
  ) as SeedData;

  const insEmp = db.prepare(
    `INSERT INTO employees (name, initials, role, color, home_address, home_lat, home_lng)
     VALUES (@name, @initials, @role, @color, @home_address, @home_lat, @home_lng)`,
  );
  for (const e of data.employees) {
    insEmp.run({
      ...e,
      home_address: data.office.name,
      home_lat: data.office.lat,
      home_lng: data.office.lng,
    });
  }

  const insScope = db.prepare(
    `INSERT INTO scopes (code, label, category, default_minutes) VALUES (?,?,?,?)`,
  );
  for (const s of data.scopes) insScope.run(s.code, s.label, s.category, s.default_minutes);

  const insProj = db.prepare(
    `INSERT INTO projects (name, builder, address, city, lat, lng, office_notes)
     VALUES (@name, @builder, @address, @city, @lat, @lng, @office_notes)`,
  );
  const projIds: number[] = [];
  data.projects.forEach((p, i) => {
    const r = insProj.run({
      name: p.name,
      builder: p.builder,
      address: p.address,
      city: p.city,
      lat: p.lat,
      lng: p.lng,
      office_notes:
        i % 4 === 0
          ? `Active project — ${p.total_history} measures logged historically. Coordinate access with the site super before each visit.`
          : null,
    });
    projIds[i + 1] = Number(r.lastInsertRowid); // seed uses 1-based project_id
  });

  const insJob = db.prepare(
    `INSERT INTO jobs (project_id, employee_id, unit, scope_code, scope_raw, job_type, status,
       scheduled_date, measure_date, install_date, est_minutes, sequence, priority)
     VALUES (@project_id, @employee_id, @unit, @scope_code, @scope_raw, @job_type, @status,
       @scheduled_date, @measure_date, @install_date, @est_minutes, @sequence, @priority)`,
  );
  const insNote = db.prepare(
    `INSERT INTO notes (job_id, project_id, author, source, body, entry_date, created_at)
     VALUES (@job_id, @project_id, @author, @source, @body, @entry_date, @created_at)`,
  );
  const insLog = db.prepare(
    `INSERT INTO time_logs (job_id, employee_id, arrived_at, departed_at, actual_minutes, completion_status, note)
     VALUES (@job_id, @employee_id, @arrived_at, @departed_at, @actual_minutes, @completion_status, @note)`,
  );

  const seedAll = db.transaction(() => {
    // historical (completed) jobs with paper trail
    for (const h of data.historical_jobs) {
      const pid = projIds[h.project_id];
      if (!pid) continue;
      const r = insJob.run({
        project_id: pid,
        employee_id: h.employee_id ?? null,
        unit: h.unit ?? '',
        scope_code: h.scope_code ?? '',
        scope_raw: h.scope_raw ?? '',
        job_type: h.job_type ?? 'measure',
        status: h.status ?? 'completed',
        scheduled_date: h.scheduled_date ?? null,
        measure_date: h.measure_date ?? null,
        install_date: h.install_date ?? null,
        est_minutes: h.est_minutes ?? 60,
        sequence: null,
        priority: 0,
      });
      const jobId = Number(r.lastInsertRowid);

      for (const n of h.notes_timeline ?? []) {
        // dated note entries → mostly field-side paper trail, some office-side
        const officeish = /per |rec'd|angie|liz|kevin|orren|office|sched/i.test(n.body);
        insNote.run({
          job_id: jobId,
          project_id: pid,
          author: officeish ? 'Office' : 'Field',
          source: officeish ? 'office' : 'field',
          body: n.body,
          entry_date: n.date,
          created_at: `${n.date} 12:00:00`,
        });
      }

      const arr = timeToHHMM(h.arrived_raw);
      const dep = timeToHHMM(h.departed_raw);
      if (arr || dep || h.actual_minutes) {
        insLog.run({
          job_id: jobId,
          employee_id: h.employee_id ?? null,
          arrived_at: arr,
          departed_at: dep,
          actual_minutes: h.actual_minutes ?? null,
          completion_status: h.completion_status ?? 'complete',
          note:
            h.completion_status === 'partial'
              ? 'Partially complete — see notes for what remains.'
              : null,
        });
      }
    }

    // upcoming jobs to schedule/route
    for (const u of data.upcoming_jobs) {
      const pid = projIds[u.project_id];
      if (!pid) continue;
      const r = insJob.run({
        project_id: pid,
        employee_id: u.employee_id ?? null,
        unit: u.unit ?? '',
        scope_code: u.scope_code ?? '',
        scope_raw: u.scope_raw ?? '',
        job_type: u.job_type ?? 'measure',
        status: u.status ?? 'unscheduled',
        scheduled_date: u.scheduled_date ?? null,
        measure_date: u.measure_date ?? null,
        install_date: u.install_date ?? null,
        est_minutes: u.est_minutes ?? 60,
        sequence: null,
        priority: u.priority ?? 0,
      });
      const jobId = Number(r.lastInsertRowid);
      if (u.office_note) {
        insNote.run({
          job_id: jobId,
          project_id: pid,
          author: 'Coordinator',
          source: 'office',
          body: u.office_note,
          entry_date: u.scheduled_date ?? data.week_start,
          created_at: `${u.scheduled_date ?? data.week_start} 08:00:00`,
        });
      }
    }
  });
  seedAll();

  const counts = {
    employees: (db.prepare('SELECT COUNT(*) c FROM employees').get() as any).c,
    scopes: (db.prepare('SELECT COUNT(*) c FROM scopes').get() as any).c,
    projects: (db.prepare('SELECT COUNT(*) c FROM projects').get() as any).c,
    jobs: (db.prepare('SELECT COUNT(*) c FROM jobs').get() as any).c,
    notes: (db.prepare('SELECT COUNT(*) c FROM notes').get() as any).c,
    time_logs: (db.prepare('SELECT COUNT(*) c FROM time_logs').get() as any).c,
  };
  console.log('Seed complete:', counts);
}

run();
