#!/usr/bin/env node
// Check that a scene still looks and sounds the same as it did at a git ref: for refactors that must not change anything.
//   npm run verify -- <scene> [--ref HEAD] [--query "bpm=150"] [--step 0.37]
// Both versions run in headless Chrome with Math.random seeded. Compared, for "" and "short=1&calm=1" (or --query):
//   frames    every --step seconds over the loop (window.__capture.frame, or ?t= reloads if a side has no hook)
//   levels    per-bar peak/rms (window.__render at 8 kHz; raw samples aren't reproducible run to run): the whole song
//             for the first query, the first 8 bars for the rest (short/calm only change the opening sound)
//   data      window.__song and window.__phys
//   console   errors and warnings, minus Chrome's "outside nominal range" filter notes
//   live      tap to start, pause, mute: no errors
// Exits 1 on any difference.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { ref: 'HEAD', queries: null, step: 0.37 };
let scene = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--ref') opt.ref = argv[++i];
  else if (a === '--query') (opt.queries ||= []).push(argv[++i].replace(/^\?/, ''));
  else if (a === '--step') opt.step = parseFloat(argv[++i]);
  else if (!scene) scene = a.replace(/\/+$/, '');
  else die(`unexpected argument: ${a}`);
}
if (!scene) die('usage: verify-scene.mjs <scene> [--ref HEAD] [--query "k=v"] [--step 0.37]');
opt.queries ||= ['', 'short=1&calm=1'];

function die(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const now = path.join(root, 'site', scene, 'index.html');
if (!fs.existsSync(now)) die(`scene not found: ${now}`);

// the old site, whole, so ../engine/ resolves to the engine as it was at that ref
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-scene-'));
execFileSync('sh', ['-c', `git archive ${JSON.stringify(opt.ref)} site | tar -x -C ${JSON.stringify(tmp)}`], { cwd: root });
const was = path.join(tmp, 'site', scene, 'index.html');
if (!fs.existsSync(was)) die(`site/${scene}/index.html does not exist at ${opt.ref}`);

// ---------- browser ----------
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const NOISE = /nominal range|willReadFrequently/;

async function open(html, query) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !NOISE.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => {
    let a = 12345;
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    // FNV-1a over the canvas pixels: frames are compared by hash, not shipped out of the page
    window.__pixHash = () => {
      const d = document.querySelector('canvas').getContext('2d').getImageData(0, 0, 180, 320).data;
      let h = 0x811c9dc5;
      for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(16);
    };
  });
  await page.goto(pathToFileURL(html).href + (query ? `?${query}` : ''));
  await page.waitForTimeout(200);
  return { page, errors };
}

const hooks = page => page.evaluate(() => ({
  capture: !!window.__capture, duration: window.__capture?.duration ?? null,
  song: window.__song ? JSON.stringify(window.__song()) : null,
  phys: window.__phys ? JSON.stringify(window.__phys()) : null,
  bars: window.__song ? window.__song().reduce((a, s) => a + s.bars, 0) : null,
}));

// frames through the capture hook, in one evaluate
const captureFrames = (page, taus) => page.evaluate(taus => taus.map(t => { window.__capture.frame(t); return window.__pixHash(); }), taus);

// frames through ?t= (DEBUG_T): one load per frame, for versions without a capture hook
async function debugFrames(html, query, taus) {
  const out = [];
  for (const t of taus) {
    const { page } = await open(html, [query, `t=${t}`].filter(Boolean).join('&'));
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    out.push(await page.evaluate(() => window.__pixHash()));
    await page.close();
  }
  return out;
}

async function live(html, query) {
  const { page, errors } = await open(html, query);
  await page.click('canvas');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  await page.close();
  return errors;
}

// ---------- compare ----------
let failed = false;
const report = (ok, label, detail = '') => { if (!ok) failed = true; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); };

console.log(`${scene}: working copy vs ${opt.ref}`);
for (const query of opt.queries) {
  console.log(`?${query}`);
  const [A, B] = await Promise.all([open(was, query), open(now, query)]);
  const [ha, hb] = await Promise.all([hooks(A.page), hooks(B.page)]);
  if (B.errors.length && !hb.song) { report(false, 'load', B.errors.slice(0, 3).join(' | ')); await Promise.all([A.page.close(), B.page.close()]); continue; }

  const duration = hb.duration ?? ha.duration;
  const bars = query === opt.queries[0] ? hb.bars ?? ha.bars : Math.min(8, hb.bars ?? ha.bars);
  if (duration) {
    const step = ha.capture && hb.capture ? opt.step : Math.max(opt.step, 2);   // ?t= reloads are slow: sample sparser
    const taus = [];
    for (let t = 0; t < duration; t += step) taus.push(+t.toFixed(3));
    const [fa, fb] = await Promise.all([
      ha.capture && hb.capture ? captureFrames(A.page, taus) : debugFrames(was, query, taus),
      ha.capture && hb.capture ? captureFrames(B.page, taus) : debugFrames(now, query, taus),
    ]);
    const diff = taus.filter((_, i) => fa[i] !== fb[i]);
    report(!diff.length, `frames (${taus.length}, every ${step} s${ha.capture && hb.capture ? '' : ' via ?t='})`,
      diff.length ? `${diff.length} differ, first at t=${diff.slice(0, 6).join(', ')}` : '');
  } else report(false, 'frames', 'neither version has window.__capture');

  if (bars) {
    const [la, lb] = await Promise.all([A, B].map(x => x.page.evaluate(n => window.__render(0, n, 8000), bars)));
    const diff = la.filter((x, i) => !lb[i] || x.peak !== lb[i].peak || x.rms !== lb[i].rms).map(x => x.bar);
    report(!diff.length && la.length === lb.length, `levels (${bars} bars)`, diff.length ? `bars ${diff.slice(0, 10).join(', ')} differ` : '');
  } else report(false, 'levels', 'no window.__song to count bars');

  if (ha.song) report(ha.song === hb.song, '__song');
  if (ha.phys) report(ha.phys === hb.phys, '__phys');
  await Promise.all([A.page.close(), B.page.close()]);
  report(!B.errors.length, 'console', B.errors.slice(0, 3).join(' | '));
  const le = await live(now, query);
  report(!le.length, 'live: start, pause, mute', le.slice(0, 3).join(' | '));
}

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? 'DIFFERENT' : 'SAME');
process.exit(failed ? 1 : 0);
