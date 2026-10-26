// The shared scene engine: canvas + pixel font + dither helpers, the Web Audio toolkit and step scheduler,
// and the transport (play/pause, mute, main loop, offline render hooks for scene-to-short).
// A scene loads this with <script src="../engine/engine.js"></script> and takes what it needs from `Engine`.
// It stays a classic script (no modules) so scenes still open straight from file:// and in the headless renderer.
const Engine = (() => {
'use strict';

// every scene draws on a 180x320 canvas, scaled up crisp by engine.css
const W = 180, H = 320;

// ---------- URL params every scene understands ----------
const q = new URLSearchParams(location.search);
const num = (k, d, lo, hi) => { const n = parseFloat(q.get(k)); return n >= lo && n <= hi ? n : d; };
const params = {
  q, num,
  CALM: q.get('calm') === '1',                              // no screen shake or flashes
  SHORT: q.get('short') === '1',                            // YouTube Short: a hit on the first frame
  DEBUG_T: q.has('t') ? parseFloat(q.get('t')) : null,      // freeze visuals at t seconds (no audio)
};

// the neutrals a palette is built on; scenes add their instrument colours on top
const NEUTRALS = { bg: '#04030c', grid: '#120f26', edge: '#2d2a55', dim: '#8a86c0', fg: '#f2eeff', shadow: '#000000', white: '#ffffff' };

// ---------- song clock ----------
// song = [{ id, bars }]; adds start (bar) and k (index) to each section
function clock(bpm, song) {
  const STEP = 60 / bpm / 4, BAR = STEP * 16, BEAT = STEP * 4;
  const BAR_SEC = [];
  { let a = 0; song.forEach((s, k) => { s.start = a; s.k = k; a += s.bars; for (let b = 0; b < s.bars; b++) BAR_SEC.push(k); }); }
  const TOTAL_STEPS = BAR_SEC.length * 16;
  const LOOP = TOTAL_STEPS * STEP;
  // where step s falls: its section, the bar within it (lb) and the 16th within the bar (i)
  function at(s) {
    s = ((s % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
    const bar = (s / 16) | 0, sec = song[BAR_SEC[bar]];
    return { s, sec, id: sec.id, lb: bar - sec.start, i: s % 16 };
  }
  const secDur = sec => sec.bars * BAR;
  const lb = lt => Math.floor(lt / BAR);
  return { SONG: song, STEP, BAR, BEAT, BAR_SEC, TOTAL_STEPS, LOOP, at, secDur, lb };
}

// visual envelopes and readouts, read from the scene's hit(layer, step) table so pictures and sound stay in sync
function envelopes(hit, { STEP, BAR, BEAT }) {
  function since(layer, t, back = 64) {
    const s = Math.floor(t / STEP);
    for (let k = 0; k < back; k++) if (hit(layer, s - k)) return t - (s - k) * STEP;
    return 99;
  }
  const pulse = (layer, t, rate = 10) => Math.exp(-since(layer, t) * rate);
  // the last value the layer played and how long ago
  function last(layer, t, back = 8) {
    const s = Math.floor(t / STEP);
    for (let k = 0; k < back; k++) { const v = hit(layer, s - k); if (v) return [v, t - (s - k) * STEP]; }
    return [0, 99];
  }

  // big 3-2-1 over the last bar of a build section; on the silent last beat it calls ifSilent() and returns true
  function countdown(lt, sec, ifSilent, x = 90, y = 90) {
    const bar = Math.floor(lt / BAR), beat = Math.floor((lt % BAR) / BEAT);
    if (bar !== sec.bars - 1) return false;
    if (beat === 3) { ifSilent(); return true; }
    const n = String(3 - beat);
    text(n, x + 2, y + 2, P.shadow, 6, 'c'); text(n, x, y, P.white, 6, 'c');
    return false;
  }

  // the live step sequencer panel at the bottom: hud = sequencer(rows), then hud(t) each frame.
  // rows = [[label, layer, colour, dark], ...]; x0 = where the 16 cells start;
  // held(layer, barStep) keeps a row lit while a note holds, its empty cells filled in the row's dark colour
  function sequencer(rows, { x0 = 22, held = () => false } = {}) {
    return t => {
      const s = Math.floor(t / STEP), b0 = s - (s % 16), cur = s % 16, y0 = 257;
      cx.fillStyle = P.shadow; cx.fillRect(6, y0 - 1, 172, 60);
      cx.fillStyle = P.bg; cx.fillRect(4, y0 - 3, 172, 60);
      cx.fillStyle = P.edge;
      cx.fillRect(4, y0 - 3, 172, 1); cx.fillRect(4, y0 + 56, 172, 1); cx.fillRect(4, y0 - 3, 1, 60); cx.fillRect(175, y0 - 3, 1, 60);
      rows.forEach(([lab, layer, col, dark], r) => {
        const y = y0 + 1 + r * 9, hold = held(layer, b0);
        let active = hold;
        for (let i = 0; i < 16 && !active; i++) if (hit(layer, b0 + i)) active = true;
        text(lab, 8, y, active ? (pulse(layer, t, 8) > 0.4 || hold ? P.fg : col) : P.edge);
        for (let i = 0; i < 16; i++) {
          const on = hit(layer, b0 + i), x = x0 + i * 9;
          cx.fillStyle = on ? (i === cur ? P.white : col) : hold ? dark : active ? P.grid : '#0a0818';
          cx.fillRect(x, y, 8, 5);
        }
      });
      cx.fillStyle = P.fg; cx.fillRect(x0 + cur * 9, y0 + 55, 8, 1); // playhead
    };
  }
  return { since, pulse, last, countdown, sequencer };
}

// ---------- canvas + gfx helpers ----------
const cv = document.getElementById('c');
const screen = cv.getContext('2d');
screen.imageSmoothingEnabled = false;
let cx = screen;    // what the helpers draw on: the screen, or an offscreen sprite inside withContext()

// draw with these helpers into another 2D context (an offscreen sprite), then back to the screen
function withContext(c, fn) {
  const keep = cx;
  cx = c;
  try { fn(); } finally { cx = keep; }
}
let P = NEUTRALS;   // set by gfx(): card() and the main loop draw in the scene's palette

// 3x5 pixel font, rows top to bottom
const FONT = {
  A:'010 101 111 101 101', B:'110 101 110 101 110', C:'011 100 100 100 011', D:'110 101 101 101 110',
  E:'111 100 110 100 111', F:'111 100 110 100 100', G:'011 100 101 101 011', H:'101 101 111 101 101',
  I:'111 010 010 010 111', J:'001 001 001 101 010', K:'101 101 110 101 101', L:'100 100 100 100 111',
  M:'101 111 111 101 101', N:'110 101 101 101 101', O:'010 101 101 101 010', P:'110 101 110 100 100',
  Q:'010 101 101 111 011', R:'110 101 110 101 101', S:'011 100 010 001 110', T:'111 010 010 010 010',
  U:'101 101 101 101 111', V:'101 101 101 101 010', W:'101 101 111 111 101', X:'101 101 010 101 101',
  Y:'101 101 010 010 010', Z:'111 001 010 100 111',
  0:'111 101 101 101 111', 1:'010 110 010 010 111', 2:'110 001 010 100 111', 3:'110 001 010 001 110',
  4:'101 101 111 001 001', 5:'111 100 110 001 110', 6:'011 100 111 101 111', 7:'111 001 010 010 010',
  8:'111 101 111 101 111', 9:'111 101 111 001 110',
  '-':'000 000 111 000 000', '.':'000 000 000 000 010', ':':'000 010 000 010 000',
  '=':'000 111 000 111 000', '+':'000 010 111 010 000', '!':'010 010 010 000 010', '?':'110 001 010 000 010',
  '>':'100 010 001 010 100', '<':'001 010 100 010 001', '/':'001 001 010 100 100', ',':'000 000 000 010 100',
  '(':'010 100 100 100 010', ')':'010 001 001 001 010', "'":'010 010 000 000 000', '~':'000 011 110 000 000',
  '^':'010 101 000 000 000', '#':'101 111 101 111 101', '%':'101 001 010 100 101', '*':'010 111 010 101 000',
};
const GL = {};
for (const k in FONT) GL[k] = FONT[k].replace(/ /g, '');

const textW = (s, sc) => s.length * 4 * sc - sc;
function text(s, x, y, col, sc = 1, align = 'l') {
  s = String(s).toUpperCase();
  if (align === 'c') x = Math.round(x - textW(s, sc) / 2);
  else if (align === 'r') x -= textW(s, sc);
  cx.fillStyle = col;
  for (let i = 0; i < s.length; i++) {
    const g = GL[s[i]];
    if (!g) continue;
    for (let k = 0; k < 15; k++) {
      if (g[k] === '1') cx.fillRect(x + i * 4 * sc + (k % 3) * sc, y + ((k / 3) | 0) * sc, sc, sc);
    }
  }
}

// bordered caption box; lines = [{t, c, s}]
function card(lines, y, cxp = 90, border = P.fg) {
  let w = 0, h = 4;
  for (const l of lines) { const s = l.s || 1; w = Math.max(w, textW(String(l.t), s)); h += 5 * s + 3; }
  w += 10;
  if (w > W) console.warn('card too wide:', lines.map(l => l.t).join(' / '));
  const x = Math.round(cxp - w / 2);
  cx.fillStyle = P.shadow; cx.fillRect(x + 2, y + 2, w, h);
  cx.fillStyle = P.bg;     cx.fillRect(x, y, w, h);
  cx.fillStyle = border;
  cx.fillRect(x, y, w, 1); cx.fillRect(x, y + h - 1, w, 1);
  cx.fillRect(x, y, 1, h); cx.fillRect(x + w - 1, y, 1, h);
  let ty = y + 4;
  for (const l of lines) { const s = l.s || 1; text(l.t, cxp, ty, l.c || P.fg, s, 'c'); ty += 5 * s + 3; }
  return h;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

function fillCircle(x, y, r, col) {
  if (r < 0) return;
  x = Math.round(x); y = Math.round(y);
  cx.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt((r + .5) * (r + .5) - dy * dy));
    cx.fillRect(x - dx, y + dy, 2 * dx + 1, 1);
  }
}

// ordered-dither ring/disc, d = 0..1 density
function ditherCircle(x, y, r0, r1, col, d) {
  if (d <= 0) return;
  x = Math.round(x); y = Math.round(y); r1 = Math.round(r1);
  cx.fillStyle = col;
  const lvl = d * 16;
  for (let py = Math.max(0, y - r1); py <= Math.min(H - 1, y + r1); py++) {
    for (let px = Math.max(0, x - r1); px <= Math.min(W - 1, x + r1); px++) {
      const dd = (px - x) ** 2 + (py - y) ** 2;
      if (dd <= r1 * r1 && dd >= r0 * r0 && bay(px, py) < lvl) cx.fillRect(px, py, 1, 1);
    }
  }
}

// filled dithered ellipse, semi-axes a, b, rotated by rot; r0 = inner cut-out (0..1) for rims
function dEllipse(x, y, a, b, rot, col, d, r0 = 0) {
  if (d <= 0 || a < 1 || b < 0.5) return;
  x = Math.round(x); y = Math.round(y);
  const c = Math.cos(rot), s = Math.sin(rot), m = Math.ceil(Math.max(a, b)), lvl = d * 16, r2 = r0 * r0;
  cx.fillStyle = col;
  for (let py = Math.max(-m, -y); py <= Math.min(m, H - 1 - y); py++) {
    for (let px = Math.max(-m, -x); px <= Math.min(m, W - 1 - x); px++) {
      const u = (px * c + py * s) / a, v = (py * c - px * s) / b, qq = u * u + v * v;
      if (qq <= 1 && qq >= r2 && bay(x + px, y + py) < lvl) cx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

// thin dithered ring, sampled by angle; sy squashes it into an ellipse, a0..a1 draws only that arc
function ring(x, y, r, col, th, d, sy = 1, a0 = 0, a1 = 2 * Math.PI) {
  if (d <= 0 || r < 1) return;
  cx.fillStyle = col;
  const lvl = d * 16, n = Math.ceil(r * 7 * (a1 - a0) / (2 * Math.PI)) + 8;
  for (let k = 0; k < n; k++) {
    const a = a0 + k / n * (a1 - a0), c = Math.cos(a), s = Math.sin(a);
    for (let j = 0; j < th; j++) {
      const px = Math.round(x + c * (r + j)), py = Math.round(y + s * (r + j) * sy);
      if (px >= 0 && px < W && py >= 0 && py < H && bay(px, py) < lvl) cx.fillRect(px, py, 1, 1);
    }
  }
}

function line(x0, y0, x1, y1, col, d = 1) {
  cx.fillStyle = col;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) {
    const px = Math.round(x0 + (x1 - x0) * k / n), py = Math.round(y0 + (y1 - y0) * k / n);
    if (d >= 1 || bay(px, py) < d * 16) cx.fillRect(px, py, 1, 1);
  }
}

function dot(px, py, col, d) {
  px = Math.round(px); py = Math.round(py);
  if (bay(px, py) < d * 16) { cx.fillStyle = col; cx.fillRect(px, py, 1, 1); }
}

// dithered pattern fills: d of a 4x4 tile in col (cached)
const PAT = {};
function ditherFill(col, d) {
  const n = Math.max(0, Math.min(16, Math.round(d * 16)));
  if (!n) return;
  const key = col + n;
  if (!PAT[key]) {
    const t = document.createElement('canvas'); t.width = t.height = 4;
    const c = t.getContext('2d'); c.fillStyle = col;
    for (let i = 0; i < 16; i++) if (BAYER[i] < n) c.fillRect(i % 4, (i / 4) | 0, 1, 1);
    PAT[key] = cx.createPattern(t, 'repeat');
  }
  cx.fillStyle = PAT[key]; cx.fillRect(0, 0, W, H);
}

// a star: dithered corona, limb, body, hot spot and boiling granulation; pal = [corona, limb, body, hot spot]
function sun(x, y, r, pal, t, glow = 0.35) {
  r = Math.max(1, Math.round(r));
  ditherCircle(x, y, r, Math.round(r * 1.3) + 4, pal[0], glow);
  fillCircle(x, y, r, pal[1]);
  if (r < 3) return;
  fillCircle(x, y, r - 2, pal[2]);
  fillCircle(x - Math.round(r * 0.22), y - Math.round(r * 0.22), Math.round(r * 0.5), pal[3]);
  if (r < 6) return;
  cx.fillStyle = pal[1];
  const rr = (r - 2) * (r - 2), sc = 6 / r + 0.25;
  for (let py = -r + 2; py <= r - 2; py++) {
    for (let px = -r + 2; px <= r - 2; px++) {
      if (px * px + py * py > rr) continue;
      const v = Math.sin(px * sc * 1.7 + t * 1.9) * Math.sin(py * sc * 2.1 - t * 1.3) + Math.sin((px - py) * sc + t * 0.7) * 0.6;
      if (v > 0.95 && bay(x + px, y + py) < 8) cx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

// the three caption slots every scene uses: section banner on top, fact card mid-screen, timeline note above the HUD
const banner = (title, sub, col, subCol = P.fg) => card([{ t: title, s: 2, c: col }, { t: sub, c: subCol }], 4, 90, col);
const fact = (lines, border) => card(lines.map(l => typeof l === 'string' ? { t: l } : l), 200, 90, border);
const timeline = s => text(s, 90, 244, P.dim, 1, 'c');

// the drawing kit, in the scene's palette (needs bg, fg, shadow; NEUTRALS has them)
function gfx(palette) {
  P = palette;
  cv.style.background = P.bg;
  return { cv, cx: screen, withContext, text, textW, card, BAYER, bay, fillCircle, ditherCircle, dEllipse, ring, line, dot, ditherFill,
           sun, banner, fact, timeline };
}

// ---------- small maths ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };   // smoothstep on 0..1

// ---------- seeded randomness ----------
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = n => { n = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d); n ^= n >>> 15; n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13; return (n >>> 0) / 4294967296; };

// ---------- number formatting for on-screen text ----------
function fmtNum(v) { return v >= 10 ? String(Math.round(v)) : v >= 1 ? String(Math.round(v * 10) / 10) : String(parseFloat(v.toPrecision(2))); }
function fmtBig(v) {
  if (v >= 1e12) return fmtNum(v / 1e12) + ' TRILLION';
  if (v >= 1e9) return fmtNum(v / 1e9) + ' BILLION';
  if (v >= 1e6) return fmtNum(v / 1e6) + ' MILLION';
  if (v >= 1e3) return Math.round(v).toLocaleString('en-US');
  return fmtNum(v);
}
const rough = v => { if (v <= 0) return '0'; const e = Math.pow(10, Math.floor(Math.log10(v)) - 1); return fmtBig(Math.round(v / e) * e); }; // 2 significant figures

// ---------- audio (everything synthesised) ----------
// ac is the live AudioContext, or an OfflineAudioContext while a render runs; scenes reach it through ctx()
let ac = null, master, noiseBuf, waves, T0 = 0, muted = false, step = 0;
const ctx = () => ac;

const midi = m => 440 * Math.pow(2, (m - 69) / 12);
// every node made while one step is being scheduled; all are disconnected once that step's last sound ends
// (Chrome tidies finished notes up by itself, Safari keeps processing them and slows to a crawl)
let bag = null;
const track = n => { if (bag) bag.push(n); return n; };
const G = v => { const g = track(ac.createGain()); g.gain.value = v; return g; };
const F = (type, f, Q = 0.7) => { const b = track(ac.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[0]; };
const pan = v => { const p = track(ac.createStereoPanner()); p.pan.value = v; return p; };

function pulseWave(d) {
  const N = 64, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    const a = 2 / (n * Math.PI);
    re[n] = a * Math.sin(n * Math.PI * d) * Math.cos(n * Math.PI * d);
    im[n] = a * Math.sin(n * Math.PI * d) ** 2;
  }
  return ac.createPeriodicWave(re, im);
}

// smooth tanh saturation (warm, not crushed)
function warm(k) {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  const s = ac.createWaveShaper(); s.curve = c; s.oversample = '2x';
  return s;
}

// wave: an oscillator type ('sine', 'triangle', ...), a pulse duty cycle (0.125, 0.25, 0.5) or a PeriodicWave
function osc(wave, f, t) {
  const o = track(ac.createOscillator());
  if (typeof wave === 'string') o.type = wave;
  else if (typeof wave === 'number') o.setPeriodicWave(waves[wave] ||= pulseWave(wave));
  else o.setPeriodicWave(wave);
  o.frequency.setValueAtTime(f, t);
  return o;
}
function env(g, t, vol, atk, dur, hold) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + atk);
  if (hold) { g.gain.setValueAtTime(vol, t + dur * hold); }
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function play(o, t, dur) { o.start(t); o.stop(t + dur + 0.03); }

// one second of white noise, as a source; loop for anything longer
function noiseSource(loop = false) {
  const s = track(ac.createBufferSource()); s.buffer = noiseBuf; s.loop = loop;
  return s;
}
// a burst of filtered noise; returns the filter so callers can sweep it
function noise(t, dur, vol, type, f, dest, Q = 0.8) {
  const s = noiseSource(), b = F(type, f, Q), g = G(1);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  chain(s, b, g, dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  return b;
}

// ---------- shared instruments: each takes the bus it plays into ----------
// 808-style metal: six detuned squares, bandpassed; hats and crashes are made of this
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
function metal(t, dur, vol, hp, p, dest) {
  const bp = F('bandpass', 10000, 0.9), g = G(1);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  chain(bp, F('highpass', hp), g, pan(p), dest);
  for (const f of METAL) { const o = osc('square', f * 1.6, t); o.connect(bp); play(o, t, dur); }
}
// noise swept up through a bandpass, swelling into a downbeat
function riser(t, dur, vol, dest) {
  const s = noiseSource(true);
  const bp = F('bandpass', 400, 3), g = G(1);
  bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(11000, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur - 0.01); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  chain(s, bp, g, dest); s.start(t); s.stop(t + dur + 0.02);
}
// sub boom on the big downbeats
function impact(t, dest) {
  const o = osc('sine', 120, t), g = G(1);
  o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
  env(g, t, 0.8, 0.003, 1.4, 0.15);
  chain(o, g, dest); play(o, t, 1.4);
}

const audio = { ctx, midi, track, G, F, chain, pan, pulseWave, warm, osc, env, play, noise, noiseSource, metal, riser, impact };

// ---------- transport: scheduler, play/pause, mute, main loop, render hooks ----------
// scene = {
//   clock,              from Engine.clock()
//   buildGraph(ac, master),  the scene's buses, ending in master
//   voices(s, t),       schedule every sound on step s at time t
//   title(lt, t, ctl),  the title scene, also shown (in wall-clock time) before the first tap; ctl = { started }
//   draw(tau),          one frame at song time tau
//   paused,             colour of the PAUSED card
//   thumb,              song time of the video thumbnail
// }
// returns { levels(bar0, bars, sr, setup) }, the offline level check behind window.__render
function run(scene) {
  const { STEP, BAR, LOOP, TOTAL_STEPS, SONG, BAR_SEC } = scene.clock;

  // a fresh audio graph on ac: master out, the scene's buses into it, then the noise
  // (filled last, as every scene did before the engine, so seeded runs draw the same random numbers)
  function build() {
    waves = {};
    master = G(0.0001);
    master.connect(ac.destination);
    scene.buildGraph(ac, master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function playStep(s, t) {
    bag = [];
    scene.voices(s, t);
    const nodes = bag, srcs = nodes.filter(n => typeof n.stop === 'function');
    bag = null;
    let left = srcs.length;
    for (const n of srcs) n.onended = () => { if (--left === 0) for (const m of nodes) m.disconnect(); };
  }

  function schedule() {
    if (ac.state !== 'running') return;
    const now = ac.currentTime;
    while (T0 + step * STEP < now + 0.15) {
      const t = T0 + step * STEP;
      if (t > now - 0.02) playStep(step, t); // skip steps missed while the tab was throttled
      step++;
    }
  }

  function startAudio() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    build();
    T0 = ac.currentTime + 0.2; step = 0;
    setInterval(schedule, 25); schedule();
    master.gain.setTargetAtTime(muted ? 0.0001 : 0.9, ac.currentTime, 0.2);
    ac.resume();
  }

  // render steps offline on a fresh graph, then hand the live context back; setup() runs once the graph is built
  async function renderOffline(s0, steps, t0, sr, setup) {
    const live = ac;
    ac = new OfflineAudioContext(2, Math.ceil((steps * STEP + t0 + 1) * sr), sr);
    build(); master.gain.value = 0.9;
    if (setup) setup();
    for (let s = s0; s < s0 + steps; s++) playStep(s, t0 + (s - s0) * STEP);
    const buf = await ac.startRendering();
    ac = live;
    return buf;
  }

  function toggle() {
    if (!ac) { startAudio(); return; }
    if (ac.state === 'running') ac.suspend(); else ac.resume();
  }
  function toggleMute() {
    muted = !muted;
    if (ac) master.gain.setTargetAtTime(muted ? 0.0001 : 0.9, ac.currentTime, 0.1);
  }
  cv.addEventListener('click', toggle);
  addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key === 'm' || e.key === 'M') toggleMute();
  });

  function frame() {
    const started = !!ac;
    let tau = 0;
    if (started) tau = Math.max(0, ac.currentTime - T0 - (ac.outputLatency || 0));
    else if (params.DEBUG_T !== null) tau = params.DEBUG_T;
    if (started || params.DEBUG_T !== null) scene.draw(tau);
    else {
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.fillStyle = P.bg; cx.fillRect(0, 0, W, H);
      scene.title(0, performance.now() / 1000, { started });
    }
    if (started && ac.state === 'suspended') card([{ t: 'PAUSED', c: scene.paused, s: 2 }], 150);
    requestAnimationFrame(frame);
  }

  // offline render for checking levels without ears: per-bar peak/rms of bars from bar0.
  // window.__render(bar0, bars, sr) by default; a scene with extra options wraps the returned levels() in its own
  async function levels(bar0, bars, sr = 22050, setup) {
    const buf = await renderOffline(bar0 * 16, bars * 16, 0.05, sr, setup);
    const L = buf.getChannelData(0), out = [];
    for (let b = 0; b < bars; b++) {
      let pk = 0, sum = 0, n = 0;
      for (let i = Math.floor((0.05 + b * BAR) * sr); i < Math.floor((0.05 + (b + 1) * BAR) * sr); i++) { const v = Math.abs(L[i]); pk = Math.max(pk, v); sum += v * v; n++; }
      const s = SONG[BAR_SEC[bar0 + b]];
      out.push({ bar: bar0 + b, sec: s.id, lb: bar0 + b - s.start, peak: +pk.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(3) });
    }
    return out;
  }
  window.__render = (bar0, bars, sr) => levels(bar0, bars, sr);
  window.__song = () => SONG.map(s => ({ id: s.id, start: s.start * BAR, bars: s.bars }));

  // video export (scene-to-short): one loop of frames and audio, rendered offline on the same clock
  window.__capture = {
    duration: LOOP,
    thumb: scene.thumb,
    frame: tau => scene.draw(tau),
    async audio(sr = 48000) {
      const buf = await renderOffline(0, TOTAL_STEPS, 0, sr);
      return { sampleRate: sr, L: buf.getChannelData(0).subarray(0, Math.round(LOOP * sr)), R: buf.getChannelData(1).subarray(0, Math.round(LOOP * sr)) };
    },
  };

  frame();
  return { levels };
}

return {
  W, H, NEUTRALS, params, clock, envelopes, gfx, audio, run,
  rand: { mulberry, hash },
  fmt: { fmtNum, fmtBig, rough },
  math: { clamp, smooth },
};
})();
