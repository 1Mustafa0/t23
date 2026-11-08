/**
 * ============================================================================
 *  AI CITY — 2D Interactive Autonomous Agent Simulator
 *  Single-file React component (App.jsx)
 *
 *  Stack : React (hooks) · Tailwind CSS · lucide-react · HTML5 Canvas
 *
 *  ARCHITECTURE (three decoupled loops)
 *  ---------------------------------------------------------------------------
 *  1. RENDER LOOP  (requestAnimationFrame, ~60fps)
 *       - integrates smooth movement/animation (Simulation.step)
 *       - draws a pre-rendered static city layer + lightweight dynamic shapes
 *       - never touches React state
 *  2. LOGIC TICK   (setInterval 100ms)
 *       - needs, stats, goal selection, social interactions, conversations
 *       - lives in a plain JS `Simulation` class held in a useRef
 *  3. UI SNAPSHOT  (setInterval 200ms)
 *       - copies a small, serialisable snapshot into React state for panels
 *
 *  Performance notes: static art is cached on an offscreen canvas, no
 *  shadowBlur anywhere, glow = pre-rendered sprite, rain = one batched path.
 * ============================================================================
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, CloudRain, Sun, Moon, Coffee, Zap, Users, UserPlus, X, Brain,
  Clock, MapPin, Target, Smile, MessageCircle, Wallet, Heart, Utensils,
  Sparkles, Briefcase, Activity, Gauge, Battery, Plus, Radio,
} from 'lucide-react';

/* ============================================================================
 *  CONSTANTS & HELPERS
 * ========================================================================== */
const W = 1000;               // logical world width
const H = 640;                // logical world height
const LANE_TOP = 296;         // pedestrian lane along the top of the main road
const LANE_BOT = 334;         // pedestrian lane along the bottom of the main road
const TIME_SCALE = 1;         // simulated minutes per real second at 1x
const WALK_SPEED = 52;        // px / real second at 1x
const SPEEDS = [1, 2, 5, 10];
const FONT = '"Trebuchet MS","Comic Sans MS",system-ui,sans-serif';
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const OUT = '#2f2a3d';        // cartoon outline colour
const MAX_AGENTS = 12;

