---
name: pixel-science-explainer
description: Build a pixel-art science explainer scene for this repo in the "Bit Forge" style (180x320 canvas scaled with nearest-neighbor, 3x5 pixel font, bordered caption cards, dithered glow, a live step-sequencer HUD) set to a chiptune track synthesised in code, where each section of the song adds one musical layer and one piece of the science, building to a drop. Scenes live in site/<topic>/ and run on the shared engine in site/engine/. Use this whenever the user wants a retro / 8-bit / pixel-art / chiptune animation, short, or interactive demo that explains a physics, astronomy, acoustics, biology or other science phenomenon (Doppler effect, resonance, black holes, beats, standing waves, etc.), or says "recreate X in the Bit Forge style", "pixel art version of X" or "a new scene", even if they don't mention HTML or Web Audio.
---

# Pixel-art science explainer

Produces one scene folder, `site/<topic>/` (`index.html`, `icon.svg`, `scene.json`), that teaches one phenomenon as a song: every section introduces one musical layer and one idea, a build counts down, and a drop puts it all together. The look comes from the Bit Forge Shorts: the diagrams are drawn by code, so the physics is exactly right (rings really squeeze, waves really have the stated frequency). That exactness is the point, so derive every drawn or heard quantity from the same constants rather than hand-tuning pictures.

Scenes run on the shared engine, `site/engine/engine.js` + `engine.css` (no build step, no dependencies; it also works from `file://`). The engine owns the canvas helpers, pixel font, cards, dithering, the Web Audio toolkit and shared instruments, the step scheduler, play/pause/mute, the main loop and the offline-render hooks. A scene only writes its physics, song, `hit()` table, instruments, scenes and `draw()`.

- `assets/scene-template.html` is a small complete scene (a pendulum) with every convention in place. Copy it to `site/<topic>/index.html` and replace its content.
- `site/frb/index.html` is the full-size reference: real physics, a real-speed teaching signal, a 32-bar drop in four parts.
- Read the top of `site/engine/engine.js` for the API; every export is commented there.

## Workflow

