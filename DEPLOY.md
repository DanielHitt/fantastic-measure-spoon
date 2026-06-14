# Deploying for free (hosted, multi-user)

Locally the app uses a zero-config SQLite file. To host it online — reachable
from any office computer and your drivers' phones — you need a **cloud database**,
because free hosts don't keep a permanent file on disk. The app already supports
Postgres: set `DATABASE_URL` (+ `DB_SCHEMA`) and it switches engines automatically.

Total cost: **$0** at your scale.

---

## Step 1 — Database: ALREADY DONE ✅

Your Supabase database is already set up and populated. It lives in an isolated
schema called **`field_scheduler`** inside your Supabase project
(`ltzuxekugvskifnzznei`), kept completely separate from your other apps. It
contains your 7 techs, the 23-product catalog (with real on-site time estimates),
and your 80 job sites. The schedule starts empty so you add real work.

You only need your project's **connection string** for Step 2:

1. Open your project at **https://supabase.com/dashboard** → click **Connect**
   (top bar) → **Connection string** → **URI**.
2. Copy the **"Transaction" / pooler** URI (port `6543`). It looks like:
   ```
   postgresql://postgres.ltzuxekugvskifnzznei:[YOUR-PASSWORD]@aws-0-...pooler.supabase.com:6543/postgres
   ```
   Replace `[YOUR-PASSWORD]` with your Supabase database password.

> Do **not** run `npm run seed` against this database — that command resets data
> to the local demo set. Your production data is already loaded.

---

## Step 2 — Host the app (pick ONE)

### Option A — Render  ·  recommended (simplest, one service)

Render runs the whole app (API + website) as one free service.

1. Push this project to your GitHub (it already is, on the working branch).
2. Go to **https://render.com** → sign up → **New +** → **Blueprint**.
3. Connect your GitHub and pick the `fantastic-measure-spoon` repo. Render reads
   the included `render.yaml` automatically.
4. When prompted for environment variables, set:
   - **DATABASE_URL** → your Supabase URI from Step 1
   - **DB_SCHEMA** → `field_scheduler`
   - **GOOGLE_MAPS_API_KEY** → leave blank (optional; add later for live traffic)
5. Click **Apply / Create**. First build takes a few minutes. When it's done you
   get a URL like `https://dee-field-scheduler.onrender.com` — that's your live app.

> Render's free tier sleeps after ~15 minutes of no use; the next visit takes
> ~30–60 seconds to wake up, then it's fast. Fine for a small team; upgrade later
> if you want it always-on.

### Option B — Vercel

Vercel is built for sites without an always-on server, so the app is split into a
static front end + a serverless API (config is included: `vercel.json` + `api/`).

1. Go to **https://vercel.com** → sign up → **Add New… → Project** → import the
   `fantastic-measure-spoon` repo.
2. Under **Settings → Environment Variables**, add:
   - **DATABASE_URL** → your Supabase URI
   - **DB_SCHEMA** → `field_scheduler`
   - **GOOGLE_MAPS_API_KEY** → optional
3. Deploy. Vercel uses the included `vercel.json` (build command, static output,
   and `/api` function) automatically.

---

## Step 3 — (optional) Live traffic-aware drive times

Add a Google Maps Platform key to either host as `GOOGLE_MAPS_API_KEY`
(enable Routes/Distance Matrix + Geocoding APIs). The app auto-detects it and the
top-bar badge flips to "🟢 Google traffic". Without it, the built-in estimator is
used — everything still works.

---

## Updating later

Push changes to GitHub (or `git pull` then push). Render and Vercel both
**auto-redeploy** on every push — no extra steps. Your data stays safe in Supabase
across deploys. Don't re-run `npm run seed` against production unless you want to
reset it to the sample data.

## Notes
- **Backups:** Supabase keeps your data; you can also export it any time from the
  Supabase dashboard.
- **Security:** v1 uses a simple role/tech switcher rather than per-user logins.
  Before opening it to the public internet long-term, add real authentication so
  only your team can edit. Ask and I can wire this up (Supabase Auth fits well).
