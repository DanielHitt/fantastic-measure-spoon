import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbFile = process.env.DATABASE_FILE
  ? resolve(__dirname, '..', process.env.DATABASE_FILE)
  : resolve(__dirname, '..', 'data', 'scheduler.db');

mkdirSync(dirname(dbFile), { recursive: true });

export const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    initials     TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'Field Measure Tech',
    color        TEXT NOT NULL DEFAULT '#2563eb',
    home_address TEXT,
    home_lat     REAL,
    home_lng     REAL,
    active       INTEGER NOT NULL DEFAULT 1,
    work_start   TEXT NOT NULL DEFAULT '07:30',
    work_end     TEXT NOT NULL DEFAULT '16:30'
  );

  CREATE TABLE IF NOT EXISTS scopes (
    code            TEXT PRIMARY KEY,
    label           TEXT NOT NULL,
    category        TEXT NOT NULL,
    default_minutes INTEGER NOT NULL DEFAULT 60
  );

  CREATE TABLE IF NOT EXISTS projects (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    builder       TEXT,
    address       TEXT,
    city          TEXT,
    lat           REAL,
    lng           REAL,
    contact_name  TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    office_notes  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    employee_id       INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    unit              TEXT,
    scope_code        TEXT,
    scope_raw         TEXT,
    job_type          TEXT NOT NULL DEFAULT 'measure',
    status            TEXT NOT NULL DEFAULT 'unscheduled',
    scheduled_date    TEXT,
    measure_date      TEXT,
    install_date      TEXT,
    est_minutes       INTEGER NOT NULL DEFAULT 60,
    sequence          INTEGER,
    priority          INTEGER NOT NULL DEFAULT 0,
    time_window_start TEXT,
    time_window_end   TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_sched ON jobs(scheduled_date, employee_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    author     TEXT,
    source     TEXT NOT NULL DEFAULT 'office',
    body       TEXT NOT NULL,
    entry_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notes_job ON notes(job_id);
  CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);

  CREATE TABLE IF NOT EXISTS time_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id            INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    employee_id       INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    arrived_at        TEXT,
    departed_at       TEXT,
    actual_minutes    INTEGER,
    completion_status TEXT NOT NULL DEFAULT 'complete',
    note              TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_timelogs_job ON time_logs(job_id);

  CREATE TABLE IF NOT EXISTS geocode_cache (
    query      TEXT PRIMARY KEY,
    lat        REAL,
    lng        REAL,
    source     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);
}
