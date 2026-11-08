# AgentVille 2D — Autonomous AI City Simulation

A cozy 2D autonomous-agent city simulator. Dozens of citizens commute, work,
socialize, shop, heal and build across six districts, driven by a deterministic
simulation engine with optional **Gemini**-generated dialogue and city gazette.

## Features

- **Autonomous citizens** with needs, moods, money, personalities and morals.
- **One source of truth**: `SimulationEngine` owns time, economy and movement;
  the canvas renderer is strictly read-only.
- **Movement system** (`src/simulation/movementSystem.ts`) runs on a 60 fps loop,
  so pausing and speed multipliers affect citizens consistently.
- **Live economy**: income/sales tax sliders, treasury, public vs. private
  sector, wages pro-rated across an 8-hour shift, construction contracts.
- **City Gazette**: 24-hour retrospective generated locally, upgraded by Gemini
  when a key is configured.
- **Gemini dialogue**: citizen conversations are authored locally as a fallback
  and replaced by real Gemini lines when the API is available.
- **God mode**: events, crises, stimulus, heatmap, agent creator.

## Requirements

- Node.js 20+ (tested on Node 24)
- npm 10+

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: add GEMINI_API_KEY
npm run dev
```

Open **http://localhost:3000**.

`npm run dev` starts Vite, which also mounts the Express API at `/api` through a
plugin — no second process is needed.

### Enabling Gemini

Create `.env.local`:

```env
GEMINI_API_KEY="your-key-here"
# GEMINI_MODEL="gemini-2.5-flash"   # optional
```

Restart the dev server. The top bar shows a **Gemini** badge when the key is
detected, or **Local** when the app is running on built-in templates.

The key stays on the server: the client only calls `/api/*`, and no key is ever
included in the browser bundle.

## Production

```bash
npm run build   # builds dist/ and bundles server.js
npm start       # serves the SPA + API on PORT (default 3000)
```

## API

| Method | Route            | Purpose                                  |
| ------ | ---------------- | ---------------------------------------- |
| GET    | `/api/health`    | Liveness probe                           |
| GET    | `/api/ai/status` | `{ configured, provider, model }`        |
| POST   | `/api/dialogue`  | Gemini two-line citizen exchange         |
| POST   | `/api/gazette`   | Gemini 3-story city gazette edition      |

Without `GEMINI_API_KEY` the POST routes return `503 { error: "not_configured" }`
and the client silently keeps the local templates. Requests are rate-limited per
IP.

## Project layout

```
src/
  render/
    architecture.ts       # parametric building grammar (one design system)
  simulation/
    simulationEngine.ts   # canonical state, clock, economy, AI enhancement
    movementSystem.ts     # single source of movement (60 fps)
    agentLogic.ts         # per-tick citizen cognition + interactions
    schedule.ts           # shared working-hours policy
    cityMap.ts            # districts, locations, navigation graph
    gazetteAnalyzer.ts    # local Arabic/English gazette generator
  components/             # canvas renderer, HUD, inspector, modals
  services/aiService.ts   # client API wrapper + fallback
server/
  api.ts                  # Express + Gemini endpoints (server-side key)
server.ts                 # production SPA + API server
```

## Building design system

`src/render/architecture.ts` draws every venue from one architectural order:
**lot → plinth → facade → openings → roof → entrance → signage → need plaque →
status**. Nothing is pasted art: typologies (wall/roof/glass palette, roof kind,
storey count, siding/brick/stone texture) live in a single `TYPOLOGIES` table, and
geometry follows one module — ~84 px bays, ~82 px floors, a 16 px stone plinth,
one ink outline weight and one type scale — so the skyline stays consistent.

The entrance is projected from the REAL `location.door` used by pathfinding, and
each building keeps a clear door bay (no window overlaps the canopy).

**Buildings are tied to citizen needs.** Every venue declares `needImpact`
(addresses, capacity, preferred sector). The plaque under each building shows the
need icon plus a segmented `served / capacity` meter computed live from the
simulation: residents for homes (`homeNodeId`), visitors for services
(`currentLocationId`), progress for construction sites. Green = comfortable,
amber = getting busy, red + beacon = at capacity. Hovering a building expands the
plaque with the load percentage and today's traffic; the plate's left strip is
indigo for municipal venues and amber for private ones.

## Roads, traffic & public transport

`src/simulation/roadNetwork.ts` is the single source of truth for circulation:
arterial nodes/junctions (x=1024/2176, y=448/1856), lane geometry, the L1 bus
loop and its four shelters. `src/render/roadRenderer.ts` paints that data in
strict layers — footways, carriageways, lane discipline (double-yellow centre,
dashed lanes), junction boxes with stop lines and zebra crossings, signal heads
showing the live phase, lamps, gullies and bus shelters.

`src/simulation/vehicleSystem.ts` gives every vehicle a job:

| Vehicle | Behaviour |
| ------- | --------- |
| Bus (×2) | Runs the L1 loop, dwells ~2.6 s at each shelter; nearby citizens board (small comfort/energy gain, `ridersServed` counter) |
| Taxi | Cruises the boulevards |
| Van / truck | Delivery runs between the market quarter and the works |
| Police / ambulance / fire | Patrol; dispatched with flashing light bars while a city event or crisis is active |

Vehicles keep right (lane offset), obey the signals at the four junctions, and
are stepped from the engine's movement loop — so pausing the city freezes the
traffic and the 1x/2x/5x/10x multiplier scales it. `src/render/vehicleRenderer.ts`
draws each type from its function (bus with side windows and destination board,
ambulance cross, fire ladder, taxi roof sign) with headlights and tail-lights
at night.

## Citizen psychology, crime & justice

Every citizen carries an independent mental state (`src/simulation/psychology.ts`):
**stress, impulse, resentment, hope, suspicion**, all recomputed each cognitive
tick from real conditions — money, hunger, energy, mood, housing and recent harm.
Personality and moral alignment (plus age) shape how easily that state turns into
an intention.

`src/simulation/justice.ts` turns intentions into cases. When temptation, low
hope, weak morals and an opportunity align, a citizen may shoplift, mug,
vandalise or lash out (workplace accidents are modelled too). The case then runs
as a real process:

1. **Report** — witnesses within 150 px are recorded; evidence grows with them.
2. **Dispatch** — the nearest free officer *physically travels* from the police
   station to the scene (same pathfinding as any citizen).
3. **Resolution** — on arrival, arrest chance = evidence × officer presence −
   the suspect's nerve. Arrest → fine into the treasury, restitution to the
   victim, detention for 1–4 days and a criminal record. Escape → suspicion and
   city fear rise.
4. **Aftermath** — victims lose money/mood/trust, offenders carry shame and
   resentment, and the city safety index moves with every outcome.

The HUD shows a safety chip (🚨 when incidents are active), and the citizen
inspector has a **Mind & Record** panel with live psyche bars, detention status
and priors.

## Scripts

| Script          | Description                                      |
| --------------- | ------------------------------------------------ |
| `npm run dev`   | Vite dev server + mounted API on port 3000       |
| `npm run lint`  | TypeScript type-check (`tsc --noEmit`)           |
| `npm run build` | Production client build + server bundle          |
| `npm start`     | Run the production server                        |
| `npm run clean` | Remove `dist/` and `server.js`                   |
