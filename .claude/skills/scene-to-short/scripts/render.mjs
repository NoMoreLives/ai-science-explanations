#!/usr/bin/env node
// Render a scene's window.__capture hook to a 1080x1920 YouTube Short (H.264 + AAC) and a thumbnail PNG.
//   node render.mjs <scene-name | path/to/index.html> [--fps 30] [--thumb SEC] [--thumb-only] [--no-short] [--query "bpm=150&calm=1"] [--out DIR]
// short=1 is added to the scene URL unless --no-short: scenes use it for their Shorts opening (hook headline, hit on frame one).
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCALE = 6;          // 180x320 -> 1080x1920; whole-number scale keeps every art pixel square
const MAX_SHORT = 180;    // YouTube rejects Shorts longer than 3 minutes
const BATCH = 60;         // frames pulled from the page per evaluate() call

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { fps: 30, thumb: null, query: '', out: null, thumbOnly: false, short: true };
let target = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--fps') opt.fps = parseInt(argv[++i], 10);
  else if (a === '--thumb') opt.thumb = parseFloat(argv[++i]);
  else if (a === '--query') opt.query = argv[++i].replace(/^\?/, '');
  else if (a === '--out') opt.out = argv[++i];
  else if (a === '--thumb-only') opt.thumbOnly = true;
  else if (a === '--no-short') opt.short = false;
  else if (!target) target = a;
  else die(`unexpected argument: ${a}`);
}
if (!target) die('usage: render.mjs <scene-name | path/to/index.html> [--fps 30] [--thumb SEC] [--thumb-only] [--no-short] [--query "k=v"] [--out DIR]');
if (opt.short && !/(^|&)short=/.test(opt.query)) opt.query = opt.query ? `${opt.query}&short=1` : 'short=1';

function die(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }

let root;
try { root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); }
catch { root = process.cwd(); }

let html = target;
if (!/\.html?$/.test(html)) html = path.join(root, 'site', target, 'index.html');
html = path.resolve(html);
if (!fs.existsSync(html)) die(`scene not found: ${html}`);
const name = path.basename(path.dirname(html));
const outDir = path.resolve(opt.out || path.join(root, 'out'));
fs.mkdirSync(outDir, { recursive: true });
const mp4 = path.join(outDir, `${name}.mp4`);
const wav = path.join(outDir, `${name}.wav`);
const png = path.join(outDir, `${name}-thumb.png`);

// ---------- browser ----------
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
const url = pathToFileURL(html).href + (opt.query ? `?${opt.query}` : '');
await page.goto(url);
await page.waitForTimeout(200);

const info = await page.evaluate(() => {
  const c = window.__capture, cv = document.querySelector('canvas');
  if (!c) return null;
  return { duration: c.duration, thumb: c.thumb ?? null, hasFrame: typeof c.frame === 'function',
           hasAudio: typeof c.audio === 'function', w: cv?.width, h: cv?.height };
});
if (!info) die(`${name} has no window.__capture hook. Add one first (see SKILL.md).`);
if (!info.hasFrame || !info.hasAudio) die('window.__capture needs frame(tau) and audio(sampleRate)');
if (!(info.duration > 0)) die(`window.__capture.duration is ${info.duration}`);
if (pageErrors.length) die(`page errors on load:\n  ${pageErrors.join('\n  ')}`);
const { duration, w: W, h: H } = info;
console.log(`${name}: ${W}x${H} canvas, ${duration.toFixed(2)} s loop, ${opt.fps} fps`);
if (duration > MAX_SHORT) die(`loop is ${duration.toFixed(1)} s, over the ${MAX_SHORT} s Shorts limit. Try a faster --query bpm=…`);

const grab = (from, to, fps) => page.evaluate(([from, to, fps]) => {
  const cv = document.querySelector('canvas'), cx = cv.getContext('2d');
  const out = [];
  for (let i = from; i < to; i++) {
    window.__capture.frame(i / fps);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let bin = '';
    for (let j = 0; j < d.length; j += 0x8000) bin += String.fromCharCode.apply(null, d.subarray(j, j + 0x8000));
    out.push(btoa(bin));
  }
  return out;
}, [from, to, fps]);

