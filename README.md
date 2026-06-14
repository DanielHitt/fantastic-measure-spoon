# Dee Field Scheduler

A web-based scheduling & routing dashboard for crews that **field-measure and install window coverings, mirrors, closet shelving, shower doors, and bath hardware**. It lets an office coordinator schedule and route multiple jobs per day per technician (Google-Maps-style multi-stop optimization with traffic and time-of-day), lets drivers log actual time and completion status in the field, and keeps a permanent **paper trail** per job site so anyone who shows up next knows exactly what's been done and what's left.

It was designed directly from a real operation's historical data — a year of weekly field-measure schedules (`2025 Monroe Field Measure`). See **[How the spreadsheet shaped this](#how-the-spreadsheet-shaped-this)**.

---

## What it does

### For the coordinator (office)
- **Weekly board** — technicians × weekdays, every job as a card. See stops, estimated hours per tech per day, and completion state at a glance.
- **Schedule jobs** — add a job, pick the project/builder, building/lot/unit, scope/product (auto-fills the estimated on-site minutes), assign a tech and date, optionally set an arrival time window and priority.
- **Backlog** — unscheduled jobs sit in a side panel; assign them to a tech/day in two clicks.
- **Route optimization** — for any tech-day, compute the most efficient stop order ("⚡ Optimize"). Drive times are **traffic- and time-of-day-aware**; the engine shows arrival/departure ETAs per stop, total drive vs. on-site time, miles, projected finish time, and warns when a day runs long or an arrival misses a time window. Save the optimized order back to the schedule.
- **Office → field notes** — leave instructions the field team sees on the job (gate codes, access, what to confirm on-site). These surface at the top of the job and in the project file.

### For the driver (field)
- **My Day** — a mobile-friendly, ordered route with a map. Each stop shows the ETA, drive time from the previous stop, scope, estimated minutes, and any office instructions.
- **Log your visit** — enter arrived/departed times (it computes actual minutes and compares to the estimate), mark **Complete / Partial — needs return / Blocked**, and write what was done and what's left for the next visit.
- **Field notes** — add a note for whoever shows up next.

### The paper trail (everyone)
- Every **project file** shows all jobs/visits across history plus a single chronological timeline merging office notes, field notes, and time logs. This is the "where do I pick up?" record the business asked for.

---

## How the spreadsheet shaped this

The historical workbook had 54 weekly tabs (~10,000 job rows) plus a coordination sheet, a "sites measure complete" archive, and a pretask/JHA sheet. The app's data model and defaults come straight from it:

| From the spreadsheet | In the app |
|---|---|
| Columns: WHO · Measure date · Builder/Project · Building/Lot/Unit · Scope/product · Install date · NOTES | The `jobs` schema and job cards |
| Field techs (MB, JJ, DM, GCA, Jared, Tina, Shane D…) | Seeded employees with initials/colors |
| Product codes (MR, WS, RS-Z, RS, V2, ABB, SD, ESD180…) | The scope catalog with categories |
| "Arrived: / Departed:" rows logged per site | Time logs → **actual minutes**, and the empirical **estimated minutes** per product (e.g. Mirror ≈ 55 min, Shelving ≈ 60, Zebra roller shade ≈ 75, Bath hardware ≈ 35), derived from 900+ real visit logs |
| NOTES written as dated entries ("9/8 no sills", "per Kevin 10/13 hung out") | The dated **paper-trail** timeline, split into office vs. field sources |
| Builder superintendents w/ phone/email | Project contact fields |
| 468 real projects with Puget Sound addresses | 80 geocoded projects seeded for the map/routing |

The seed includes ~600 completed historical jobs (with notes + actual-hours logs) and a populated upcoming week so the dashboard is useful immediately.

---

## Quick start

Requires Node 18+ (developed on Node 22).

```bash
npm run install:all     # install root, server, and client deps
npm run seed            # load the sample dataset into SQLite (server/data/scheduler.db)
npm run dev             # start API (http://localhost:4000) + client (http://localhost:5173)
```

Open **http://localhost:5173**. Toggle **Coordinator / Driver** in the top-right (Driver also picks which tech).

### Production build
```bash
npm run build           # builds client, compiles server
npm start               # serves the built app + API on http://localhost:4000
```

---

## Google Maps (optional, recommended for production)

Everything works with **no API key**: the map uses free OpenStreetMap tiles, addresses are placed from a built-in WA city table, and drive times come from a built-in heuristic (straight-line distance × road-circuity, with a Puget Sound commute curve so AM/PM peaks and midday traffic shift ETAs realistically).

For live, road-accurate, traffic-aware times and real geocoding, add a Google Maps Platform key (enable **Routes/Distance Matrix API** and **Geocoding API**):

```bash
cp .env.example .env        # set GOOGLE_MAPS_API_KEY=...
# optional: VITE_GOOGLE_MAPS_API_KEY for Google map tiles on the client
```

The server auto-detects the key (see the badge in the top bar: "🟢 Google traffic" vs "◷ Estimated times") and falls back to the heuristic if a call fails. No code changes needed.

---

## Architecture

```
server/   Express + better-sqlite3 (SQLite)         REST API on /api
  routing/provider.ts   traffic-aware travel-time engine (Google or heuristic)
  routing/optimize.ts   nearest-neighbor + 2-opt route optimizer w/ time windows
  geocode.ts            Google geocoding → WA city fallback, cached in SQLite
  seed.ts / seed-data.json   imports the dataset distilled from the workbook
client/   React + Vite + TypeScript + Tailwind + react-leaflet (OpenStreetMap)
```

Key API endpoints: `GET /api/schedule/week`, `POST /api/route/optimize`, `GET/POST /api/jobs`, `POST /api/jobs/:id/notes`, `POST /api/jobs/:id/timelogs`, `GET /api/projects/:id`.

The routing layer is provider-agnostic, so the optimizer and ETAs work identically whether drive times come from Google or the heuristic.

---

## Notes & next steps

- **Authentication** is intentionally simple for v1 — a role/tech switcher rather than per-user logins. Before real field use, add auth (each driver signs in) so time logs and notes are attributed to a verified user. The data model already records author/employee on every note and time log.
- **Persistence** is SQLite (`server/data/scheduler.db`, git-ignored). It's a single file and trivial to back up; the data layer is isolated so it can move to Postgres/Supabase for multi-user hosting without touching the UI.
- **Route lines** on the map connect stops directly; with a Google key you can additionally draw turn-by-turn road geometry.
- Re-running `npm run seed` resets the database to the sample dataset.
```
