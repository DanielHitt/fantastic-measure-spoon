import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Data layer with two interchangeable back ends, chosen by environment:
 *   - DATABASE_URL set  -> PostgreSQL (Supabase / Neon / any Postgres) — used in production
 *   - otherwise         -> local SQLite file — zero-config local development
 *
 * All app queries use `?` placeholders, RETURNING, CURRENT_TIMESTAMP/CURRENT_DATE,
 * and ON CONFLICT — which work identically on both engines — so the same SQL runs
 * against either back end.
 */
export type Dialect = 'sqlite' | 'pg';
export const dialect: Dialect = process.env.DATABASE_URL ? 'pg' : 'sqlite';

export interface Querier {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  run(sql: string, params?: any[]): Promise<void>;
}

export interface Db extends Querier {
  tx<T>(fn: (q: Querier) => Promise<T>): Promise<T>;
}

// ----------------------------------------------------------------- SQLite
function makeSqlite(): Db {
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const dbFile = process.env.DATABASE_FILE
    ? resolve(__dirname, '..', process.env.DATABASE_FILE)
    : resolve(__dirname, '..', 'data', 'scheduler.db');
  mkdirSync(dirname(dbFile), { recursive: true });
  const raw = new Database(dbFile);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  const q: Querier = {
    async query(sql, params = []) {
      return raw.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return raw.prepare(sql).get(...params);
    },
    async run(sql, params = []) {
      raw.prepare(sql).run(...params);
    },
  };
  return {
    ...q,
    async tx(fn) {
      raw.exec('BEGIN');
      try {
        const r = await fn(q);
        raw.exec('COMMIT');
        return r;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

// ----------------------------------------------------------------- Postgres
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Postgres schema this app lives in. Lets the app share a Postgres project
 *  with other apps without colliding — set DB_SCHEMA (default "public"). */
export const pgSchema = (process.env.DB_SCHEMA || 'public').replace(/[^a-zA-Z0-9_]/g, '') || 'public';

async function makePg(): Promise<Db> {
  const pg = await import('pg');
  const { Pool, types } = pg.default ?? pg;
  // return bigint (COUNT / SUM) as JS numbers so results match the SQLite back end
  types.setTypeParser(20, (v: string) => (v === null ? null : parseInt(v, 10)));
  const url = process.env.DATABASE_URL!;
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX) || 4,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  // every connection resolves unqualified table names to our schema
  pool.on('connect', (c) => {
    c.query(`SET search_path TO ${pgSchema}, public`);
  });

  const querier = (exec: (sql: string, params: any[]) => Promise<{ rows: any[] }>): Querier => ({
    async query(sql, params = []) {
      return (await exec(toPg(sql), params)).rows;
    },
    async get(sql, params = []) {
      return (await exec(toPg(sql), params)).rows[0];
    },
    async run(sql, params = []) {
      await exec(toPg(sql), params);
    },
  });

  const base = querier((sql, params) => pool.query(sql, params));
  return {
    ...base,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const q = querier((sql, params) => client.query(sql, params));
        const r = await fn(q);
        await client.query('COMMIT');
        return r;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

// ----------------------------------------------------------------- singleton
let _db: Db | null = null;
let _ready: Promise<Db> | null = null;

export async function getDb(): Promise<Db> {
  if (_db) return _db;
  if (!_ready) {
    _ready = (dialect === 'pg' ? makePg() : Promise.resolve(makeSqlite())).then((d) => (_db = d));
  }
  return _ready;
}

// ----------------------------------------------------------------- schema
export async function initSchema(): Promise<void> {
  const db = await getDb();
  const id =
    dialect === 'pg'
      ? 'INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY'
      : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  // timestamp default stored as TEXT so the two engines behave identically
  const ts = dialect === 'pg' ? "TEXT NOT NULL DEFAULT (now()::text)" : 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP';

  // when on Postgres, isolate this app in its own schema
  if (dialect === 'pg') {
    await db.run(`CREATE SCHEMA IF NOT EXISTS ${pgSchema}`);
  }

  const stmts = [
    `CREATE TABLE IF NOT EXISTS employees (
      id ${id},
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Field Measure Tech',
      color TEXT NOT NULL DEFAULT '#2563eb',
      home_address TEXT,
      home_lat REAL,
      home_lng REAL,
      active INTEGER NOT NULL DEFAULT 1,
      work_start TEXT NOT NULL DEFAULT '07:30',
      work_end TEXT NOT NULL DEFAULT '16:30'
    )`,
    `CREATE TABLE IF NOT EXISTS scopes (
      code TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT NOT NULL,
      default_minutes INTEGER NOT NULL DEFAULT 60
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id ${id},
      name TEXT NOT NULL,
      builder TEXT,
      address TEXT,
      city TEXT,
      lat REAL,
      lng REAL,
      contact_name TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      office_notes TEXT,
      created_at ${ts}
    )`,
    `CREATE TABLE IF NOT EXISTS jobs (
      id ${id},
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      unit TEXT,
      scope_code TEXT,
      scope_raw TEXT,
      job_type TEXT NOT NULL DEFAULT 'measure',
      status TEXT NOT NULL DEFAULT 'unscheduled',
      scheduled_date TEXT,
      measure_date TEXT,
      install_date TEXT,
      est_minutes INTEGER NOT NULL DEFAULT 60,
      sequence INTEGER,
      priority INTEGER NOT NULL DEFAULT 0,
      time_window_start TEXT,
      time_window_end TEXT,
      created_at ${ts},
      updated_at ${ts}
    )`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_sched ON jobs(scheduled_date, employee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
    `CREATE TABLE IF NOT EXISTS notes (
      id ${id},
      job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      author TEXT,
      source TEXT NOT NULL DEFAULT 'office',
      body TEXT NOT NULL,
      entry_date TEXT,
      created_at ${ts}
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notes_job ON notes(job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id)`,
    `CREATE TABLE IF NOT EXISTS time_logs (
      id ${id},
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      arrived_at TEXT,
      departed_at TEXT,
      actual_minutes INTEGER,
      completion_status TEXT NOT NULL DEFAULT 'complete',
      note TEXT,
      created_at ${ts}
    )`,
    `CREATE INDEX IF NOT EXISTS idx_timelogs_job ON time_logs(job_id)`,
    `CREATE TABLE IF NOT EXISTS geocode_cache (
      query TEXT PRIMARY KEY,
      lat REAL,
      lng REAL,
      source TEXT,
      created_at ${ts}
    )`,
  ];
  for (const s of stmts) await db.run(s);
}