// ---------- thumbnail ----------
const thumbT = opt.thumb ?? info.thumb ?? duration * 0.4;
const thumbRaw = Buffer.from((await grab(Math.round(thumbT * 1000), Math.round(thumbT * 1000) + 1, 1000))[0], 'base64');
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-',
  '-vf', `scale=${W * SCALE}:${H * SCALE}:flags=neighbor`, '-frames:v', '1', png], { input: thumbRaw });
console.log(`thumbnail: ${png} (t=${thumbT.toFixed(2)} s)`);
if (opt.thumbOnly) { await browser.close(); process.exit(0); }

// ---------- audio: offline render, 16-bit stereo WAV built in the page ----------
console.log('rendering audio…');
const audio = await page.evaluate(async () => {
  const r = await window.__capture.audio(48000);
  const L = r.L, R = r.R || r.L, n = L.length, sr = r.sampleRate;
  let peak = 0, diff = 0;
  const buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i])), rr = Math.max(-1, Math.min(1, R[i]));
    peak = Math.max(peak, Math.abs(l), Math.abs(rr)); diff = Math.max(diff, Math.abs(l - rr));
    v.setInt16(44 + i * 4, l * 32767, true); v.setInt16(46 + i * 4, rr * 32767, true);
  }
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), seconds: n / sr, peak, stereoDiff: diff };
});
fs.writeFileSync(wav, Buffer.from(audio.b64, 'base64'));
console.log(`  ${audio.seconds.toFixed(2)} s, peak ${audio.peak.toFixed(3)}${audio.peak >= 1 ? ' (clipped)' : ''}, stereo ${audio.stereoDiff > 0.01 ? 'wide' : 'mono-ish'}`);

// ---------- video: raw RGBA frames into ffmpeg ----------
const frames = Math.round(duration * opt.fps);
const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(opt.fps), '-i', '-',
  '-i', wav,
  '-vf', `scale=${W * SCALE}:${H * SCALE}:flags=neighbor`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(opt.fps),
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-t', duration.toFixed(3), '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`))));

const t0 = Date.now();
for (let i = 0; i < frames; i += BATCH) {
  for (const b64 of await grab(i, Math.min(frames, i + BATCH), opt.fps)) {
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  }
  process.stdout.write(`\r  frames ${Math.min(frames, i + BATCH)}/${frames}`);
}
ff.stdin.end();
await ffDone;
console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

if (pageErrors.length) console.log(`WARN page errors during render:\n  ${pageErrors.join('\n  ')}`);
await browser.close();

// ---------- checks ----------
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4], { encoding: 'utf8' }));
const vs = probe.streams.find(s => s.codec_type === 'video'), as = probe.streams.find(s => s.codec_type === 'audio');
const dur = parseFloat(probe.format.duration);
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); ok &&= cond; };
check(vs && vs.width === 1080 && vs.height === 1920, `video ${vs?.width}x${vs?.height} (want 1080x1920)`);
check(vs?.codec_name === 'h264' && vs?.pix_fmt === 'yuv420p', `video codec ${vs?.codec_name}/${vs?.pix_fmt}`);
check(as?.codec_name === 'aac' && as?.channels === 2, `audio ${as?.codec_name}, ${as?.channels} ch`);
check(Math.abs(dur - duration) < 0.15, `duration ${dur.toFixed(2)} s (loop ${duration.toFixed(2)} s)`);
check(dur <= MAX_SHORT, `within the ${MAX_SHORT} s Shorts limit`);
check(audio.peak > 0.01, `audio is not silent (peak ${audio.peak.toFixed(3)})`);
if (audio.peak >= 1) console.log('WARN audio clipped at full scale; lower the hook\'s master gain');
if (dur > 60) console.log(`WARN ${dur.toFixed(1)} s is over 60 s: still a valid Short (limit 3 min), but shorter ones tend to loop and retain better`);
fs.rmSync(wav);
console.log(`\nvideo:     ${mp4}\nthumbnail: ${png} (t=${thumbT.toFixed(2)} s)`);
process.exit(ok ? 0 : 1);
