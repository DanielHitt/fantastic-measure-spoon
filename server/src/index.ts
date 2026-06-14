import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { dialect } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = createApp();

// Serve the built client if present (single-host local/production deploy)
const clientDist = resolve(__dirname, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(resolve(clientDist, 'index.html')));
}

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Dee Field Scheduler API on http://localhost:${port}`);
  console.log(`Database: ${dialect === 'pg' ? 'PostgreSQL (DATABASE_URL)' : 'SQLite (local file)'}`);
  console.log(
    `Travel-time provider: ${process.env.GOOGLE_MAPS_API_KEY ? 'Google Maps (traffic-aware)' : 'built-in heuristic'}`,
  );
});
