import 'express-async-errors';
import express, { type Express } from 'express';
import cors from 'cors';
import { initSchema } from './db.js';
import { dataRouter } from './routes/data.js';
import { jobsRouter } from './routes/jobs.js';
import { routeRouter } from './routes/route.js';

/** Build the API app. Schema is initialised once, lazily, before the first
 *  request is handled — works for both a long-running server and serverless. */
export function createApp(): Express {
  const ready = initSchema().catch((e) => {
    console.error('Schema init failed:', e);
    throw e;
  });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // ensure the database schema exists before handling any API request
  app.use(async (_req, _res, next) => {
    try {
      await ready;
      next();
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      googleMaps: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      travelTimeProvider: process.env.GOOGLE_MAPS_API_KEY ? 'google' : 'heuristic',
      database: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
    }),
  );

  app.use('/api', dataRouter);
  app.use('/api', jobsRouter);
  app.use('/api', routeRouter);

  // surface async handler errors as JSON
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: String(err?.message ?? err) });
  });

  return app;
}
