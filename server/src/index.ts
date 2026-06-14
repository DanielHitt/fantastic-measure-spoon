import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initSchema } from './db.js';
import { dataRouter } from './routes/data.js';
import { jobsRouter } from './routes/jobs.js';
import { routeRouter } from './routes/route.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

initSchema();

// Auto-seed on first run so the app is never empty
const empCount = (db.prepare('SELECT COUNT(*) c FROM employees').get() as any).c;
if (empCount === 0) {
  console.log('Empty database — run `npm run seed` to load the sample dataset.');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    googleMaps: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    travelTimeProvider: process.env.GOOGLE_MAPS_API_KEY ? 'google' : 'heuristic',
  }),
);

app.use('/api', dataRouter);
app.use('/api', jobsRouter);
app.use('/api', routeRouter);

// Serve built client if present (production)
const clientDist = resolve(__dirname, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(resolve(clientDist, 'index.html')));
}

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Dee Field Scheduler API on http://localhost:${port}`);
  console.log(
    `Travel-time provider: ${process.env.GOOGLE_MAPS_API_KEY ? 'Google Maps (traffic-aware)' : 'built-in heuristic'}`,
  );
});