const clamp = (v, a = 0, b = 100) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounded-rect path helper (works in every browser). */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fmtClock(t) {
  const m = Math.floor(t) % 1440;
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, '0')} ${ap}`;
}
const dayOf = (t) => Math.floor(t / 1440) + 1;
const hourOf = (t) => (t % 1440) / 60;
const fmtStamp = (t) => `${dayOf(t) > 1 ? `D${dayOf(t)} · ` : ''}${fmtClock(t)}`;

/** 0 = full daylight, 1 = full night, smooth dusk/dawn ramps. */
function darkness(h) {
  if (h >= 20 || h < 5) return 1;
  if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
  if (h >= 18 && h < 20) return (h - 18) / 2;
  return 0;
}

/* ============================================================================
 *  WORLD DEFINITION
 * ========================================================================== */
const LOCS = {
  home:     { id: 'home',     name: 'Sweet Home',    emoji: '🏠', x: 30,  y: 50,  w: 200, h: 200, doorX: 130, curbY: LANE_TOP, sideY: 268 },
  office:   { id: 'office',   name: 'Tech Hub',      emoji: '💻', x: 310, y: 40,  w: 160, h: 210, doorX: 390, curbY: LANE_TOP, sideY: 268 },
  cafe:     { id: 'cafe',     name: 'Cozy Cafe',     emoji: '☕', x: 540, y: 110, w: 190, h: 140, doorX: 635, curbY: LANE_TOP, sideY: 268 },
  hospital: { id: 'hospital', name: 'City Hospital', emoji: '🏥', x: 810, y: 60,  w: 160, h: 190, doorX: 890, curbY: LANE_TOP, sideY: 268 },
  market:   { id: 'market',   name: 'Local Market',  emoji: '🛒', x: 30,  y: 380, w: 200, h: 180, doorX: 130, curbY: LANE_BOT, sideY: 360 },
  park:     { id: 'park',     name: 'Central Park',  emoji: '🌳', x: 310, y: 375, w: 420, h: 235, doorX: 520, curbY: LANE_BOT, sideY: 360, outdoor: true },
};

/** Standing points inside the park (kept clear of the pond). */
const PARK_POINTS = [
  { x: 350, y: 430 }, { x: 420, y: 460 }, { x: 480, y: 415 }, { x: 560, y: 420 },
  { x: 650, y: 425 }, { x: 695, y: 480 }, { x: 690, y: 565 }, { x: 600, y: 575 },
  { x: 500, y: 580 }, { x: 400, y: 570 }, { x: 345, y: 500 }, { x: 440, y: 515 },
];

/** Building windows (shared by the static layer and the night-light pass). */
const WINDOWS = { home: [], office: [], cafe: [], hospital: [], market: [] };
(function buildWindows() {
  const grid = (list, x, y, cols, rows, dx, dy, w, h) => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) list.push({ x: x + c * dx, y: y + r * dy, w, h });
  };
  grid(WINDOWS.home, 52, 112, 4, 2, 44, 34, 26, 24);
  grid(WINDOWS.office, 324, 80, 4, 4, 36, 30, 24, 18);
  grid(WINDOWS.cafe, 560, 172, 2, 1, 98, 0, 52, 38);
  grid(WINDOWS.hospital, 828, 140, 3, 2, 46, 32, 26, 20);
  grid(WINDOWS.market, 50, 470, 2, 1, 100, 0, 50, 40);
})();

const LAMPS = [
  { x: 215, y: 282 }, { x: 420, y: 282 }, { x: 610, y: 282 }, { x: 880, y: 282 },
  { x: 215, y: 350 }, { x: 420, y: 350 }, { x: 610, y: 350 }, { x: 880, y: 350 },
];

const STREET_TREES = [
  [15, 120, 1], [15, 205, 1], [60, 28, 1], [150, 28, 1], [345, 22, 0.9], [440, 22, 0.9],
  [505, 112, 1], [505, 172, 1], [505, 232, 1], [585, 60, 1], [680, 60, 1], [770, 40, 1],
  [850, 28, 1], [930, 28, 1], [985, 150, 1], [985, 230, 0.9], [20, 600, 1], [120, 612, 1],
  [205, 606, 1], [300, 628, 0.9], [520, 630, 0.9], [735, 630, 0.9], [830, 420, 1],
  [905, 470, 1.1], [955, 415, 0.9], [850, 545, 1], [935, 585, 1], [870, 615, 0.9],
];
const PARK_TREES = [
  [332, 402, 1.1], [352, 590, 1], [702, 592, 1.1], [712, 402, 1], [470, 604, 0.9],
  [420, 408, 0.8], [682, 432, 0.9], [330, 470, 0.8],
];

/* ============================================================================
 *  PERSONALITIES, JOBS, GOALS
 * ========================================================================== */
const TRAITS = ['Introvert', 'Extrovert', 'Creative', 'Ambitious', 'Lazy', 'Foodie', 'Anxious', 'Chill'];

/** profession -> workplace location id */
const JOBS = {
  'Software Engineer': 'office', 'AI Researcher': 'office', 'Product Designer': 'office',
  'Barista': 'cafe', 'Chef': 'cafe',
  'Doctor': 'hospital', 'Nurse': 'hospital',
  'Market Vendor': 'market', 'Delivery Courier': 'market',
  'Street Artist': 'park', 'Park Ranger': 'park',
};

const GOALS = {
  sleep:   { label: 'Sleep',            emoji: '💤' },
  work:    { label: 'Work',             emoji: '💼' },
  eat:     { label: 'Get food',         emoji: '🍎' },
  social:  { label: 'Socialize',        emoji: '💬' },
  relax:   { label: 'Relax',            emoji: '🌳' },
  heal:    { label: 'Get healed',       emoji: '🏥' },
  shelter: { label: 'Take shelter',     emoji: '☔' },
  outage:  { label: 'Wait out outage',  emoji: '⚡' },
  promo:   { label: 'Free coffee',      emoji: '☕' },
};

const DEFAULT_AGENTS = [
  { name: 'Alex',   profession: 'Software Engineer', color: '#4f8cff', traits: ['Introvert', 'Ambitious'] },
  { name: 'Sofia',  profession: 'AI Researcher',     color: '#ff6fa5', traits: ['Creative', 'Extrovert'] },
  { name: 'Marcus', profession: 'Barista',           color: '#ff9f43', traits: ['Extrovert', 'Foodie'] },
  { name: 'Elena',  profession: 'Doctor',            color: '#2ec4a6', traits: ['Ambitious', 'Anxious'] },
  { name: 'Jin',    profession: 'Market Vendor',     color: '#9b6bff', traits: ['Chill', 'Lazy'] },
  { name: 'Maya',   profession: 'Street Artist',     color: '#f4c430', traits: ['Creative', 'Introvert'] },
];

const HAIR = ['#2b1b17', '#5a3a22', '#d9a441', '#b5382c', '#3a3a6a', '#161616'];

function computeMods(traits) {
  const m = { socialDecay: 1, energyDecay: 1, foodDecay: 1, wage: 1, chat: 0.6, parkAff: 0, cafeAff: 0, workDrive: 0, moodPark: 0 };
  traits.forEach((t) => {
    switch (t) {
      case 'Introvert': m.socialDecay *= 0.6; m.chat -= 0.25; m.parkAff += 1; break;
      case 'Extrovert': m.socialDecay *= 1.4; m.chat += 0.3; m.cafeAff += 1; break;
      case 'Creative':  m.parkAff += 1; m.moodPark += 6; break;
      case 'Ambitious': m.wage *= 1.2; m.energyDecay *= 1.15; m.workDrive += 1; break;
      case 'Lazy':      m.energyDecay *= 1.25; m.wage *= 0.85; break;
      case 'Foodie':    m.foodDecay *= 1.3; m.cafeAff += 1; break;
      case 'Anxious':   m.socialDecay *= 1.1; m.chat -= 0.1; break;
      case 'Chill':     m.energyDecay *= 0.9; break;
      default: break;
    }
  });
  m.chat = clamp(m.chat, 0.2, 1.2);
  return m;
}

/* ============================================================================
 *  DIALOG SYNTHESIS (template-driven "LLM-lite" conversation generator)
 * ========================================================================== */
const TOPIC_BY_JOB = {
  'Software Engineer': ['AI projects', 'a nasty production bug', 'open-source side projects', 'the new compiler release'],
  'AI Researcher': ['AI projects', 'a new language-model paper', 'training data quality', 'agent simulations'],
  'Product Designer': ['a new app redesign', 'color palettes', 'user feedback'],
  'Barista': ['a new coffee blend', 'latte art', 'the morning rush', 'roast levels'],
  'Chef': ['a secret sauce recipe', 'seasonal menus', 'sharpening knives'],
  'Doctor': ['staying healthy', 'sleep habits', 'flu season', 'a hospital volunteer drive'],
  'Nurse': ['staying healthy', 'long night shifts', 'a hospital volunteer drive'],
  'Market Vendor': ['fresh produce prices', 'the best mangoes in town', 'a new supply route', 'weekend discounts'],
  'Delivery Courier': ['shortcuts across town', 'bike repairs', 'rush hour traffic'],
  'Street Artist': ['a new mural idea', 'color theory', 'the art fair', 'sketching the pond'],
  'Park Ranger': ['the ducks in the pond', 'planting new trees', 'trail maintenance'],
};
const GENERIC_TOPICS = ['weekend plans', 'a good book', 'the city festival', 'a new podcast', 'local gossip', 'a funny dream', 'the best lunch spot', 'learning guitar'];

const OPEN = {
  Introvert: ['Oh… hi {b}. Do you have a minute to talk about {t}?', 'Hey {b}. Sorry to bother you — I was just thinking about {t}.', 'Hi {b}… quiet moment, so… {t}?'],
  Extrovert: ['{b}! Perfect timing — have you heard about {t}?', 'Hey {b}!! We NEED to talk about {t}!', 'Look who it is! {b}, what is your take on {t}?'],
  Creative:  ['{b}, I had the wildest idea about {t}!', 'Hey {b}, picture this: {t}, but reimagined.', '{b}! {t} keeps inspiring me lately.'],
  Ambitious: ['{b}, quick sync on {t}?', 'Hi {b}. Thoughts on {t}? I am planning ahead.', '{b}, let us talk {t}. Big opportunity there.'],
  Chill:     ['Hey {b}, what is up? Been thinking about {t}.', 'Oh hey {b}. So… {t}, huh?'],
  Foodie:    ['{b}! Random, but {t} — and what is for lunch?', 'Hey {b}, {t} sounds like a snack-worthy topic.'],
  Lazy:      ['Hey {b}… {t}? Or should we just nap?', 'Oh, {b}. Got energy to chat about {t}?'],
  Anxious:   ['Hi {b}, do you think {t} will turn out okay? I am a little worried.', '{b}, can I ask you something about {t}?'],
  default:   ['Hi {b}! Got a moment to chat about {t}?'],
};
const REPLY = {
  Introvert: ['Mm, yes. I have actually read a lot about {t}.', 'Honestly? I prefer thinking about {t} quietly, but you are good company.'],
  Extrovert: ['Yes!! I could talk about {t} all day!', 'Oh I love this! Tell me everything about {t}.'],
  Creative:  ['That sparks something — {t} could be so much more colorful!', 'Ooh, {t}… I am sketching ideas already.'],
  Ambitious: ['Good point. {t} could really move the needle.', 'Let us make {t} happen — I will draft a plan tonight.'],
  Chill:     ['Ha, yeah. {t} is pretty interesting. No rush though.', 'Fair enough. {t} will work itself out.'],
  Foodie:    ['{t}? Only if there are snacks involved!', 'Sure! Over a snack, {t} sounds perfect.'],
  Lazy:      ['Sounds like effort… but {t} is kind of fun.', 'Mhm, {t}. Wake me when it is decided.'],
  Anxious:   ['Oh no, now I am worried about {t} too… but it helps to talk.', 'I have been stressing over {t} as well!'],
  default:   ['Sure, {t} is interesting!'],
};
const FOLLOW = ['Exactly! We should explore {t} more.', 'Ha, I never thought of it that way.', 'Right?! Good point about {t}.', 'That is a fresh perspective on {t}.'];
const CLOSE = ['Let us catch up again soon!', 'This was nice — see you around!', 'Anyway, I should get going. Take care!', 'Great chat. Same time tomorrow?'];

function traitKey(a, dict) {
  const opts = a.traits.filter((t) => dict[t]);
  return opts.length ? pick(opts) : 'default';
}
function fill(tpl, b, t) { return tpl.replace('{b}', b).replace('{t}', t); }

function chooseTopic(a, b, env) {
  const pool = [...(TOPIC_BY_JOB[a.profession] || []), ...(TOPIC_BY_JOB[b.profession] || []), ...GENERIC_TOPICS];
  if (env.rain) pool.push('this crazy rain', 'this crazy rain', 'whether to bring an umbrella');
  if (env.promo) pool.push('the free coffee promo', 'the free coffee promo');
  if (env.outage) pool.push('the power outage at the Tech Hub', 'the power outage at the Tech Hub');
  if (env.locId === 'cafe') pool.push('the cafe playlist', 'the new coffee blend');
  if (env.locId === 'park') pool.push('the ducks in the pond', 'a picnic by the pond');
  if (env.locId === 'market') pool.push('fresh produce prices');
  if (env.locId === 'hospital') pool.push('staying healthy');
  if (env.night) pool.push('how late it is', 'the stars tonight');
  return pick(pool);
}

function generateConversation(a, b, env) {
  const topic = chooseTopic(a, b, env);
  const lines = [
    { who: a, text: fill(pick(OPEN[traitKey(a, OPEN)]), b.name, topic) },
    { who: b, text: fill(pick(REPLY[traitKey(b, REPLY)]), a.name, topic) },
  ];
  if (Math.random() < 0.55) lines.push({ who: a, text: fill(pick(FOLLOW), b.name, topic) });
  lines.push({ who: Math.random() < 0.5 ? a : b, text: pick(CLOSE) });
  return { topic, lines };
}

/* text wrapping / measuring (offscreen, only called on creation) */
let measureCtx = null;
function getMeasure() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}
function wrapText(text, maxW) {
  const m = getMeasure();
  m.font = `600 11px ${FONT}`;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (m.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 4);
  let width = 20;
  shown.forEach((l) => { width = Math.max(width, m.measureText(l).width); });
  return { lines: shown, w: width };
}
function measureName(name) {
  const m = getMeasure();
  m.font = `700 10px ${FONT}`;
  return m.measureText(name).width;
}

/* ============================================================================
 *  AGENT
 * ========================================================================== */
class Agent {
  constructor(sim, { name, profession, color, traits }) {
    this.id = sim.nextId++;
    this.name = name;
    this.profession = profession;
    this.workplace = JOBS[profession] || 'office';
    this.color = color;
    this.traits = traits;
    this.mods = computeMods(traits);
    this.hair = HAIR[this.id % HAIR.length];
    this.nameW = measureName(name);

    this.stats = {
      energy: rand(70, 95), mood: rand(60, 80), social: rand(45, 80),
      money: rand(30, 70), food: rand(55, 90), health: 100,
    };

    // spawn on the doorstep of home
    const spot = sim.spotFor(this, LOCS.home);
    this.x = spot.x; this.y = spot.y;
    this.loc = 'home';
    this.state = 'acting';        // 'acting' | 'walking' | 'chatting'
    this.prevState = 'acting';
    this.path = [];
    this.goal = null;
    this.arrivedAt = sim.time;
    this.stayFor = 90;
    this.nextWander = sim.time + 40;
    this.wanderOnly = false;
    this.parkIdx = this.id;
    this.facing = 1;
    this.phase = Math.random() * 6;
    this.bubble = null;
    this.chat = null;
    this.memory = [];
    this.moneyAtArrive = this.stats.money;
    this.promoSeen = -1; this.promoGo = false;
    this.rainSeen = -1; this.shelterLoc = 'home';
    this.log(sim, `${name} the ${profession} wakes up and starts the day.`, 'info');
  }

  log(sim, text, kind = 'info') {
    const last = this.memory[this.memory.length - 1];
    if (last && last.text === text && sim.time - last.t < 20) return; // dedupe spam
    this.memory.push({ t: sim.time, text, kind });
    if (this.memory.length > 400) this.memory.shift();
  }
}

const isSleeping = (a) => a.state === 'acting' && a.goal && a.goal.type === 'sleep' && a.loc === 'home';

/* ============================================================================
 *  SIMULATION ENGINE (pure JS — no React in here)
 * ========================================================================== */
class Simulation {
  constructor() {
    this.time = 450;            // minutes since day 1 00:00 → starts at 7:30 AM
    this.speed = 1;
    this.paused = false;

    this.weather = 'sun';
    this.rainUntil = 0; this.rainId = 0; this.rainLevel = 0;
    this.promoUntil = 0; this.promoId = 0;
    this.outageUntil = 0;
    this._wasRain = false; this._wasPromo = false; this._wasOutage = false;

    this.agents = [];
    this.nextId = 0;
    this.convs = [];
    this.pairCool = {};
    this.feed = [];
    this.selectedId = null;

    this.cars = [
      { x: 100, y: 304, dir: -1, color: '#ff6b6b', v: 70 },
      { x: 880, y: 304, dir: -1, color: '#69db7c', v: 62 },
      { x: 700, y: 326, dir: 1, color: '#4dabf7', v: 60 },
      { x: 330, y: 326, dir: 1, color: '#ffd43b', v: 76 },
    ];
    this.clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 230 + rand(0, 80), y: rand(14, 90), s: rand(0.8, 1.5), v: rand(5, 12) }));
    this.drops = Array.from({ length: 150 }, () => ({ x: rand(0, W), y: rand(0, H), v: rand(520, 760), l: rand(8, 14) }));

    DEFAULT_AGENTS.forEach((d) => this.addAgent(d));
    this.pushFeed('🌅 A new day begins in AI City.', '#fde68a');
  }

  get hour() { return hourOf(this.time); }
  isOutage() { return this.outageUntil > this.time; }
  isPromo() { return this.promoUntil > this.time; }

  /* ---------- public controls ---------- */
  addAgent(def) {
    if (this.agents.length >= MAX_AGENTS) return null;
    const a = new Agent(this, def);
    this.agents.push(a);
    return a;
  }
  setWeather(w) {
    this.weather = w;
    if (w === 'rain') { this.rainId++; this.rainUntil = 0; this.pushFeed('🌧️ It starts to rain.', '#93c5fd'); }
    else { this.rainUntil = 0; this.pushFeed('☀️ The sun comes out.', '#fde68a'); }
  }
  triggerRain() {
    this.weather = 'rain'; this.rainId++; this.rainUntil = this.time + 180;
    this.pushFeed('🌧️ RAINSTORM! Citizens look for shelter.', '#93c5fd');
  }
  triggerPromo() {
    this.promoUntil = this.time + 120; this.promoId++;
    this.pushFeed('☕ FREE COFFEE PROMO at Cozy Cafe!', '#fdba74');
  }
  triggerOutage() {
    this.outageUntil = this.time + 120;
    this.pushFeed('⚡ POWER OUTAGE at the Tech Hub — work suspended.', '#fca5a5');
  }
  pushFeed(text, color = '#e2e8f0') {
    this.feed.push({ t: this.time, text, color });
    if (this.feed.length > 40) this.feed.shift();
  }
  pickAgent(lx, ly) {
    let best = null; let bd = 22;
    for (const a of this.agents) {
      const d = Math.hypot(a.x - lx, a.y - 16 - ly);
      if (d < bd) { bd = d; best = a; }
    }
    return best ? best.id : null;
  }

  /* ---------- geometry ---------- */
  spotFor(a, L) {
    if (L.id === 'park') {
      const p = PARK_POINTS[a.parkIdx % PARK_POINTS.length];
      return { x: p.x, y: p.y };
    }
    const i = a.id;
    const ox = (((i * 5) % 9) - 4) * 12;
    const oy = ((i * 3) % 3) * 9;
    return { x: L.doorX + ox, y: L.sideY + (L.curbY === LANE_TOP ? oy : -oy) };
  }

  buildPath(a, targetId) {
    const L = LOCS[targetId];
    const pts = [];
    const cur = a.loc ? LOCS[a.loc] : null;
    let lane;
    if (cur) {
      if (cur.id === 'park') pts.push({ x: 520, y: 384 });
      pts.push({ x: cur.doorX, y: cur.curbY });
      lane = cur.curbY;
    } else {
      lane = Math.abs(a.y - LANE_TOP) < Math.abs(a.y - LANE_BOT) ? LANE_TOP : LANE_BOT;
      pts.push({ x: a.x, y: lane });
    }
    const lastX = pts[pts.length - 1].x;
    if (lastX !== L.doorX) pts.push({ x: L.doorX, y: lane });
    if (lane !== L.curbY) pts.push({ x: L.doorX, y: L.curbY });
    if (L.id === 'park') pts.push({ x: 520, y: 384 });
    pts.push(this.spotFor(a, L));
    return pts;
  }

  /* ---------- LOGIC TICK (called every ~100ms real time) ---------- */
  tick(dtMs) {
    if (this.paused) return;
    const dtMin = (dtMs / 1000) * this.speed * TIME_SCALE;
    this.time += dtMin;

    // weather / event lifecycle
    if (this.weather === 'rain' && this.rainUntil > 0 && this.time >= this.rainUntil) {
      this.weather = 'sun'; this.rainUntil = 0;
      this.pushFeed('☀️ The rainstorm passes.', '#fde68a');
    }
    if (this._wasPromo && !this.isPromo()) this.pushFeed('☕ The free coffee promo has ended.', '#fdba74');
    if (this._wasOutage && !this.isOutage()) this.pushFeed('💡 Power is restored at the Tech Hub.', '#bef264');
    this._wasPromo = this.isPromo(); this._wasOutage = this.isOutage();
    this.rainLevel += ((this.weather === 'rain' ? 1 : 0) - this.rainLevel) * Math.min(1, dtMs / 900);

    for (const a of this.agents) {
      this.updateStats(a, dtMin);
      this.think(a);
      if (a.bubble) { a.bubble.ttl -= dtMs; if (a.bubble.ttl <= 0) a.bubble = null; }
    }
    this.checkInteractions();
    this.processConversations(dtMs);
  }

  /* ---------- needs / stats ---------- */
  updateStats(a, dtMin) {
    const s = a.stats; const m = a.mods;
    const rain = this.weather === 'rain';
    const sleeping = isSleeping(a);
    const walking = a.state === 'walking';
    const working = a.state === 'acting' && a.goal && a.goal.type === 'work' && a.loc === a.workplace;
    const outdoors = a.loc === null || a.loc === 'park';

    // Energy
    let dE = -0.035 * m.energyDecay;
    if (walking) dE = -0.06 * m.energyDecay;
    else if (working) dE = -0.11 * m.energyDecay;
    else if (sleeping) dE = 0.55;
    else if (a.loc === 'home') dE = 0.1;
    s.energy += dE * dtMin;

    // Hunger / Social / Money
    s.food -= 0.07 * m.foodDecay * dtMin;
    s.social -= 0.07 * m.socialDecay * (sleeping ? 0.3 : 1) * dtMin;
    s.money -= 0.02 * dtMin;
    if (working && !(a.workplace === 'office' && this.isOutage())) s.money += 0.28 * m.wage * dtMin;

    // Company at the same place boosts social
    if (a.state === 'acting' && a.loc && !sleeping) {
      let others = 0;
      for (const b of this.agents) if (b !== a && b.loc === a.loc && b.state !== 'walking' && !isSleeping(b)) others++;
      s.social += Math.min(others, 3) * 0.08 * dtMin;
    }

    // Mood drifts toward a situational target
    let target = 72;
    if (s.energy < 30) target -= 18;
    if (s.food < 25) target -= 15;
    if (s.social < 30) target -= 15;
    if (s.money < 20) target -= 10;
    if (rain && outdoors) target -= 14;
    if (a.state === 'acting') {
      if (a.loc === 'park' && !rain) target += 12 + m.moodPark;
      else if (a.loc === 'cafe') target += 6;
    }
    s.mood += (target - s.mood) * Math.min(1, 0.02 * dtMin);

    // Health
    if (s.food < 8 || s.energy < 8) s.health -= 0.2 * dtMin;
    if (rain && outdoors && this.rainLevel > 0.5) s.health -= 0.12 * dtMin;
    else s.health += 0.01 * dtMin;
    if (a.state === 'acting' && a.loc === 'hospital' && a.goal && a.goal.type === 'heal') s.health += 1.2 * dtMin;
    if (Math.random() < 0.0004 * dtMin) {
      s.health -= 35;
      a.log(this, 'Caught a nasty cold 🤧', 'info');
    }

    s.energy = clamp(s.energy); s.food = clamp(s.food); s.social = clamp(s.social);
    s.money = clamp(s.money); s.mood = clamp(s.mood); s.health = clamp(s.health);
  }

  /* ---------- cognitive loop ---------- */
  isDone(a) {
    const g = a.goal; const s = a.stats; const h = this.hour;
    const night = h >= 22 || h < 6;
    const stay = this.time - a.arrivedAt;
    switch (g.type) {
      case 'sleep':   return !night && s.energy >= 85;
      case 'work': {
        const inShift = h >= 9 && h < 17;
        if (a.workplace === 'office' && this.isOutage()) return true;
        return s.energy < 35 || s.money >= 95 || (!inShift && s.money >= 40);
      }
      case 'heal':    return s.health >= 95;
      case 'shelter': return this.weather !== 'rain';
      case 'outage':  return !this.isOutage() || stay >= 90;
      case 'eat':     return stay >= 15;
      case 'social':  return s.social >= 80 || stay >= 90;
      case 'promo':   return stay >= 40;
      case 'relax':   return stay >= a.stayFor;
      default:        return true;
    }
  }

  onDone(a) {
    const g = a.goal; const s = a.stats;
    switch (g.type) {
      case 'sleep': a.log(this, `Woke up feeling rested (energy ${Math.round(s.energy)}%)`, 'info'); break;
      case 'work': {
        const earned = Math.round(s.money - (a.moneyAtArrive || s.money));
        a.log(this, `Finished work shift${earned > 0 ? ` (+$${earned})` : ''}`, 'info');
        break;
      }
      case 'heal': a.log(this, 'Discharged — feeling healthy again', 'info'); break;
      default: break;
    }
  }

  evaluate(a) {
    const s = a.stats; const m = a.mods; const h = this.hour;
    const rain = this.weather === 'rain';
    const night = h >= 22 || h < 6;
    const wp = a.workplace;
    const cands = [];
    const add = (type, loc, prio, reason) => cands.push({ type, loc, prio, reason });

    // 1. Health
    if (s.health < 40) add('heal', 'hospital', 90, 'Not feeling well');
    else if (s.health < 70 && h >= 9 && h < 17 && !rain) add('heal', 'hospital', 32, 'Routine check-up');

    // 2. Exhaustion
    if (s.energy < 20) add('sleep', 'home', 85, 'Exhausted');

    // 3. Rain → move indoors if heading to / standing in the park
    if (rain && this.rainLevel > 0.3) {
      if (a.rainSeen !== this.rainId) {
        a.rainSeen = this.rainId;
        const wCafe = 1 + m.cafeAff * 1.5; const wHome = 1.5; const wMarket = 0.6;
        const r = Math.random() * (wCafe + wHome + wMarket);
        a.shelterLoc = r < wCafe ? 'cafe' : r < wCafe + wHome ? 'home' : 'market';
      }
      const outdoorGoal = a.goal ? a.goal.loc === 'park' : a.loc === 'park';
      if (outdoorGoal) add('shelter', a.shelterLoc, 80, 'Escaping the rain');
    }

    // 4. Power outage → office workers leave
    if (this.isOutage() && wp === 'office' && ((a.goal && a.goal.type === 'work') || a.loc === 'office')) {
      add('outage', s.social < 60 ? 'cafe' : 'home', 70, 'Power outage at the Tech Hub');
    }

    // 5. Free coffee promo (each citizen decides once per promo)
    if (this.isPromo()) {
      if (a.promoSeen !== this.promoId) {
        a.promoSeen = this.promoId;
        a.promoGo = Math.random() < clamp(0.55 + 0.2 * m.cafeAff, 0, 0.95, 0);
      }
      if (a.promoGo) add('promo', 'cafe', 55, 'Free coffee promo!');
    }

    // 6. Hunger
    if (s.food < 25) {
      if (s.money >= 6) add('eat', 'market', 60, 'Hungry');
      else if (s.money >= 3) add('eat', 'cafe', 60, 'Hungry — grabbing a cheap bite');
    }

    const wpBlocked = (wp === 'office' && this.isOutage()) || (wp === 'park' && rain);

    // 7. Money
    if (s.money < 20 && !wpBlocked) add('work', wp, 50, 'Low on cash');

    // 8. Social
    if (s.social < 30) {
      const loc = rain || s.money < 3 ? (rain ? 'cafe' : 'park') : (m.parkAff > m.cafeAff ? 'park' : 'cafe');
      add('social', loc, 45, 'Feeling lonely');
    }

    // 9. Mood
    if (s.mood < 30) add('relax', rain ? 'home' : 'park', 40, 'Needs a mood boost');

    // 10. Bedtime
    if (night) add('sleep', 'home', 52, 'Bedtime');

    // 11. Work shift
    if (!wpBlocked && h >= 9 && h < 17 && s.money < 85 + 5 * m.workDrive) add('work', wp, 30, 'Work shift');

    // 12. Leisure fallback
    const opts = [];
    if (!rain) opts.push(['park', 1 + m.parkAff]);
    if (s.money >= 4) opts.push(['cafe', 1 + m.cafeAff]);
    opts.push(['home', a.traits.includes('Lazy') ? 2 : 0.7]);
    let total = 0; opts.forEach((o) => { total += o[1]; });
    let r = Math.random() * total; let leisure = 'home';
    for (const o of opts) { r -= o[1]; if (r <= 0) { leisure = o[0]; break; } }
    add('relax', leisure, 10, 'Free time');

    let best = cands[0];
    for (const c of cands) if (c.prio > best.prio) best = c;
    return best;
  }

  think(a) {
    if (a.state === 'chatting') return;
    if (a.goal && a.state === 'acting' && this.isDone(a)) {
      this.onDone(a);
      a.goal = null;
    }
    const best = this.evaluate(a);
    if (!a.goal || best.prio > a.goal.prio) this.setGoal(a, best);

    // wander around the park while there
    if (a.state === 'acting' && a.loc === 'park' && this.time >= a.nextWander) {
      a.parkIdx = Math.floor(Math.random() * PARK_POINTS.length);
      const p = PARK_POINTS[a.parkIdx];
      a.path = [{ x: p.x, y: p.y }];
      a.state = 'walking'; a.wanderOnly = true;
      a.nextWander = this.time + rand(25, 60);
    }
  }

  setGoal(a, g) {
    if (a.goal && a.goal.type === g.type && a.goal.loc === g.loc) return;
    a.goal = { ...g, started: this.time };
    a.stayFor = rand(60, 120);
    if (a.loc === g.loc) {                       // already there
      a.state = 'acting'; a.path = []; a.wanderOnly = false;
      a.arrivedAt = this.time; a.moneyAtArrive = a.stats.money;
      return;
    }
    a.path = this.buildPath(a, g.loc);
    a.loc = null; a.state = 'walking'; a.wanderOnly = false;
    a.log(this, `Traveled toward ${LOCS[g.loc].name} — ${g.reason}`, 'move');
  }

  arrive(a) {
    if (a.wanderOnly) { a.wanderOnly = false; a.state = 'acting'; return; }
    if (!a.goal) { a.state = 'acting'; return; }
    a.state = 'acting'; a.loc = a.goal.loc;
    a.arrivedAt = this.time; a.moneyAtArrive = a.stats.money;
    a.nextWander = this.time + rand(25, 60);
    this.onArrive(a);
  }

  onArrive(a) {
    const g = a.goal; const s = a.stats; const L = LOCS[a.loc];
    a.log(this, `Arrived at ${L.name}`, 'move');
    const working = g.type === 'work';
    switch (a.loc) {
      case 'cafe':
        if (working) { a.log(this, 'Started the shift behind the counter', 'info'); break; }
        if (this.isPromo()) {
          s.mood += 10; s.energy += 8; s.food += 8;
          a.log(this, 'Grabbed a FREE coffee from the promo ☕', 'info');
        } else if (s.money >= 3) {
          s.money -= 3; s.mood += 6; s.energy += 8; s.food += 8;
          a.log(this, 'Bought a coffee ($3)', 'info');
        }
        break;
      case 'market': {
        if (working) { a.log(this, 'Opened the market stall', 'info'); break; }
        const spend = Math.min(14, s.money);
        if (spend >= 3) {
          s.money -= spend; s.food += spend * 4.5; s.mood += 2;
          a.log(this, `Bought groceries for $${Math.round(spend)}`, 'info');
        }
        break;
      }
      case 'hospital':
        if (g.type === 'heal') {
          const fee = Math.min(10, s.money); s.money -= fee;
          a.log(this, `Checked in for treatment (paid $${Math.round(fee)})`, 'info');
        } else if (working) a.log(this, 'Started the hospital shift', 'info');
        break;
      case 'home':
        if (g.type === 'sleep') a.log(this, 'Went to bed 💤', 'info');
        break;
      default:
        if (working) a.log(this, 'Started working on tasks', 'info');
        break;
    }
    s.energy = clamp(s.energy); s.food = clamp(s.food); s.mood = clamp(s.mood); s.money = clamp(s.money);
  }

  /* ---------- proximity social interactions ---------- */
  checkInteractions() {
    const A = this.agents;
    const night = this.hour >= 22 || this.hour < 6;
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        const a = A[i]; const b = A[j];
        if (a.state === 'chatting' || b.state === 'chatting') continue;
        if (isSleeping(a) || isSleeping(b)) continue;
        const key = `${a.id}-${b.id}`;
        if (this.time < (this.pairCool[key] || 0)) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        let kind = null;
        if (a.loc && a.loc === b.loc && a.state === 'acting' && b.state === 'acting' && d < 110) {
          if (Math.random() < 0.25 * (a.mods.chat + b.mods.chat)) kind = 'meet';
        } else if (a.state === 'walking' && b.state === 'walking' && d < 26) {
          if (Math.random() < 0.5 * (a.mods.chat + b.mods.chat)) kind = 'cross';
        }
        if (kind) {
          this.pairCool[key] = this.time + (kind === 'cross' ? 120 : 100);
          this.startChat(a, b, kind, night);
        }
      }
    }
  }

  startChat(a, b, kind, night) {
    const locId = a.loc || b.loc;
    const env = { rain: this.weather === 'rain', promo: this.isPromo(), outage: this.isOutage(), locId, night };
    // the more extroverted agent opens the conversation
    const first = a.mods.chat >= b.mods.chat ? a : b;
    const second = first === a ? b : a;
    const convo = generateConversation(first, second, env);
    const where = locId ? LOCS[locId].name : 'the street';
    const conv = {
      a: first, b: second, lines: convo.lines, idx: 0, timer: 250,
      topic: convo.topic, where, kind,
    };
    [first, second].forEach((x) => { x.prevState = x.state; x.state = 'chatting'; x.chat = conv; });
    first.facing = second.x >= first.x ? 1 : -1;
    second.facing = -first.facing;
    this.convs.push(conv);
    this.pushFeed(`💬 ${first.name} & ${second.name} chat about ${convo.topic}.`, '#bae6fd');
  }

  processConversations(dtMs) {
    if (!this.convs.length) return;
    const lineMs = this.speed >= 5 ? 1300 : 2200;
    for (const c of this.convs) {
      c.timer -= dtMs;
      if (c.timer > 0) continue;
      if (c.idx < c.lines.length) {
        const ln = c.lines[c.idx++];
        const wrapped = wrapText(ln.text, 150);
        ln.who.bubble = { lines: wrapped.lines, w: wrapped.w, ttl: lineMs + 600 };
        c.timer = lineMs;
      } else {
        this.endChat(c);
        c.done = true;
      }
    }
    this.convs = this.convs.filter((c) => !c.done);
  }

  endChat(c) {
    [c.a, c.b].forEach((x) => {
      const other = x === c.a ? c.b : c.a;
      x.chat = null;
      x.stats.social = clamp(x.stats.social + 22);
      x.stats.mood = clamp(x.stats.mood + 5);
      const text = c.kind === 'cross'
        ? `Ran into ${other.name} on the street and talked about ${c.topic}`
        : `Talked with ${other.name} about ${c.topic} at ${c.where}`;
      x.log(this, text, 'chat');
      if (x.prevState === 'walking') {
        if (x.path.length) x.state = 'walking'; else this.arrive(x);
      } else x.state = 'acting';
    });
  }

  /* ---------- RENDER-LOOP STEP (smooth movement, 60fps) ---------- */
  step(dt) {
    if (this.paused) return;
    const A = this.agents;
    for (const a of A) {
      if (a.state !== 'walking') continue;
      let rem = WALK_SPEED * dt * this.speed;
      while (rem > 0 && a.path.length) {
        const p = a.path[0];
        const dx = p.x - a.x; const dy = p.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d <= rem) { a.x = p.x; a.y = p.y; a.path.shift(); rem -= d; if (Math.abs(dx) > 0.5) a.facing = dx > 0 ? 1 : -1; }
        else { a.x += (dx / d) * rem; a.y += (dy / d) * rem; a.facing = Math.abs(dx) > 0.01 ? (dx > 0 ? 1 : -1) : a.facing; rem = 0; }
      }
      a.phase += dt * 11;
      if (!a.path.length) this.arrive(a);
    }
    // soft collision avoidance between walkers
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        const a = A[i]; const b = A[j];
        if (a.state !== 'walking' && b.state !== 'walking') continue;
        const dx = a.x - b.x; const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < 14) {
          const push = (14 - d) * 0.25; const nx = dx / d; const ny = dy / d;
          if (a.state === 'walking') { a.x += nx * push; a.y += ny * push; }
          if (b.state === 'walking') { b.x -= nx * push; b.y -= ny * push; }
        }
      }
    }
    // cars, clouds
    const cs = Math.min(this.speed, 3);
    for (const c of this.cars) {
      c.x += c.dir * c.v * dt * cs;
      if (c.dir > 0 && c.x > W + 40) c.x = -40;
      if (c.dir < 0 && c.x < -40) c.x = W + 40;
    }
    for (const c of this.clouds) { c.x += c.v * dt * cs; if (c.x > W + 120) c.x = -120; }
    // rain
    if (this.rainLevel > 0.05) {
      for (const d of this.drops) {
        d.y += d.v * dt; d.x -= d.v * 0.18 * dt;
        if (d.y > H) { d.y = -20; d.x = rand(0, W + 120); }
        if (d.x < -20) d.x = W + 20;
      }
    }
  }

  /* ---------- UI snapshot ---------- */
  statusText(a) {
    if (a.state === 'chatting') return `Chatting with ${a.chat ? (a.chat.a === a ? a.chat.b : a.chat.a).name : '…'}`;
    if (a.state === 'walking' && !a.wanderOnly) return `Walking to ${a.goal ? LOCS[a.goal.loc].name : '…'}`;
    if (isSleeping(a)) return 'Sleeping 💤';
    if (a.goal && a.state === 'acting') {
      const L = LOCS[a.loc];
      switch (a.goal.type) {
        case 'work': return `Working at ${L.name}`;
        case 'eat': return `Eating at ${L.name}`;
        case 'heal': return `Recovering at ${L.name}`;
        case 'shelter': return `Sheltering at ${L.name}`;
        default: return `${GOALS[a.goal.type].label} @ ${L.name}`;
      }
    }
    return 'Thinking…';
  }

  snapshot() {
    const sel = this.agents.find((a) => a.id === this.selectedId) || null;
    const r = (n) => Math.round(n);
    return {
      clock: fmtClock(this.time), day: dayOf(this.time), hour: this.hour,
      speed: this.speed, paused: this.paused, weather: this.weather,
      rainLeft: this.weather === 'rain' && this.rainUntil > 0 ? Math.max(0, this.rainUntil - this.time) : 0,
      rainManual: this.weather === 'rain' && this.rainUntil === 0,
      promoLeft: this.isPromo() ? this.promoUntil - this.time : 0,
      outageLeft: this.isOutage() ? this.outageUntil - this.time : 0,
      selectedId: this.selectedId,
      agentCount: this.agents.length,
      agents: this.agents.map((a) => ({
        id: a.id, name: a.name, job: a.profession, color: a.color, traits: a.traits,
        status: this.statusText(a),
        stats: { energy: r(a.stats.energy), mood: r(a.stats.mood), social: r(a.stats.social), money: r(a.stats.money), food: r(a.stats.food), health: r(a.stats.health) },
      })),
      selected: sel ? {
        id: sel.id, name: sel.name, job: sel.profession, color: sel.color, traits: sel.traits,
        workplace: LOCS[sel.workplace].name,
        status: this.statusText(sel),
        goal: sel.goal ? `${GOALS[sel.goal.type].emoji} ${GOALS[sel.goal.type].label}` : '—',
        reason: sel.goal ? sel.goal.reason : '',
        destination: sel.goal ? `${LOCS[sel.goal.loc].emoji} ${LOCS[sel.goal.loc].name}` : '—',
        location: sel.loc ? LOCS[sel.loc].name : 'On the street',
        stats: { energy: sel.stats.energy, mood: sel.stats.mood, social: sel.stats.social, money: sel.stats.money, food: sel.stats.food, health: sel.stats.health },
        memoryCount: sel.memory.length,
        memory: sel.memory.slice(-150).map((m) => ({ stamp: fmtStamp(m.t), text: m.text, kind: m.kind })),
      } : null,
      feed: this.feed.slice(-14).map((f) => ({ stamp: fmtClock(f.t), text: f.text, color: f.color })),
    };
  }
}

/* ============================================================================
 *  STATIC LAYER (drawn once per resize onto an offscreen canvas)
 * ========================================================================== */
function strokeOut(g, w = 3) { g.lineWidth = w; g.strokeStyle = OUT; g.lineJoin = 'round'; g.stroke(); }

function drawShadow(g, x, y, w, h) { g.fillStyle = 'rgba(0,0,0,0.16)'; rr(g, x + 6, y + 8, w, h, 10); g.fill(); }

function drawWindowRect(g, r, glass) {
  rr(g, r.x, r.y, r.w, r.h, 3); g.fillStyle = glass || '#bfe6ff'; g.fill(); strokeOut(g, 2);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(r.x + 3, r.y + 3, r.w * 0.3, r.h * 0.4);
}

function drawDoor(g, x, y, w, h, color) {
  rr(g, x, y, w, h, 6); g.fillStyle = color; g.fill(); strokeOut(g, 2.5);
  g.fillStyle = '#ffd966'; g.beginPath(); g.arc(x + w - 7, y + h * 0.55, 2.4, 0, 6.283); g.fill();
}

function drawLabel(g, text, cx, cy) {
  g.font = `bold 13px ${FONT}`;
  const tw = g.measureText(text).width + 16;
  rr(g, cx - tw / 2, cy - 10, tw, 20, 10);
  g.fillStyle = 'rgba(255,255,255,0.94)'; g.fill(); strokeOut(g, 2);
  g.fillStyle = OUT; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, cx, cy + 1);
}

function drawAwning(g, x, y, w, h, c1, c2) {
  const n = Math.round(w / 20); const sw = w / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? c2 : c1;
    g.fillRect(x + i * sw, y, sw, h);
    g.beginPath(); g.arc(x + i * sw + sw / 2, y + h, sw / 2, 0, Math.PI); g.fill();
  }
  g.lineWidth = 2.5; g.strokeStyle = OUT;
  g.strokeRect(x, y, w, h);
  for (let i = 0; i < n; i++) { g.beginPath(); g.arc(x + i * sw + sw / 2, y + h, sw / 2, 0, Math.PI); g.stroke(); }
}

function drawTree(g, x, y, s) {
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.ellipse(x, y + 12 * s, 16 * s, 5 * s, 0, 0, 6.283); g.fill();
  rr(g, x - 4 * s, y - 6 * s, 8 * s, 18 * s, 2); g.fillStyle = '#8a5a34'; g.fill(); strokeOut(g, 2);
  const blobs = [[0, -22, 16, '#3fae4a'], [-12, -12, 12, '#37a043'], [12, -12, 12, '#37a043'], [0, -26, 11, '#52c45a']];
  for (const [dx, dy, r, c] of blobs) {
    g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 6.283); g.fillStyle = c; g.fill(); strokeOut(g, 2);
  }
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(x - 4 * s, y - 28 * s, 5 * s, 0, 6.283); g.fill();
}

function drawLampPost(g, x, y) {
  g.strokeStyle = OUT; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 18); g.stroke();
  g.fillStyle = '#ffe28a'; g.beginPath(); g.arc(x, y - 20, 4.5, 0, 6.283); g.fill(); strokeOut(g, 2);
}

function cobble(g, x, y, w, h, rnd) {
  const pal = ['#d8cdb4', '#cfc3a8', '#e0d6bf', '#c7bda6'];
  for (let r = 0; r < Math.floor(h / 8); r++) {
    const yy = y + r * 8; const off = (r % 2) * 7;
    for (let xx = x - off; xx < x + w; xx += 14) {
      g.fillStyle = pal[Math.floor(rnd() * pal.length)];
      rr(g, xx + 1, yy + 1, 12, 6, 2); g.fill();
    }
  }
}

function drawHome(g, L) {
  const { x, y, w, h } = L;
  drawShadow(g, x, y + 40, w, h - 40);
  g.fillStyle = '#9a4a3a'; rr(g, x + w - 50, y + 8, 18, 34, 2); g.fill(); strokeOut(g, 2.5); // chimney
  rr(g, x, y + 55, w, h - 55, 6); g.fillStyle = '#f7d9a8'; g.fill(); strokeOut(g);
  g.beginPath(); g.moveTo(x - 12, y + 60); g.lineTo(x + w / 2, y); g.lineTo(x + w + 12, y + 60); g.closePath();
  g.fillStyle = '#c8553d'; g.fill(); strokeOut(g);
  g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const yy = y + i * 14; const half = ((yy - y) / 60) * (w / 2 + 12);
    g.beginPath(); g.moveTo(x + w / 2 - half + 4, yy); g.lineTo(x + w / 2 + half - 4, yy); g.stroke();
  }
  WINDOWS.home.forEach((r) => drawWindowRect(g, r, '#bfe6ff'));
  drawDoor(g, L.doorX - 16, y + h - 48, 32, 48, '#7a4a2a');
  g.fillStyle = '#e9a0c0'; // flower pots by the door
  [L.doorX - 34, L.doorX + 34].forEach((fx) => { g.beginPath(); g.arc(fx, y + h - 8, 6, 0, 6.283); g.fill(); strokeOut(g, 1.8); });
  drawLabel(g, `${L.emoji} ${L.name}`, L.doorX, y + 188 - 50);
}

function drawOffice(g, L) {
  const { x, y, w, h } = L;
  drawShadow(g, x, y, w, h);
  g.strokeStyle = OUT; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y - 18); g.stroke();
  g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(x + w / 2, y - 20, 4, 0, 6.283); g.fill();
  rr(g, x, y, w, h, 8); g.fillStyle = '#7ea6e0'; g.fill(); strokeOut(g);
  rr(g, x - 4, y, w + 8, 26, 6); g.fillStyle = '#3f5a8a'; g.fill(); strokeOut(g);
  WINDOWS.office.forEach((r) => drawWindowRect(g, r, '#d4ecff'));
  drawDoor(g, L.doorX - 18, y + h - 44, 36, 44, '#9fd8ff');
  g.strokeStyle = OUT; g.lineWidth = 2; g.beginPath(); g.moveTo(L.doorX, y + h - 44); g.lineTo(L.doorX, y + h); g.stroke();
  drawLabel(g, `${L.emoji} ${L.name}`, L.doorX, y + 13);
}

function drawCafe(g, L) {
  const { x, y, w, h } = L;
  drawShadow(g, x, y, w, h);
  rr(g, x, y, w, h, 8); g.fillStyle = '#f4b583'; g.fill(); strokeOut(g);
  rr(g, x - 4, y, w + 8, 28, 6); g.fillStyle = '#8a4b2b'; g.fill(); strokeOut(g);
  WINDOWS.cafe.forEach((r) => drawWindowRect(g, r, '#ffe9c9'));
  drawAwning(g, x - 4, y + 30, w + 8, 22, '#e0524d', '#ffffff');
  drawDoor(g, L.doorX - 16, y + h - 46, 32, 46, '#6b3d22');
  g.fillStyle = '#e9a0c0';
  [x + 14, x + w - 14].forEach((fx) => { g.beginPath(); g.arc(fx, y + h - 8, 7, 0, 6.283); g.fill(); strokeOut(g, 1.8); });
  drawLabel(g, `${L.emoji} ${L.name}`, L.doorX, y + 14);
}

function drawHospital(g, L) {
  const { x, y, w, h } = L;
  drawShadow(g, x, y, w, h);
  rr(g, x, y, w, h, 8); g.fillStyle = '#f4f7fb'; g.fill(); strokeOut(g);
  rr(g, x - 4, y, w + 8, 22, 6); g.fillStyle = '#5aa9e6'; g.fill(); strokeOut(g);
  g.beginPath(); g.arc(L.doorX, y + 52, 17, 0, 6.283); g.fillStyle = '#fff'; g.fill(); strokeOut(g, 2.5);
  g.fillStyle = '#e5484d'; g.fillRect(L.doorX - 4, y + 41, 8, 22); g.fillRect(L.doorX - 11, y + 48, 22, 8);
  WINDOWS.hospital.forEach((r) => drawWindowRect(g, r, '#cfeaff'));
  drawDoor(g, L.doorX - 16, y + h - 46, 32, 46, '#7fd1ff');
  drawLabel(g, `${L.emoji} ${L.name}`, L.doorX, y + 11);
}

function drawMarket(g, L) {
  const { x, y, w, h } = L;
  drawShadow(g, x, y, w, h);
  rr(g, x, y, w, h, 8); g.fillStyle = '#b9e08a'; g.fill(); strokeOut(g);
  WINDOWS.market.forEach((r) => drawWindowRect(g, r, '#e3f6c8'));
  drawDoor(g, L.doorX - 16, y + 36, 32, 46, '#6b3d22');
  drawAwning(g, x - 4, y, w + 8, 30, '#3aa655', '#ffffff');
  // crates with produce
  const crate = (cx, cy, c) => {
    rr(g, cx, cy, 44, 26, 3); g.fillStyle = '#c98f56'; g.fill(); strokeOut(g, 2);
    g.fillStyle = c;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(cx + 8 + i * 9.5, cy + 4, 5, 0, 6.283); g.fill(); strokeOut(g, 1.4); }
  };
  crate(x + 14, y + 92, '#ff6b4a'); crate(x + w - 58, y + 92, '#ffd43b');
  drawLabel(g, `${L.emoji} ${L.name}`, L.doorX, y + h - 24);
}

function drawParkGround(g, L) {
  const { x, y, w, h } = L;
  rr(g, x, y, w, h, 14); g.fillStyle = '#78c95c'; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < Math.floor(w / 60); i++) g.fillRect(x + 6 + i * 60, y + 6, 30, h - 12);
  rr(g, x, y, w, h, 14); strokeOut(g, 4); g.strokeStyle = '#3f8a35'; g.lineWidth = 4; g.stroke();
  // fence posts
  g.fillStyle = '#e8d6a0';
  for (let px = x + 10; px < x + w - 6; px += 22) { g.fillRect(px, y + 2, 4, 8); g.fillRect(px, y + h - 10, 4, 8); }
  // paths
  g.strokeStyle = '#ecdcaa'; g.lineWidth = 18; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(520, 372); g.lineTo(520, 430); g.lineTo(440, 470); g.lineTo(380, 520); g.lineTo(380, 575); g.stroke();
  g.beginPath(); g.moveTo(520, 430); g.lineTo(600, 425); g.lineTo(690, 470); g.stroke();
  g.lineCap = 'butt';
  // pond
  g.fillStyle = '#ecdcaa'; g.beginPath(); g.ellipse(590, 505, 78, 46, 0, 0, 6.283); g.fill();
  g.fillStyle = '#4db8e8'; g.beginPath(); g.ellipse(590, 505, 70, 38, 0, 0, 6.283); g.fill(); strokeOut(g, 3);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(575, 495, 38, 16, -0.2, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(620, 515, 14, 6, 0, 0, 6.283); g.stroke();
  g.beginPath(); g.ellipse(560, 520, 10, 4, 0, 0, 6.283); g.stroke();
  g.fillStyle = '#3fae4a';
  [[545, 500], [612, 490], [630, 520]].forEach(([lx, ly]) => { g.beginPath(); g.arc(lx, ly, 7, 0.4, 6.0); g.lineTo(lx, ly); g.fill(); });
  // benches
  const bench = (bx, by) => { rr(g, bx, by, 34, 10, 3); g.fillStyle = '#a8703d'; g.fill(); strokeOut(g, 2); g.fillStyle = '#6b4423'; g.fillRect(bx + 3, by + 10, 4, 5); g.fillRect(bx + 27, by + 10, 4, 5); };
  bench(455, 455); bench(650, 445); bench(405, 548);
  // entrance arch
  g.fillStyle = '#c98f56';
  rr(g, 494, 364, 9, 28, 2); g.fill(); strokeOut(g, 2); rr(g, 537, 364, 9, 28, 2); g.fill(); strokeOut(g, 2);
  rr(g, 490, 358, 60, 10, 4); g.fillStyle = '#e0524d'; g.fill(); strokeOut(g, 2);
  drawLabel(g, '🌳 Central Park & Pond', x + 100, y + 22);
}

function buildStatic(pw, ph, scale) {
  const c = document.createElement('canvas');
  c.width = pw; c.height = ph;
  const g = c.getContext('2d');
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const rnd = mulberry32(7);

  // grass
  g.fillStyle = '#8fd36b'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(40,130,60,0.10)';
    g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 18 + rnd() * 30, 8 + rnd() * 14, 0, 0, 6.283); g.fill();
  }
  // sidewalk cobblestones
  cobble(g, 0, 254, W, 32, rnd);
  cobble(g, 0, 342, W, 32, rnd);

  // curbs, then asphalt
  g.fillStyle = '#ece7d9';
  g.fillRect(0, 284, W, 6); g.fillRect(0, 340, W, 6);
  g.fillRect(244, 0, 6, H); g.fillRect(290, 0, 6, H); g.fillRect(744, 0, 6, H); g.fillRect(790, 0, 6, H);
  g.fillStyle = '#59606f';
  g.fillRect(0, 290, W, 50); g.fillRect(250, 0, 40, H); g.fillRect(750, 0, 40, H);

  // lane markings
  g.strokeStyle = '#f6d860'; g.lineWidth = 3; g.setLineDash([16, 12]);
  const dash = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  dash(0, 315, 238, 315); dash(302, 315, 738, 315); dash(802, 315, W, 315);
  dash(270, 0, 270, 278); dash(270, 352, 270, H); dash(770, 0, 770, 278); dash(770, 352, 770, H);
  g.setLineDash([]);

  // crosswalks
  g.fillStyle = 'rgba(255,255,255,0.85)';
  [226, 296, 726, 796].forEach((cx) => { for (let yy = 292; yy < 338; yy += 8) g.fillRect(cx, yy, 18, 4); });
  [262, 350].forEach((cy) => {
    for (let xx = 254; xx < 288; xx += 8) g.fillRect(xx, cy, 4, 18);
    for (let xx = 754; xx < 788; xx += 8) g.fillRect(xx, cy, 4, 18);
  });

  // flowers
  const flowerCols = ['#ff8fb1', '#ffd43b', '#ffffff', '#b794f6'];
  for (let i = 0; i < 90; i++) {
    const fx = 800 + rnd() * 180; const fy = 385 + rnd() * 230;
    g.fillStyle = flowerCols[i % 4]; g.beginPath(); g.arc(fx, fy, 2.4, 0, 6.283); g.fill();
  }
  for (let i = 0; i < 50; i++) {
    const fx = 475 + rnd() * 55; const fy = 60 + rnd() * 190;
    g.fillStyle = flowerCols[i % 4]; g.beginPath(); g.arc(fx, fy, 2.2, 0, 6.283); g.fill();
  }
  // picnic bench in the right lot
  rr(g, 870, 520, 40, 10, 3); g.fillStyle = '#a8703d'; g.fill(); strokeOut(g, 2);

  // park ground then buildings
  drawParkGround(g, LOCS.park);
  drawHome(g, LOCS.home);
  drawOffice(g, LOCS.office);
  drawCafe(g, LOCS.cafe);
  drawHospital(g, LOCS.hospital);
  drawMarket(g, LOCS.market);

  // lamps + trees (depth sorted)
  LAMPS.forEach((l) => drawLampPost(g, l.x, l.y));
  const trees = [...STREET_TREES, ...PARK_TREES].sort((a, b) => a[1] - b[1]);
  trees.forEach(([tx, ty, ts]) => drawTree(g, tx, ty, ts));
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  return c;
}

/* ============================================================================
 *  DYNAMIC DRAW (every frame — lightweight vector shapes only)
 * ========================================================================== */
let glowSprite = null;
function getGlow() {
  if (!glowSprite) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,225,130,0.95)');
    gr.addColorStop(0.4, 'rgba(255,200,90,0.35)');
    gr.addColorStop(1, 'rgba(255,200,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowSprite = c;
  }
  return glowSprite;
}

function drawCar(ctx, c) {
  const { x, y, dir, color } = c;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 16, y + 5, 32, 3);
  rr(ctx, x - 17, y - 6, 34, 12, 4); ctx.fillStyle = color; ctx.fill(); strokeOut(ctx, 2);
  rr(ctx, x - 8, y - 9, 16, 6, 3); ctx.fillStyle = 'rgba(220,240,255,0.95)'; ctx.fill(); strokeOut(ctx, 1.6);
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(x - 10, y + 6, 3, 0, 6.283); ctx.arc(x + 10, y + 6, 3, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#fff6b0'; ctx.fillRect(x + dir * 16 - 1.5, y - 2, 3, 4);
}

function drawFigure(ctx, a, bob, swing, sleeping) {
  const f = a.facing;
  ctx.lineCap = 'round';
  // legs
  ctx.strokeStyle = '#2d2a3a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-3, -6 + bob); ctx.lineTo(-3 + swing, 0); ctx.moveTo(3, -6 + bob); ctx.lineTo(3 - swing, 0); ctx.stroke();
  // arms
  ctx.strokeStyle = a.color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-7, -18 + bob); ctx.lineTo(-10, -11 + bob + swing * 0.35); ctx.moveTo(7, -18 + bob); ctx.lineTo(10, -11 + bob - swing * 0.35); ctx.stroke();
  // body
  rr(ctx, -7, -21 + bob, 14, 16, 5); ctx.fillStyle = a.color; ctx.fill(); strokeOut(ctx, 1.8);
  // head
  ctx.beginPath(); ctx.arc(0, -28 + bob, 8, 0, 6.283); ctx.fillStyle = '#ffdcb5'; ctx.fill(); strokeOut(ctx, 1.8);
  ctx.fillStyle = a.hair; ctx.beginPath(); ctx.arc(0, -29 + bob, 8.3, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
  // eyes
  const ex = f * 1.3;
  if (sleeping) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-4.5 + ex, -27.5 + bob); ctx.lineTo(-1.5 + ex, -27.5 + bob); ctx.moveTo(1.5 + ex, -27.5 + bob); ctx.lineTo(4.5 + ex, -27.5 + bob); ctx.stroke();
  } else {
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-3 + ex, -27.5 + bob, 1.5, 0, 6.283); ctx.arc(3 + ex, -27.5 + bob, 1.5, 0, 6.283); ctx.fill();
  }
  // mouth
  const mood = a.stats.mood;
  ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 1.3; ctx.beginPath();
  if (mood > 55) ctx.arc(ex, -26 + bob, 2.6, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (mood < 30) ctx.arc(ex, -23 + bob, 2.4, 1.15 * Math.PI, 1.85 * Math.PI);
  else { ctx.moveTo(ex - 2, -24.5 + bob); ctx.lineTo(ex + 2, -24.5 + bob); }
  ctx.stroke();
}

function drawAgent(ctx, a, t, selected) {
  const sleeping = isSleeping(a);
  const walking = a.state === 'walking';
  const bob = walking ? -Math.abs(Math.sin(a.phase)) * 3.2 : (sleeping ? 0 : Math.sin(t * 0.003 + a.id) * 0.8);
  const swing = walking ? Math.sin(a.phase) * 4.5 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(a.x, a.y + 1, sleeping ? 15 : 9, sleeping ? 4.5 : 3.6, 0, 0, 6.283); ctx.fill();
  if (selected) {
    ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(a.x, a.y + 1, 15 + Math.sin(t / 200) * 1.5, 6.5, 0, 0, 6.283); ctx.stroke();
  }
  ctx.save();
  if (sleeping) { ctx.translate(a.x + 10, a.y - 5); ctx.rotate(-Math.PI / 2); } else ctx.translate(a.x, a.y);
  drawFigure(ctx, a, bob, swing, sleeping);
  ctx.restore();
  // name tag
  const tw = a.nameW + 8;
  ctx.fillStyle = 'rgba(20,20,35,0.62)'; rr(ctx, a.x - tw / 2, a.y + 6, tw, 13, 6); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(a.name, a.x, a.y + 12.8);
}

function emojiFor(a, sim) {
  if (a.state === 'chatting') return '💬';
  if (isSleeping(a)) return '💤';
  if (sim.rainLevel > 0.4 && (a.loc === null || a.loc === 'park')) return '☔';
  if (!a.goal) return '🤔';
  const g = a.goal.type;
  if (g === 'work') return a.workplace === 'hospital' ? '🩺' : a.workplace === 'cafe' ? '☕' : a.workplace === 'park' ? '🎨' : a.workplace === 'market' ? '🛍️' : '💼';
  if (g === 'relax' || g === 'social') return LOCS[a.goal.loc].emoji;
  return GOALS[g].emoji;
}

function drawBubble(ctx, a) {
  const b = a.bubble; if (!b) return;
  const bw = b.w + 14; const bh = b.lines.length * 14 + 10;
  let bx = a.x - bw / 2; bx = Math.max(4, Math.min(W - bw - 4, bx));
  let by = a.y - 50 - bh; if (by < 4) by = 4;
  rr(ctx, bx, by, bw, bh, 8); ctx.fillStyle = '#ffffff'; ctx.fill(); strokeOut(ctx, 2);
  const tx = Math.max(bx + 10, Math.min(bx + bw - 10, a.x));
  ctx.beginPath(); ctx.moveTo(tx - 5, by + bh - 1); ctx.lineTo(tx, by + bh + 8); ctx.lineTo(tx + 5, by + bh - 1); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(tx - 4, by + bh - 2.5, 8, 4);
  ctx.fillStyle = OUT; ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  b.lines.forEach((ln, i) => ctx.fillText(ln, bx + 7, by + 14 + i * 14));
}

function drawClouds(ctx, sim, d) {
  const rl = sim.rainLevel;
  const base = 255 - rl * 150 - d * 90;
  ctx.fillStyle = `rgba(${base | 0},${(base + 5) | 0},${(base + 15) | 0},${0.45 + rl * 0.2})`;
  for (const c of sim.clouds) {
    const s = c.s;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 18 * s, 0, 6.283); ctx.arc(c.x + 20 * s, c.y - 8 * s, 22 * s, 0, 6.283);
    ctx.arc(c.x + 44 * s, c.y, 17 * s, 0, 6.283); ctx.arc(c.x + 22 * s, c.y + 6 * s, 20 * s, 0, 6.283);
    ctx.fill();
  }
}

function render(ctx, sim, bg, scale, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const d = darkness(sim.hour);

  // traffic
  for (const c of sim.cars) drawCar(ctx, c);

  // agents (depth-sorted by y)
  const order = sim.agents.slice().sort((p, q) => p.y - q.y);
  for (const a of order) drawAgent(ctx, a, t, a.id === sim.selectedId);

  // clouds
  drawClouds(ctx, sim, d);

  // rain streaks (single batched path)
  if (sim.rainLevel > 0.05) {
    ctx.strokeStyle = `rgba(190,220,255,${0.6 * sim.rainLevel})`; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const dr of sim.drops) { ctx.moveTo(dr.x, dr.y); ctx.lineTo(dr.x - dr.l * 0.18, dr.y + dr.l); }
    ctx.stroke();
    ctx.fillStyle = `rgba(50,70,100,${0.2 * sim.rainLevel})`; ctx.fillRect(0, 0, W, H);
  }

  // day / night atmosphere
  if (d > 0) {
    ctx.fillStyle = `rgba(14,20,60,${0.5 * d})`; ctx.fillRect(0, 0, W, H);
    if (d < 1) { ctx.fillStyle = `rgba(255,130,50,${0.16 * Math.sin(Math.PI * d)})`; ctx.fillRect(0, 0, W, H); }
  }

  // night lights: windows + lamp glow
  const outage = sim.isOutage();
  if (d > 0.1) {
    ctx.fillStyle = `rgba(255,214,102,${0.85 * d})`;
    for (const key of Object.keys(WINDOWS)) {
      if (key === 'office' && outage) continue;
      for (const r of WINDOWS[key]) ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    }
    const glow = getGlow();
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = d * 0.9;
    for (const l of LAMPS) ctx.drawImage(glow, l.x - 42, l.y - 62, 84, 84);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // outage visuals on the Tech Hub
  if (outage) {
    const o = LOCS.office;
    ctx.fillStyle = 'rgba(10,10,25,0.5)'; rr(ctx, o.x, o.y, o.w, o.h, 8); ctx.fill();
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 180);
    ctx.font = `30px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚡', o.doorX, o.y + 120);
    ctx.globalAlpha = 1;
  }

  // promo banner over the cafe
  if (sim.isPromo()) {
    const c = LOCS.cafe; const pulse = 1 + Math.sin(t / 220) * 0.05;
    ctx.save(); ctx.translate(c.doorX, c.y - 14); ctx.scale(pulse, pulse);
    rr(ctx, -62, -11, 124, 22, 11); ctx.fillStyle = '#ff7a59'; ctx.fill(); strokeOut(ctx, 2);
    ctx.fillStyle = '#fff'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☕ FREE COFFEE!', 0, 1);
    ctx.restore();
  }

  // status emojis + speech bubbles (drawn above the atmosphere so they stay readable)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const a of order) {
    if (a.bubble) continue;
    const bobE = Math.sin(t * 0.004 + a.id * 1.7) * 2.5;
    ctx.font = `15px ${EMOJI_FONT}`;
    ctx.fillText(emojiFor(a, sim), a.x, a.y - (isSleeping(a) ? 22 : 46) + bobE);
  }
  for (const a of order) drawBubble(ctx, a);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

