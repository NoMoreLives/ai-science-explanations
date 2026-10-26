---
name: scene-to-short
disable-model-invocation: true
description: Render one of this repo's pixel-art scenes (site/<scene>/index.html) to an upload-ready YouTube Short, a 1080x1920 H.264/AAC MP4 with the scene's synthesised audio in sync, a Shorts opening that hits from frame one, and a 1080x1920 thumbnail PNG. Use this whenever the user wants to turn a scene, explainer, animation or "the black hole one" into a video, MP4, Short, Reel or TikTok, export or record a scene, or get something they can upload to YouTube, even if they don't say "render" or name the file.
---

# Scene → YouTube Short

Each scene (`site/<name>/index.html`, on the shared engine in `site/engine/`) draws a 180×320 canvas from one clock (`tau`, seconds) and synthesises its music in Web Audio on that same clock. Rather than screen-record it (dropped frames, audio drift, browser chrome), render it **offline and deterministically**: draw every frame at an exact `tau`, render the audio with an `OfflineAudioContext`, and let ffmpeg combine the two. The scene exposes that as `window.__capture`, which `Engine.run()` sets up for every engine scene, and the bundled `scripts/render.mjs` does the rest.

A Short also has a job the website version doesn't: it has to stop a thumb mid-scroll. The scenes open gently (a title card, a fade-in, near-silence) because on the site someone has already chosen to press play. So the video gets a **Shorts opening**, behind `?short=1`, which the renderer passes by default.

## Workflow

