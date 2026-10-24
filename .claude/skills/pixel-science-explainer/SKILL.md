---
name: pixel-science-explainer
description: Build a single-file HTML pixel-art science explainer in the "Bit Forge" style (low-res canvas scaled with nearest-neighbor, 3x5 pixel font, bordered caption cards, dithered glow, staged scenes) with all audio synthesised in code (Web Audio sines plus a chiptune square/triangle/noise loop). Use this whenever the user wants a retro / 8-bit / pixel-art / chiptune animation, short, or interactive demo that explains a physics, acoustics, biology or other science phenomenon (Doppler effect, resonance, binaural beats, beats, standing waves, etc.), or says "recreate X in the Bit Forge style" or "pixel art version of X", even if they don't mention HTML or Web Audio.
---

# Pixel-art science explainer

Produces one self-contained `index.html` (no build step, no dependencies) that teaches one phenomenon through a short looping sequence of pixel-art scenes. The look comes from the Bit Forge Shorts: the diagrams are drawn by code, so the physics is exactly right (rings really squeeze, waves really have the stated frequency). That exactness is the point, so derive every drawn quantity from the same constants that drive the audio rather than hand-tuning pictures.

`assets/binaural-example.html` is a complete working example (100 Hz / 105 Hz binaural beats). Copy it as the starting point and replace the scenes and audio; its helpers are the reusable engine.

## Workflow

1. **Pin down the physics first.** Write down the 2-4 numbers that define the phenomenon (e.g. f_left, f_right, beat = |f_r - f_l|) and the one-sentence truth the viewer should leave with. Put them in a `CONFIG` block and read optional overrides from `URLSearchParams`, so the demo is adjustable and the visuals and audio can never disagree.
2. **Plan 4-6 beats** (about 30-40 s, looping), following the channel's staging: title card, real scene, schematic overlay (banner "SCHEMATIC: ... SLOWED" when time is dilated), a comparison or still-vs-moving contrast, back to the real scene or a summary, and an outro with a disclaimer for anything exaggerated.
3. **Copy the example and swap the scenes.** Keep the engine sections (`gfx` helpers, audio scheduler, main loop); rewrite `SCENES`, `DUR`, and the audio generators.
4. **Verify without ears** (see Verification), then tell the user plainly what you could and could not check.

## Look (what makes it read as Bit Forge)

- Canvas 180x320 (portrait, 9:16), CSS `image-rendering: pixelated`, scaled up with whole-pixel rects only. Never use antialiased strokes, `arc()`, or text via `fillText`; draw pixels (`fillRect`) so edges stay crisp.
- A fixed palette of about 8-12 colours declared once. Give each actor/quantity one colour and keep it for the whole video (e.g. left = cyan, right = orange, sum = yellow); consistent colour is what lets the viewer follow the explanation without narration.
- One 3x5 bitmap font (`text()`), uppercase, with integer scale 1-3. Text lives in bordered boxes (`card()`) with a 2px offset shadow; a banner card at the top names the mode ("SCHEMATIC: ...", "REAL SPEED").
- Glows and fades use ordered (Bayer 4x4) dithering, not alpha: `ditherCircle()` for halos and a pattern-fill wipe between scenes.
- Labels should follow the objects they describe and state values ("100 HZ"), not generic words.
- Keep every text box inside 180px; check by measuring with `textW()` rather than guessing.

## Audio (all code-driven)

- **The teaching signal must be pure.** If the phenomenon depends on exact frequencies (binaural beats, beating, resonance), generate them with plain `OscillatorNode`s routed straight to the master gain (hard-panned via `StereoPannerNode` when stereo matters), and never through the chiptune effects. Start them at the same `T0` as the visual clock.
- **Chiptune bed** on a separate bus at low gain, centre-panned: pulse waves (12.5/25/50% duty via `createPeriodicWave`), a triangle bass, noise for hats/snare, scheduled with a lookahead timer (`setInterval` ~40 ms, schedule ~150 ms ahead). Keep its notes clear of the teaching frequencies so it cannot mask them: for low-frequency demos, keep every note above ~2x the highest tone.
- Short square blips on scene transitions, fired from the same timeline as the visuals.
- Browsers block audio until a gesture: create the `AudioContext` inside a click/space handler, show "TAP TO START", fade the master in, and support pause (`suspend`) and mute (M).

## Sync

Drive visuals from `audioContext.currentTime - T0` (minus `outputLatency`), not from `requestAnimationFrame` timestamps, so pictures stay locked to sound across pauses and tab throttling. Before audio starts, show scene 0, with a `?t=<seconds>` debug param that freezes the visuals at a given time (used for screenshots).

## Display slow-down

Real frequencies (100 Hz) are far faster than the eye can follow. Draw waves with a `SLOW` factor, label the scene "SLOWED", and use real speed only where the real rate is visible (e.g. a 5 Hz pulse). Always say so on screen ("WAVES SLOWED FOR DISPLAY"); the disclaimer is part of the style and keeps the science honest.

## Verification

1. Run `node --check` on the extracted script, or just open it headless and look for console errors.
2. Screenshot each scene with headless Chrome using `?t=` values (`--headless=new --window-size=360,640 --screenshot=...`) and look at them: text fits in boxes, pixels are crisp, nothing overlaps.
3. Audio cannot be heard headlessly. Check the maths instead: confirm the oscillator frequencies equal the config values and that displayed derived numbers (beat, wavelength, ratio) are computed from them. Say clearly in the hand-off that listening was not verified.

## Hand-off

Tell the user: the file path, how to run it (click once; headphones if stereo matters), the URL params, what was verified and what was not, and one suggested next step (more topics; JSON scene files and an FFmpeg MP4 export, as in `docs/bitforge-findings.md` if that file exists).