1. **Pin down the physics first.** Write the 2-5 numbers that define the phenomenon and the one-sentence truth the viewer should leave with. Put them in one constants object near the top, with `num('key', default, lo, hi)` URL overrides, and compute everything shown or heard from it. Expose the derived numbers in `window.__phys = () => ({...})` so they can be checked.
2. **Plan the song.** A `SONG` of sections `{ id, bars }`: a 2-bar title, 4-6 sections of 8 bars that each add one layer *and* one idea (name both in the banner, e.g. "LAYER 2: ROLLING BASS = SUNLIGHT"), a 4-bar build with a snare roll, riser and 3-2-1 countdown ending on a silent beat, a drop (usually 32 bars, 4 parts of 8) where everything plays, and a short outro. Pick a genre and BPM that suit the topic, and tie the key or tempo to the physics when you can (frb's whistle is the real dispersion curve; gravitational-waves is in the note the merged hole rings at). Keep one loop under 180 s so it can become a Short.
3. **Copy the template and fill it in**, top to bottom: config and physics, `SONG` + `Engine.clock`, the `hit(layer, s)` table (the single source of truth for what plays on each 16th; audio, HUD and visuals all read it), the palette, the bus graph in `buildGraph(ac, out)`, instruments, `voices(s, t)`, the actors and scenes, `draw(tau)`, `Engine.run({...})`.
4. **Make the icon** (see Icon).
5. **Add `scene.json`** next to `index.html` (`title`, a one-line `desc` of at most 120 characters, `order`, `listed`) and run `npm run index` so the scene appears on the index.
6. **Verify without ears** (see Verification), then tell the user plainly what you could and could not check.

## The engine, at a glance

```js
const { W, H } = Engine;                                  // 180 x 320
const { num, CALM, SHORT } = Engine.params;               // ?calm=1 no shake/flash, ?short=1 Shorts opening
const clock = Engine.clock(BPM, SONG);                    // STEP (a 16th), BAR, BEAT, LOOP, at(s), lb(lt), BAR_SEC
const { pulse, since, last, countdown, sequencer } = Engine.envelopes(hit, clock);
const P = { ...Engine.NEUTRALS, kick: '#ffd23f', kickD: '#5e4c10', ... };   // never redefine the neutrals
const { cx, text, card, ring, line, dot, fillCircle, ditherCircle, dEllipse, ditherFill, sun,
        banner, fact, timeline, withContext } = Engine.gfx(P);
const { mulberry, hash } = Engine.rand;  const { fmtNum, fmtBig, rough } = Engine.fmt;  const { clamp, smooth } = Engine.math;
const { ctx, midi, G, F, chain, pan, osc, env, play, noise, noiseSource, warm } = Engine.audio;  // osc(0.25, f, t) = 25% pulse
const riser = (t, dur, vol) => Engine.audio.riser(t, dur, vol, percIn);   // shared instruments take the scene's bus
Engine.run({ clock, buildGraph, voices, draw, title: sceneTitle, paused: P.kick, thumb });
```

## Look (what makes it read as Bit Forge)

- Canvas 180x320 (portrait, 9:16), scaled up crisp by `engine.css`. Draw with whole-pixel rects only: never antialiased strokes, `arc()`, or `fillText`.
- Colours: the shared neutrals (`Engine.NEUTRALS`: bg, grid, edge, dim, fg, shadow, white) plus one colour per instrument, with a dark (`D`) and light (`L`) shade. An instrument keeps its colour for the whole video, and the thing it stands for on screen wears the same colour; consistent colour is what lets the viewer follow without narration.
- One 3x5 bitmap font (`text()`), uppercase, integer scale 1-3. Text lives in bordered cards: `banner(title, sub, col)` at the top names the section and its layer, `fact(lines, border)` mid-screen carries the science (switch lines halfway through a section), `timeline(s)` says how time is shown ("REAL SPEED", "SCHEMATIC. SLOWED").
- The step-sequencer HUD sits at the bottom: `const hud = sequencer(ROWS)` with one row per layer in its colour, drawn every frame after the title.
- Glows and fades use ordered (Bayer 4x4) dithering, not alpha: `ditherCircle()` for halos, `ditherFill()` for the section fade-in and the drop's flashes. Screen shake on the drop's kicks, off under `CALM`.
- Labels follow the objects they describe and state values ("100 HZ"), not generic words.
- Keep every card inside 180px: `card()` warns in the console when one is too wide.

## Icon (pixel art, never an emoji)

Every scene gets its own icon, drawn in the same style as the scene. Do not use an emoji anywhere (index card, favicon, title).

1. Design a 16x16 sprite (24x24 if the subject needs detail) that shows the phenomenon's single most recognisable object (ring, siren, comet, eye), not a generic science symbol. Use only colours from the scene's palette, plus one dark outline colour, at most 5-6 colours total. Leave a 1px transparent margin and keep the silhouette readable at 16px.
2. Write it as a text grid in `scripts/icons/<topic>.txt`: a palette block, a blank line, then rows (`.` = transparent):

   ```
   a=#0b0d1a
   b=#ffd23f
   c=#5b6cff

   ......aaaa......
   ....aabbbbaa....
   ...
   ```

3. Convert it with `node <skill>/scripts/make-icon.mjs scripts/icons/<topic>.txt site/<topic>/icon.svg`. The output is a crisp-edged SVG, so it scales with no blur.
4. The template's `<head>` already links `icon.svg` as the favicon, and the index shows it on the scene's card.
5. Look at it: screenshot at 16px, 40px and 128px and check it still reads.

## Audio (all code-driven)

- **The teaching signal must be pure.** If the phenomenon depends on exact frequencies (beats, resonance, a chirp), generate them with plain oscillators routed straight to `out` (the master passed to `buildGraph`), never through the compressor or effects. frb's dispersion `sweep()` and gravitational-waves' chirp are examples.
- **The track** goes through the scene's buses: a compressor and a section gain (`secGain`, louder in the drop), one input per instrument family, optional echo/sidechain. Pulse waves come from `osc(0.125 | 0.25 | 0.5, f, t)`; the shared `metal`, `riser` and `impact` take the bus to play into. Keep notes clear of the teaching frequencies so they can't mask them.
- `voices(s, t)` schedules everything on step `s` from `hit()`. The engine runs it ahead of time, handles the start gesture, pause, mute, and the offline renders.
- Under `SHORT`, make step 0 hit (kick, crash, first chord) so a Short doesn't open on silence.
- Keep the mix out of clipping: per-bar peaks from `__render` around 0.5 in the sections and under ~0.85 in the drop.

## Sync and determinism

The engine calls `draw(tau)` with song time from the audio clock, so pictures stay locked to sound. `draw` and everything it calls must depend only on `tau`: no `performance.now()`, `Date.now()`, `Math.random()` or `ac` (use `Engine.rand.mulberry(seed)` / `hash(n)` for randomness). That is what makes `?t=<seconds>` screenshots and the scene-to-short video export reproducible. The title scene is the one exception: before the first tap the engine passes it wall-clock seconds so "TAP TO START" can blink.

## Display slow-down

Real frequencies are often far faster (or slower) than the eye can follow. Show them slowed or sped up, and say so on screen with `timeline()` ("SCHEMATIC: 1 KICK = 1 BURST. SLOWED"); use real speed where the real rate is visible or audible, and say that too ("REAL SPEED: LISTEN FOR THE WHISTLE"). The disclaimer is part of the style and keeps the science honest.

## Verification

1. Open the scene headless (Playwright: `import { chromium } from 'playwright-core'`, Chrome channel) and check there are no console errors, and that `window.__capture.frame(t)` draws every part of the loop without errors (step through `0..__capture.duration`).
2. Screenshot one frame per section (`__capture.frame(t)` then `canvas.toDataURL()`, or `?t=<seconds>`) and look at them: cards fit, pixels are crisp, nothing overlaps the HUD.
3. Audio can't be heard headlessly. Check the levels with `await __render(0, totalBars, 22050)` (per-bar peak and rms: no silent sections that should play, no clipping), and the maths with `__phys()` against hand calculations. Say clearly in the hand-off that listening was not verified.
4. When changing an existing scene without meaning to change its output, `npm run verify -- <scene>` compares frames and audio levels with the last commit.

## Hand-off

Tell the user: the folder (`index.html`, `icon.svg`, `scene.json`), how to run it (serve `site/` and click once; headphones if stereo matters), the URL params, what was verified and what was not, and one suggested next step (for example exporting it as a YouTube Short with `/scene-to-short <topic>`).
