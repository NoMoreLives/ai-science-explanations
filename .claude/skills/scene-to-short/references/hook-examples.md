# Hook examples

Two tested edits, shown as diffs against the original scenes. Pick the one closest to the scene you're working on and adapt it. Don't paste it blindly: names (`LOOP`, `PHASE_S`, `TOTAL_STEPS`, `blipAt`, `chrome`, `sceneTitle`) vary from scene to scene.

## 1. Phase-based scene with inline audio setup (`sun-lifecycle`), plus Shorts opening

Shape: fixed phases of `PHASE_STEPS` steps, `startAudio()` builds the graph inline, a live `schedule()` also fires `blipAt` on each phase change. The live scene opens on a quiet rising hiss under a small banner. That's fine on the website, but a feed scroller would be gone before the first beat.

What changed:
- `SHORT = ?short=1`. Step 0 plays a kick, crash and bass note. The headline shown for the first two bars ("10 BILLION / YEARS IN / 45 SECONDS") is only here to show the mechanics: the wording, or keeping the original title, is the user's choice (see SKILL.md). Without `?short=1`, the scene is exactly as before.
- The graph setup moved out of `startAudio()` into `buildGraph()` so the offline render can reuse it.
- `frame()` became a shell; the drawing moved to `draw(tau, started)`. PAUSED stays in the shell (video never pauses).
- `audio()` schedules every step plus the phase-change blip that the live `schedule()` adds.

```diff
@@ -29,6 +29,7 @@
 const CORE_MK = 15;                     // core temperature at fusion, million K
 const RG_X = 100;                       // red-giant radius, times today's (schematic)
 const DEBUG_T = q.has('t') ? parseFloat(q.get('t')) : null; // freeze visuals at t seconds (no audio)
+const SHORT = q.get('short') === '1';  // YouTube Short: hook headline and a hit on the first frame
 
 const W = 180, H = 320;
 const STEP = 60 / BPM / 4;              // one 16th note, seconds
@@ -225,6 +226,10 @@
 function playStep(s, t) {
   const n = s % LOOP_STEPS, ph = n >> 6, i = n & 15, bar = (n >> 4) & 3;
   const on = L => ph === L || ph === 5;
+  if (SHORT && n === 0) {                               // the Short can't open on a quiet hiss
+    kickDrum(t); noise(t, 0.4, 0.3, 0, 3500);
+    voice('triangle', midi(PROG[0]), t, STEP * 7.5, 0.5, true);
+  }
   if (on(0)) {                                           // NOISE: collapse hiss rising, then hats
     if (ph === 0) { const pr = (n & 63) / 64; noise(t, 0.03, 0.03 + 0.3 * pr, 2500 + 9000 * pr); }
     else if (i % 2) noise(t, 0.03, 0.12, 7000);
@@ -252,8 +257,8 @@
   }
 }
 
-function startAudio() {
-  ac = new (window.AudioContext || window.webkitAudioContext)();
+// master -> bus -> waves + noise, on whatever context `ac` is (live or offline)
+function buildGraph() {
   master = ac.createGain();
   master.gain.value = 0.0001;
   master.connect(ac.destination);
@@ -262,7 +267,11 @@
   noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
   const d = noiseBuf.getChannelData(0);
   for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
+}
 
+function startAudio() {
+  ac = new (window.AudioContext || window.webkitAudioContext)();
+  buildGraph();
   T0 = ac.currentTime + 0.15;
   nextT = T0; step = 0;
   setInterval(schedule, 40);
@@ -295,6 +304,11 @@
 
 // banner, caption box, layer chip, footnote; the title shows over phase 1 before audio starts
 function chrome(ph, k, lines, note = 'SCHEMATIC. NOT TO SCALE') {
+  if (SHORT && ph === 0 && k.started && k.p < 0.5) {    // hook: the promise, big, for the first two bars
+    card([{ t: '10 BILLION', c: P.sun, s: 3 }, { t: 'YEARS IN', s: 2 }, { t: `${Math.round(LOOP)} SECONDS`, c: P.sun, s: 3 }], 6);
+    card([{ t: 'THE WHOLE LIFE OF A SUN' }], 226);
+    return;
+  }
   if (ph === 0 && !k.started) card([{ t: 'THE LIFE OF A SUN', c: P.sum, s: 2 }], 6);
   else card([{ t: `${ph + 1} OF 6 ${NAMES[ph]}`, c: P.sum }], 6);
   card(cap(lines), 226);
@@ -396,6 +410,12 @@
   let tau = 0;
   if (started) tau = Math.max(0, ac.currentTime - T0 - (ac.outputLatency || 0));
   else if (DEBUG_T !== null) tau = DEBUG_T;
+  draw(tau, started);
+  if (started && ac.state === 'suspended') card([{ t: 'PAUSED', c: P.sum, s: 2 }], 150);
+  requestAnimationFrame(frame);
+}
+
+function draw(tau, started) {
   const t = tau % LOOP;
   const ph = Math.floor(t / PHASE_S);
   const local = t - ph * PHASE_S;
@@ -415,9 +435,26 @@
     cx.fillStyle = fade[Math.ceil(16 * (1 - local / 0.35))];
     cx.fillRect(0, 0, W, H);
   }
-  if (started && ac.state === 'suspended') card([{ t: 'PAUSED', c: P.sum, s: 2 }], 150);
-  requestAnimationFrame(frame);
 }
+
+// video export (scene-to-short): one loop of frames and audio, rendered offline on the same clock
+window.__capture = {
+  duration: LOOP,
+  thumb: 4.5 * PHASE_S,                     // mid death: shell blowing off
+  frame: tau => draw(tau, true),
+  async audio(sr = 48000) {
+    const live = ac;
+    ac = new OfflineAudioContext(2, Math.round(LOOP * sr), sr);
+    buildGraph(); master.gain.value = 0.9;
+    for (let s = 0; s * STEP < LOOP; s++) {
+      playStep(s, s * STEP);
+      if (s > 0 && (s & (PHASE_STEPS - 1)) === 0) blipAt(s * STEP);
+    }
+    const buf = await ac.startRendering();
+    ac = live;
+    return { sampleRate: sr, L: buf.getChannelData(0), R: buf.getChannelData(1) };
+  },
+};
 frame();
 })();
 </script>
```