/* ============================================================================
 *  REACT UI
 * ========================================================================== */
const STAT_DEFS = [
  { key: 'energy', label: 'Energy', icon: Zap,      bar: 'bg-yellow-400' },
  { key: 'mood',   label: 'Mood',   icon: Smile,    bar: 'bg-pink-400' },
  { key: 'social', label: 'Social', icon: Users,    bar: 'bg-sky-400' },
  { key: 'money',  label: 'Money',  icon: Wallet,   bar: 'bg-emerald-400' },
  { key: 'food',   label: 'Food',   icon: Utensils, bar: 'bg-orange-400' },
  { key: 'health', label: 'Health', icon: Heart,    bar: 'bg-red-400' },
];
const SWATCHES = ['#4f8cff', '#ff6fa5', '#ff9f43', '#2ec4a6', '#9b6bff', '#f4c430', '#ef4444', '#22d3ee'];

function StatBar({ def, value }) {
  const Icon = def.icon;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-300 mb-0.5">
        <span className="flex items-center gap-1"><Icon size={11} />{def.label}</span>
        <span className="font-mono">{def.key === 'money' ? `$${Math.round(value)}` : Math.round(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${def.bar}`} style={{ width: `${clamp(value)}%` }} />
      </div>
    </div>
  );
}

const KIND_STYLE = { chat: 'text-sky-300', move: 'text-amber-200', info: 'text-slate-200' };

function EventButton({ icon: Icon, label, active, sub, onClick, tone }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition active:scale-95 ${
        active ? `${tone.on} text-white` : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700'
      }`}
    >
      <Icon size={16} />
      <span className="text-left leading-tight">
        {label}
        {sub ? <span className="block text-[10px] font-normal opacity-80">{sub}</span> : null}
      </span>
    </button>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const simRef = useRef(null);
  if (simRef.current === null) simRef.current = new Simulation();
  const sim = simRef.current;

  const [snap, setSnap] = useState(() => sim.snapshot());
  const [tab, setTab] = useState('agents');
  const [form, setForm] = useState({ name: '', job: 'Software Engineer', traits: ['Creative'], color: SWATCHES[0] });
  const [formError, setFormError] = useState('');

  const logRef = useRef(null);
  const stickRef = useRef(true);
  const refresh = useCallback(() => setSnap(sim.snapshot()), [sim]);

  /* ---------- render loop + logic tick + UI sync ---------- */
  useEffect(() => {
    const canvas = canvasRef.current; const wrap = wrapRef.current;
    const ctx = canvas.getContext('2d');
    let bg = null; let scale = 1; let raf = 0;
    let lastFrame = performance.now(); let lastTick = lastFrame;

    const resize = () => {
      const cw = wrap.clientWidth; const ch = wrap.clientHeight;
      if (cw < 50 || ch < 50) return;
      const cssW = Math.floor(Math.min(cw, (ch * W) / H));
      const cssH = Math.round((cssW * H) / W);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      scale = canvas.width / W;
      bg = buildStatic(canvas.width, canvas.height, scale);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);

    const frame = (now) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      sim.step(dt);
      if (bg) render(ctx, sim, bg, scale, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const tickId = setInterval(() => {
      const now = performance.now();
      const dtMs = Math.min(250, now - lastTick); lastTick = now;
      sim.tick(dtMs);
    }, 100);
    const uiId = setInterval(() => setSnap(sim.snapshot()), 200);

    return () => { cancelAnimationFrame(raf); clearInterval(tickId); clearInterval(uiId); ro.disconnect(); };
  }, [sim]);

  /* ---------- auto-scroll the memory log (unless the user scrolled up) ---------- */
  useEffect(() => { stickRef.current = true; }, [snap.selectedId]);
  useEffect(() => {
    const el = logRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [snap.selected ? snap.selected.memoryCount : -1, snap.selectedId]);

  /* ---------- canvas pointer handlers ---------- */
  const toLogical = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const onPointerDown = (e) => {
    const [lx, ly] = toLogical(e);
    sim.selectedId = sim.pickAgent(lx, ly);
    refresh();
  };
  const onPointerMove = (e) => {
    const [lx, ly] = toLogical(e);
    canvasRef.current.style.cursor = sim.pickAgent(lx, ly) !== null ? 'pointer' : 'default';
  };

  /* ---------- controls ---------- */
  const togglePause = () => { sim.paused = !sim.paused; refresh(); };
  const setSpeedIdx = (i) => { sim.speed = SPEEDS[i]; refresh(); };
  const selectAgent = (id) => { sim.selectedId = id; refresh(); };

  const toggleTrait = (t) => setForm((f) => {
    const has = f.traits.includes(t);
    if (has) return { ...f, traits: f.traits.filter((x) => x !== t) };
    if (f.traits.length >= 3) return f;
    return { ...f, traits: [...f.traits, t] };
  });

  const submitAgent = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { setFormError('Please give your citizen a name.'); return; }
    if (!form.traits.length) { setFormError('Pick at least one personality trait.'); return; }
    const a = sim.addAgent({ name: name.slice(0, 12), profession: form.job, color: form.color, traits: form.traits });
    if (!a) { setFormError(`The city is full (max ${MAX_AGENTS} citizens).`); return; }
    setFormError('');
    sim.pushFeed(`🎉 ${a.name} the ${a.profession} moves to town!`, '#bbf7d0');
    sim.selectedId = a.id;
    setForm((f) => ({ ...f, name: '' }));
    setTab('agents');
    refresh();
  };

  const isNight = darkness(snap.hour) > 0.5;
  const sel = snap.selected;

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* ---------------- HEADER / TIME CONTROLS ---------------- */}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-sky-400"><Brain size={18} /></div>
          <div className="leading-tight">
            <div className="font-extrabold tracking-tight">AI City</div>
            <div className="text-[10px] text-slate-400 -mt-0.5">Autonomous Agent Simulator</div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5">
          {isNight ? <Moon size={16} className="text-indigo-300" /> : <Sun size={16} className="text-amber-300" />}
          <span className="font-mono text-lg font-bold tabular-nums">{snap.clock}</span>
          <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={11} />Day {snap.day}</span>
        </div>

        <button
          onClick={togglePause}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition active:scale-95 ${
            snap.paused ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-900' : 'bg-slate-700 hover:bg-slate-600'
          }`}
        >
          {snap.paused ? <Play size={16} /> : <Pause size={16} />}
          {snap.paused ? 'Resume' : 'Pause'}
        </button>

        <div className="flex items-center gap-3">
          <Gauge size={16} className="text-slate-400" />
          <div className="w-40">
            <input
              type="range" min={0} max={SPEEDS.length - 1} step={1}
              value={SPEEDS.indexOf(snap.speed)}
              onChange={(e) => setSpeedIdx(Number(e.target.value))}
              className="w-full accent-violet-400"
              aria-label="Simulation speed"
            />
            <div className="flex justify-between text-[10px] text-slate-400 -mt-1">
              {SPEEDS.map((s) => <span key={s} className={s === snap.speed ? 'text-violet-300 font-bold' : ''}>{s}x</span>)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-auto bg-slate-800 border border-slate-700 rounded-xl p-1">
          <button
            onClick={() => { sim.setWeather('sun'); refresh(); }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${snap.weather === 'sun' ? 'bg-amber-400 text-slate-900' : 'text-slate-300 hover:bg-slate-700'}`}
          ><Sun size={14} />Sun</button>
          <button
            onClick={() => { sim.setWeather('rain'); refresh(); }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${snap.weather === 'rain' ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          ><CloudRain size={14} />Rain</button>
        </div>
      </header>

      {/* ---------------- MAIN ---------------- */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="relative flex-1 min-h-0">
            <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center p-2">
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                className="rounded-2xl border-4 border-slate-800 shadow-xl"
              />
            </div>

            {/* Agent Inspector — side drawer */}
            <aside
              className={`absolute top-2 right-2 bottom-2 w-80 max-w-[90%] bg-slate-900/95 backdrop-blur border border-slate-700 rounded-2xl shadow-2xl flex flex-col transition-transform duration-300 ${
                sel ? 'translate-x-0' : 'translate-x-[110%] pointer-events-none'
              }`}
            >
              {sel && (
                <>
                  <div className="flex items-start gap-3 p-3 border-b border-slate-700">
                    <div className="w-10 h-10 rounded-full border-2 border-slate-900 shrink-0" style={{ background: sel.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold leading-tight">{sel.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1"><Briefcase size={11} />{sel.job} · {sel.workplace}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {sel.traits.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-200 border border-violet-500/30">{t}</span>)}
                      </div>
                    </div>
                    <button onClick={() => selectAgent(null)} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400"><X size={16} /></button>
                  </div>

                  <div className="p-3 space-y-2 border-b border-slate-700">
                    <div className="text-xs flex items-start gap-2"><Activity size={13} className="mt-0.5 text-emerald-300 shrink-0" /><span><span className="text-slate-400">Status: </span>{sel.status}</span></div>
                    <div className="text-xs flex items-start gap-2"><Target size={13} className="mt-0.5 text-amber-300 shrink-0" /><span><span className="text-slate-400">Goal: </span>{sel.goal}{sel.reason ? <span className="text-slate-400"> — {sel.reason}</span> : null}</span></div>
                    <div className="text-xs flex items-start gap-2"><MapPin size={13} className="mt-0.5 text-rose-300 shrink-0" /><span><span className="text-slate-400">Destination: </span>{sel.destination}<span className="text-slate-500"> · now: {sel.location}</span></span></div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1">
                      {STAT_DEFS.map((d) => <StatBar key={d.key} def={d} value={sel.stats[d.key]} />)}
                    </div>
                  </div>

                  <div className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Brain size={12} className="text-violet-300" />Memory Stream
                    <span className="ml-auto text-[10px] text-slate-500 font-normal">{sel.memoryCount} events</span>
                  </div>
                  <ul
                    ref={logRef}
                    onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
                    className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-1.5"
                  >
                    {sel.memory.map((m, i) => (
                      <li key={i} className="text-[11px] leading-snug bg-slate-800/70 rounded-lg px-2 py-1.5 border border-slate-700/60">
                        <span className="font-mono text-slate-500 mr-1.5">{m.stamp}</span>
                        <span className={KIND_STYLE[m.kind] || 'text-slate-200'}>{m.text}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </aside>
          </div>

          {/* God-mode bar */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-900 border-t border-slate-700">
            <span className="flex items-center gap-1 text-xs font-bold text-violet-300 mr-1"><Sparkles size={14} />GOD MODE</span>
            <EventButton
              icon={CloudRain} label="Trigger Rainstorm" tone={{ on: 'bg-sky-600 border-sky-400' }}
              active={snap.weather === 'rain'}
              sub={snap.rainLeft > 0 ? `${Math.ceil(snap.rainLeft)} min left` : snap.rainManual ? 'manual rain' : ''}
              onClick={() => { sim.triggerRain(); refresh(); }}
            />
            <EventButton
              icon={Coffee} label="Free Coffee Promo" tone={{ on: 'bg-orange-500 border-orange-300' }}
              active={snap.promoLeft > 0} sub={snap.promoLeft > 0 ? `${Math.ceil(snap.promoLeft)} min left` : ''}
              onClick={() => { sim.triggerPromo(); refresh(); }}
            />
            <EventButton
              icon={Zap} label="Power Outage" tone={{ on: 'bg-red-600 border-red-400' }}
              active={snap.outageLeft > 0} sub={snap.outageLeft > 0 ? `${Math.ceil(snap.outageLeft)} min left` : ''}
              onClick={() => { sim.triggerOutage(); refresh(); }}
            />
            <span className="ml-auto text-[11px] text-slate-500 hidden md:block">Tip: click a citizen on the map to open the inspector.</span>
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="w-80 shrink-0 hidden lg:flex flex-col bg-slate-900 border-l border-slate-700">
          <div className="flex p-2 gap-1 border-b border-slate-700">
            <button onClick={() => setTab('agents')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-semibold ${tab === 'agents' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><Users size={14} />Citizens ({snap.agentCount})</button>
            <button onClick={() => setTab('create')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-semibold ${tab === 'create' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><UserPlus size={14} />New Agent</button>
          </div>

          {tab === 'agents' ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                {snap.agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => selectAgent(a.id)}
                    className={`w-full text-left p-2 rounded-xl border transition ${snap.selectedId === a.id ? 'bg-slate-700 border-violet-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700/70'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-900 shrink-0" style={{ background: a.color }} />
                      <span className="font-semibold text-sm">{a.name}</span>
                      <span className="text-[11px] text-slate-400 truncate">{a.job}</span>
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5 truncate">{a.status}</div>
                    <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                      {['energy', 'mood', 'social'].map((k) => {
                        const d = STAT_DEFS.find((x) => x.key === k);
                        return (
                          <div key={k} className="h-1.5 rounded-full bg-slate-700 overflow-hidden" title={`${d.label}: ${a.stats[k]}`}>
                            <div className={`h-full ${d.bar}`} style={{ width: `${a.stats[k]}%` }} />
                          </div>
                        );
                      })}
                    </div>
                  </button>
                ))}
              </div>
              <div className="h-44 border-t border-slate-700 flex flex-col">
                <div className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Radio size={12} className="text-emerald-300" />City Feed</div>
                <ul className="flex-1 overflow-y-auto px-3 pb-2 space-y-1">
                  {snap.feed.slice().reverse().map((f, i) => (
                    <li key={i} className="text-[11px] leading-snug"><span className="font-mono text-slate-500 mr-1">{f.stamp}</span><span style={{ color: f.color }}>{f.text}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <form onSubmit={submitAgent} className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="text-xs text-slate-400">Inject a new autonomous citizen into the city. They will start at Sweet Home and make their own decisions.</div>
              <label className="block text-xs font-semibold text-slate-300">
                Name
                <input
                  value={form.name} maxLength={12}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Nora"
                  className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-300">
                Job
                <select
                  value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })}
                  className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                >
                  {Object.keys(JOBS).map((j) => <option key={j} value={j}>{j} — works at {LOCS[JOBS[j]].name}</option>)}
                </select>
              </label>
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-1">Personality <span className="text-slate-500 font-normal">(up to 3)</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {TRAITS.map((t) => (
                    <button
                      type="button" key={t} onClick={() => toggleTrait(t)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition ${form.traits.includes(t) ? 'bg-violet-500 border-violet-300 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-1">Color</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {SWATCHES.map((c) => (
                    <button
                      type="button" key={c} onClick={() => setForm({ ...form, color: c })}
                      className={`w-7 h-7 rounded-full border-2 ${form.color === c ? 'border-white scale-110' : 'border-slate-700'}`}
                      style={{ background: c }} aria-label={`Color ${c}`}
                    />
                  ))}
                  <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-8 h-8 rounded bg-transparent cursor-pointer" />
                </div>
              </div>
              {formError ? <div className="text-xs text-rose-300">{formError}</div> : null}
              <button type="submit" className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-sm active:scale-95 transition">
                <Plus size={16} />Add to City
              </button>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><MessageCircle size={11} />{snap.agentCount}/{MAX_AGENTS} citizens</div>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