1. **Find the scene.** When called as `/scene-to-short <name>`, the argument is the scene (any extra words are options, like a thumbnail time or `bpm=`). With no argument, list the folders in `site/` and ask which one. Scenes live in `site/<name>/index.html`. Match loose names ("the sun one" could be `sun-lifecycle` or `sun-lifecycle-2`; ask if it's really ambiguous).
2. **Check what's already there:** `grep -n "Engine.run\|__capture\|SHORT" site/<name>/index.html`. A scene that calls `Engine.run` already has the capture hook (its `thumb:` option sets the default thumbnail time), so skip step 3.
3. **Add the capture hook** only if the scene isn't on the engine (below).
4. **Add the Shorts opening** (below). The audio hit always goes in. The title is the user's call: ask them before rendering.
5. **Check the opening before the full render.** It's cheap: `--thumb 0.5 --thumb-only` and `--thumb 2 --thumb-only` each write one frame in a few seconds. Look at them. Then render the thumbnail you actually want (see "Thumbnail").
6. **Render** from the repo root:
   ```bash
   (cd .claude/skills/scene-to-short/scripts && [ -d node_modules ] || npm install --silent)
   node .claude/skills/scene-to-short/scripts/render.mjs <name> [--thumb SEC] [--query "bpm=150&calm=1"] [--fps 30]
   ```
   It writes `out/<name>.mp4` and `out/<name>-thumb.png`, then prints PASS/FAIL checks: size, codecs, duration matching the loop, ≤180s, and audio not silent. Budget roughly 15–30 s of rendering per minute of video on an idle machine. Busy scenes or a loaded CPU can take several times that, so use a long timeout (10 min+) and don't run several renders at once. Playwright drives the installed Google Chrome, so there's no browser download.
7. **Look at the result.** Pull 3–4 frames, including the first second and the busiest section (`ffmpeg -ss <sec> -i out/<name>.mp4 -frames:v 1 -vf scale=360:640 /tmp/f.png`), and view them with the thumbnail. You're checking that the hook headline shows, captions are present, there's no "TAP TO START" or "PAUSED", and it's the right scene. The PASS lines can't see any of that.
8. **Report** the MP4 and thumbnail paths, the duration, any WARN lines, which title the video opens on, and a short note on what changed in the scene.

## The capture hook (scenes not on the engine)

Every scene in `site/` currently runs on the engine, which provides this hook through `Engine.run({ draw, thumb, ... })`. The engine's `draw(tau)` contract is the same as below: pure in `tau`, no wall clock. The rest of this section is for a scene written without the engine.

```js
window.__capture = {
  duration: LOOP,               // seconds in one loop; the video is exactly this long
  thumb: 4.5 * PHASE_S,         // optional: a strong moment for the thumbnail
  frame: tau => draw(tau, true),
  async audio(sr = 48000) { /* OfflineAudioContext render of 0..duration */ return { sampleRate: sr, L, R }; },
};
```

`references/hook-examples.md` has two complete, tested diffs: a phase-based scene with a Shorts opening, and a SONG-section scene with a mixer graph. Read the one that matches the scene's structure. In outline:

- **`frame(tau)`**: split the scene's `frame()` into the requestAnimationFrame shell (works out `tau` from `ac.currentTime`, draws PAUSED, reschedules) and a pure `draw(tau, started)`. Pass `started = true` so the video shows the playing scene, not the "TAP TO START" card.
- **Nothing reachable from `draw` may read the wall clock or `ac`.** Grep for `performance.now()` and `Date.now()`: title cards often blink on them even while playing, which makes the video's first seconds differ on every render. Switch them to the scene time `t`.
- **`audio(sr)`**: swap the global `ac` for `new OfflineAudioContext(2, Math.round(duration * sr), sr)`, rebuild the same node graph (factor the setup out of `startAudio()` into `buildGraph()` if needed), set the master gain straight to the live level (no fade-in), and schedule **every** event up front from 0. Usually that means `for (s = 0; s * STEP < duration; s++) playStep(s, s * STEP)`, plus anything the live scheduler or `frame()` fires (phase-change blips, drones started at `T0`). Restore `ac` and return both channels. Keep stereo panners.
- **Leave the live scene untouched:** click or space to play, `m` to mute, `?t=`, `?bpm=` and other params all keep working. The hook only adds a path.

## The Shorts opening (`?short=1`)

Viewers decide in about a second whether to swipe. Under `const SHORT = q.get('short') === '1'`, change only the first bar or two:

- **Sound (always):** make step 0 hit, with a kick, a crash or noise burst, and the first chord or bass note, instead of a fade or hiss build. If the track has a quiet intro, the first frame still needs a hit. This is the part of the opening that reliably works, so do it without asking.
- **Title (ask first):** the opening title is the creator's voice, and taste here varies scene by scene. In testing, the user kept one scene's original title and preferred a rewrite on another. So don't choose for them. Before rendering, look at the scene's current opening (`--thumb 0.5 --thumb-only --no-short`) and offer a choice: **keep the original title card**, or one of 2–3 hook headlines you suggest. Use AskUserQuestion if you have it, otherwise ask in chat and wait. Mark "keep original" as the default if the existing title is already big and bold. Then build whichever they pick.
  - What made a suggestion land: **two short lines, big (scale 3)**, a promise or stakes in plain words, e.g. "YOUR SUN / WILL DIE". A smaller line under it can name the payoff ("ITS WHOLE LIFE AS / ONE HARDCORE TRACK", "WAIT FOR THE DROP"), with the subject visible between the cards.
  - What didn't: cramming a third line of numbers ("…IN 93 SECONDS", "10 SUNS / CRUSHED INTO / 59 KM"), and anything literally false. Use the scene's own facts.
  - If the user says "just render it" or isn't around to ask, keep the original title and list your suggestions in the report.
- **Safe zone:** keep the headline and important text out of the bottom ~20% of the frame (y > ~255 on the 180×320 canvas), where YouTube draws the caption, channel name and buttons. Also stay clear of the right-hand edge in the lower half. Existing HUDs down there (step sequencers) are fine as decoration, but mention in the report that they'll be partly covered.
- After the opening, the scene plays as normal. Don't restructure the rest of the video.

## Thumbnail

- `--thumb SEC` picks the moment; otherwise it uses `__capture.thumb`, or 40% of the way in. Choose a frame with the subject big and a caption showing, often the climax or drop. **Avoid beat flashes and shake**: many scenes flash or dither the screen on each kick, so pick a time between kicks (e.g. a few 16th-note steps after the beat) and look at it.
- `--thumb-only` re-renders just the PNG in seconds, so a thumbnail change never needs a full re-render.
- On YouTube, Shorts thumbnails are picked from a frame of the video in the mobile app; the PNG is for platforms or posts that take an image. Mention the timestamp so they can find that frame.

## Other options and output

- `--query` passes URL params (e.g. `calm=1` turns off flashes and shake; `bpm=` changes length for tempo-driven scenes). `--no-short` renders the website version without the Shorts opening.
- Video is scaled ×6 with nearest-neighbour (crisp square pixels; ×6 also lines up with 4:2:0 chroma blocks, so colour edges stay clean) and encoded H.264 CRF 16 yuv420p with faststart, AAC 192k 48 kHz.
- Length is one full loop. A Short can be up to 3 minutes; the script refuses anything longer. Over 60s gives a WARN: still valid, but say so in the report, and mention that a higher `bpm` or a section trim would shorten it.
- `out/` is gitignored. Don't commit renders. The scene edits (hook and short mode) are meant to be committed.

## When something fails

- `no window.__capture hook`: go back to step 3.
- `audio is not silent` FAIL: the offline graph isn't connected, or the master gain was left at the fade-in floor (0.0001).
- Duration mismatch: `duration` doesn't match the sample length you allocated in `audio()`.
- `page errors on load`: your edit broke the script. The renderer prints the error, so fix it before anything else.
- A frame that's blank or shows the title card: `draw` still reads `ac`, or `started` isn't passed through.