## 2. SONG-section scene with a mixer graph (`black-hole`)

Shape: `SONG` sections of bars, a `buildGraph()` already exists (and an offline `__render` for level checks), the title card shows when nothing is playing. (Its Shorts opening isn't shown here. Do it the same way as example 1: a `SHORT` branch in `sceneTitle` and a hit in `playStep` at step 0.)

What changed:
- `frame()` keeps the not-started title card and calls `draw(tau)` otherwise.
- `sceneTitle` blinked its "FROM STAR TO NOTHING" line on `performance.now()` even while playing. That would make the video's first bars depend on the render's wall clock, so it now blinks on `t` (song time when playing, and the not-started call passes wall-clock seconds as `t`, so the live title card is unchanged). Grep every scene function for `performance.now()` / `Date.now()`. Each one reachable from `draw` needs this treatment.
- `playStep` already handles section gains and every per-section event, so `audio()` just loops over `TOTAL_STEPS`.
- `thumb` is computed from `SONG` so it stays right if the tempo or bar counts change. It's set between kicks: the drop flashes the screen on every kick, and a thumbnail on the beat is half dither.

```diff
@@ -795,7 +795,7 @@
   bhole(90, 150, 14, t, { rIn: 20, rOut: 64, tilt: 0.2, glow: 0.3 + 0.2 * Math.sin(t * 3) });
   card([{ t: 'BLACK', s: 3 }, { t: 'HOLE', s: 3, c: P.acid }, { t: `INDUSTRIAL CHIP MIX - ${BPM} BPM`, c: P.dim }], 34);
   text('6 LAYERS. 1 BLACK HOLE. 1 DROP.', 90, 208, P.dim, 1, 'c');
-  const on = ((performance.now() / 500) | 0) % 2 === 0;
+  const on = ((t * 2) | 0) % 2 === 0;   // song time when playing; the not-started card is passed wall-clock seconds
   if (!ctl.started) {
     if (on) card([{ t: 'TAP TO START', c: P.acid, s: 2 }], 250);
     text('BASS HEAVY: TURN IT UP', 90, 290, P.edge, 1, 'c');
@@ -1117,13 +1117,22 @@
   let tau = 0;
   if (started) tau = Math.max(0, ac.currentTime - T0 - (ac.outputLatency || 0));
   else if (DEBUG_T !== null) tau = DEBUG_T;
+  if (started || DEBUG_T !== null) draw(tau);
+  else {
+    cx.setTransform(1, 0, 0, 1, 0, 0);
+    cx.fillStyle = P.bg; cx.fillRect(0, 0, W, H);
+    sceneTitle(0, performance.now() / 1000, { started });
+  }
+  if (started && ac.state === 'suspended') card([{ t: 'PAUSED', c: P.acid, s: 2 }], 150);
+  requestAnimationFrame(frame);
+}
+
+function draw(tau) {
   const t = tau % LOOP;
   const bar = Math.floor(t / BAR), sec = SONG[BAR_SEC[bar]], lt = t - sec.start * BAR;
-  const showing = started || DEBUG_T !== null;
 
   cx.setTransform(1, 0, 0, 1, 0, 0);
   cx.fillStyle = P.bg; cx.fillRect(0, 0, W, H);
-  if (!showing) { sceneTitle(0, performance.now() / 1000, { started }); requestAnimationFrame(frame); return; }
 
   const ke = pulse('kick', t, 12), D = sec.id === 'drop', e8 = lb(lt) % 8;
   const shake = D && !(lb(lt) >> 3 === 1 && e8 >= 6) ? 6 : sec.id === 'nova' ? 3 : 0;
@@ -1143,9 +1152,23 @@
   if (!CALM && since('crash', t) < 0.05) { // one-frame negative on the crash
     cx.globalCompositeOperation = 'difference'; cx.fillStyle = P.white; cx.fillRect(0, 0, W, H); cx.globalCompositeOperation = 'source-over';
   }
-  if (started && ac.state === 'suspended') card([{ t: 'PAUSED', c: P.acid, s: 2 }], 150);
-  requestAnimationFrame(frame);
 }
+
+// video export (scene-to-short): one loop of frames and audio, rendered offline on the same clock
+window.__capture = {
+  duration: LOOP,
+  thumb: SONG.find(s => s.id === 'drop').start * BAR + 2 * BAR + 6 * STEP,   // two bars into the drop, between kicks (no flash)
+  frame: tau => draw(tau),
+  async audio(sr = 48000) {
+    const live = ac;
+    ac = new OfflineAudioContext(2, Math.round(LOOP * sr), sr);
+    buildGraph(); master.gain.value = 0.9;
+    for (let s = 0; s < TOTAL_STEPS; s++) playStep(s, s * STEP);
+    const buf = await ac.startRendering();
+    ac = live;
+    return { sampleRate: sr, L: buf.getChannelData(0), R: buf.getChannelData(1) };
+  },
+};
 frame();
 })();
 </script>
```

## Other shapes

- **Segments in seconds, not steps** (e.g. a `DUR = [5, 8, 8]` array): the music grid may not divide the loop evenly. Schedule steps while `s * STEP < duration`, and work out segment boundaries by summing `DUR` for any sound fired on a scene change.
- **Sustained oscillators started at `T0`** (drones, held tones): in `audio()`, create them the same way, `start(0)`, and `stop(duration)`. Keep any `StereoPanner`s.
- **Sounds fired from `frame()`**, not the scheduler: they won't happen offline unless you schedule them yourself at their exact time.
