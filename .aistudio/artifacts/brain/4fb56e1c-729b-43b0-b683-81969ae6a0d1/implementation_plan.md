# Dynamic Weather Particle Engine & 5-Sector Cartoon City Expansion

Expand the interactive 2D AI Autonomous Agent City Simulator with a high-performance dynamic weather particle engine (rain streaks, ground ripples, fluttering snow particles, blizzards, lightning flashes) and integrate the comprehensive 5-sector municipal framework (Residential, Economic & Banking, Social & Leisure, Healthcare & Public Safety, Civic Administration & City Hall).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The simulation will support both the newly requested dynamic weather system (rain, snow, blizzard, storm, sunny) and the user's detailed 5-sector city expansion. All existing features (60 FPS canvas loop, cognitive tick decoupled state machine, episodic memories, citizen density heatmap, agent inspector, agent creator) will be preserved.

- **Weather Effects**: Multi-mode particle system with physics (wind velocity, terminal velocity, sine-wave snow flutter, splash rings, and rooftop snow dusting).
- **City Layout**: Seamlessly integrate the new Civic & Financial hubs (City Hall, Bank, Emergency/Police Station) into the road and waypoint navigation graph alongside the existing 6 landmarks.
- **God Mode Expansion**: Direct weather trigger buttons (`🌧️ Rainstorm`, `❄️ Snowstorm`, `☀️ Clear Sunshine`, `🏛️ City Hall Decree`) in the God Mode Bar.

---

## 1. Overview & Core Concept

- **Dynamic Weather System**: `CityCanvas` runs a 60 FPS particle simulator that smoothly switches between sunny, overcast, rainstorm, gentle snowfall, and blizzard based on `globalSimulation.weather`.
- **5-Sector Urban Ecosystem**:
  1. **Residential Sector**: Sweet Home Apartments (Rest when Energy < 20, bad weather shelter).
  2. **Economic & Work Sector**: Tech Hub / Office (work schedules, earning money), Local Market (food/grocery trade), and Municipal Bank (savings deposits, loans).
  3. **Social & Leisure Sector**: Cozy Cafe (hot beverages, high social density), Central Park & Pond (relaxing mood boost, swimming ducks, fountain).
  4. **Healthcare & Public Safety**: City Hospital (medical healing, trauma recovery), Emergency / Police Station (city safety, crisis management).
  5. **Civic & Administration Sector**: City Hall (mayoral announcements, city festivals, official decrees).

---

## 2. User Experience & Visual Design

### Dynamic Weather Visuals
- **Rain & Thunderstorm**:
  - Angled translucent rain streaks (`#BAE6FD`) with wind acceleration.
  - Circular water impact ripples on roads, pond, and sidewalks.
  - Ambient sky darkening with occasional rapid lightning flashes (`rgba(255, 255, 255, 0.25)`).
- **Snow & Winter Blizzard**:
  - Multi-layered snow particles with variable sizes (2px to 5px), varying fall speeds, and organic horizontal sine-wave flutter (`Math.sin(flake.phase) * 1.5`).
  - Subtle frosted blue-white atmospheric haze overlay.
  - Rooftops and grass borders receive soft white snow caps during snow weather.
- **Citizen Winter & Rain Reactions**:
  - In rain: Citizens deploy colorful umbrellas.
  - In snow: Citizens bundle up with cozy scarves/beanies, and speed slows slightly (winter friction).
  - High priority for warm indoor destinations (Cozy Cafe for hot cocoa, Sweet Home for warm fire).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             TOP NAVIGATION BAR                              │
│ [Brand Wordmark] ─ [Day 1 · 10:45 AM · ❄️ Snowstorm · Speed 2x · 🔊] ─ [+ New Citizen] │
├─────────────────────────────────────────────────────────────────────────────┤
│                           GOD MODE ACTION BAR                               │
│ [Events & Heatmap: 🌧️ Rain | ❄️ Snowstorm | ☕ Coffee | 🏛️ City Hall | 🔥 Heatmap]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                          60 FPS CITY CANVAS                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐               │
│  │  Cozy Cafe   │      │ Local Market │      │   Tech Hub   │               │
│  └──────────────┘      └──────────────┘      └──────────────┘               │
│         │                     │                     │                       │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐               │
│  │  City Hall   │      │ Central Park │      │  Metro Bank  │   [INSPECTOR  │
│  └──────────────┘      │   & Pond     │      └──────────────┘    DRAWER]    │
│         │              └──────────────┘             │           Vitals,     │
│  ┌──────────────┐             │              ┌──────────────┐   Thoughts,   │
│  │  Sweet Home  │      ┌──────────────┐      │City Hospital │   Memories,   │
│  │ (Apartments) │      │Police/Emerg. │      │ & Clinic     │   Directives  │
│  └──────────────┘      └──────────────┘      └──────────────┘               │
│   * Falling animated snowflakes / rain splash particles across scene *      │
├─────────────────────────────────────────────────────────────────────────────┤
│                 LIVE CITY PULSE FEED & CITIZEN QUICK SELECT                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Particle Pool Architecture vs Dynamic Allocation**:
  - *Chosen Approach*: Pre-allocate an array of 180 particle objects in a React ref (`particlesRef.current.weather`), recycling particles as they exit canvas boundaries.
  - *Why*: Zero garbage collection pauses, guarantees rock-solid 60 FPS even during heavy blizzards on low-end devices.
- **Decision 2: Seamless Sector Integration in Virtual Coordinates**:
  - *Chosen Approach*: Expand the virtual canvas space to $1360 \times 860$ with dedicated plots for City Hall, Metro Bank, and Emergency Station, keeping the camera auto-fit zoom fluid.
  - *Why*: Preserves high visual cartoon detail for every sector without cramping existing paths.
- **Decision 3: Cognitive Weather Sensitivity**:
  - *Chosen Approach*: In snow/storm, agents naturally prioritize warmth (Cafe coffee, Sweet Home hearth) and log episodic memories (e.g., *"Trudged through fresh snow to grab hot cocoa at Cozy Cafe"*).

---

## 4. Technical Architecture & Component Structure

### Key Components to Update
1. `/src/types/simulation.ts`:
   - Extend `WeatherType` to include `'snow'` and `'blizzard'`.
   - Add new sector types to `LocationNode`: `'bank' | 'police' | 'cityhall'`.
2. `/src/simulation/cityMap.ts`:
   - Define architectural blueprints, doors, and patio coordinates for City Hall, Metro Bank, and Police/Emergency Station.
   - Update `NAV_GRAPH` waypoints and crosswalks so pathfinding navigates to all new buildings.
3. `/src/simulation/agentLogic.ts`:
   - Add cognitive triggers for Bank (deposit savings when Money > $200), Police (safety response), and City Hall.
   - Add weather-specific dialogue generation and memories (snow, blizzard, warm drinks).
4. `/src/components/CityCanvas.tsx`:
   - Dual-mode weather particle engine: switches seamlessly between rain splashes and fluttering snowflakes.
   - Render facades for City Hall (classical pillars, civic clock), Bank (vault emblem, gold trim), and Emergency Station (siren lights).
   - Render snow caps on roofs when weather is snow or blizzard.
5. `/src/components/GodModeBar.tsx`:
   - Add `❄️ Snowstorm` and `🏛️ City Hall Decree` event buttons.
