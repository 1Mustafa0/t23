/**
 * Production server: serves the built Vite bundle (dist/) and mounts the
 * Gemini-backed API under /api (see server/api.ts). Run after `npm run build`.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './server/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use('/api', createApiRouter());

// Production build output from Vite.
const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`AgentVille server running at http://localhost:${port}`);
  console.log(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      ? 'Gemini API key detected — live dialogue and gazette enabled.'
      : 'No Gemini API key found — local templates remain active.'
  );
});
