// Vercel serverless entry point: wraps the Express API as a single function.
// `vercel-build` compiles the server to server/dist first, so this imports
// the built app. All /api/* requests are routed here via vercel.json rewrites.
import { createApp } from '../server/dist/app.js';

export default createApp();
