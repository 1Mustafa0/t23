import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import type { Connect, Plugin } from 'vite';
import { createApiApp } from './server/api';

/**
 * Mount the same Express API used by `server.ts` inside the Vite dev server,
 * so `npm run dev` gives the app working /api routes without a second process.
 */
function agentvilleApiPlugin(): Plugin {
  return {
    name: 'agentville-api',
    configureServer(server) {
      const apiApp = createApiApp();
      server.middlewares.use('/api', apiApp as unknown as Connect.NextHandleFunction);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), agentvilleApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
