/**
 * Entry point: mounts <App /> and (dev only) exposes globalSimulation as
 * window.__agentville for console-driven verification (advanceDays, …).
 */
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { globalSimulation } from './simulation/simulationEngine';

createRoot(document.getElementById('root')!).render(<App />);

// Dev convenience: control the simulation from the browser console, e.g.
// `window.__agentville.advanceDays(320)` to fast-forward romance, pregnancy
// and birth cycles, or `window.__agentville.togglePlayPause()`.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__agentville = globalSimulation;
}
