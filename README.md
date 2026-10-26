# 8-Bit Science

Pixel-art science explainers set to chiptune tracks that are synthesised in code. Each scene teaches one phenomenon as a song: every section adds one musical layer and one idea, a build counts down, and the drop puts it all together. Every number on screen and every teaching tone is computed from the real physics.

Live: https://nomorelives.github.io/ai-science-explanations/

## Run it locally

```bash
python3 -m http.server -d site 8000     # then open http://localhost:8000
```

The index links to scenes by folder (`frb/`), which needs a web server. A single scene also opens straight from disk: `site/frb/index.html`.

## Layout

```
site/                     everything that gets published
  index.html, view.html     the scene index, and the wrapper with the back button
  scenes.js                 the index's list, generated from each scene.json (npm run index)
  engine/engine.js, .css    the shared engine every scene runs on
  <scene>/index.html        one scene: physics, song, hit() table, instruments, visuals
  <scene>/icon.svg          its pixel-art icon
  <scene>/scene.json        its title, one-line description and place on the index
scripts/
  build-index.mjs           site/scenes.js from the scene.json files
  verify-scene.mjs          compares a scene with a git commit, frame by frame and bar by bar
  icons/<scene>.txt         icon sources (text pixel grids)
  publish.sh                push main and wait for the deploy
.claude/skills/
  pixel-science-explainer/  how to build a new scene (with a template)
  scene-to-short/           render a scene to a 1080x1920 YouTube Short
```

## The engine

`site/engine/engine.js` is a plain script (no build step, no modules, so scenes also work from `file://`). It gives each scene:

- **Clock:** `Engine.clock(BPM, SONG)` turns a list of song sections into steps, bars and loop length.
- **Drawing:** the 3x5 pixel font, caption cards (`banner`, `fact`, `timeline`), ordered-dither circles, rings, ellipses and fills, a star sprite, offscreen sprites (`withContext`).
- **Readouts:** `Engine.envelopes(hit, clock)` gives flash envelopes, the 3-2-1 countdown and the step-sequencer HUD, all read from the scene's `hit()` table.
- **Audio:** oscillators and pulse waves, filters, envelopes, noise, and shared instruments (808 metal, riser, sub impact).
- **Transport:** tap to start, space to pause, `m` to mute, the scheduler, the main loop, and the offline hooks (`__render` for audio levels, `__capture` for video export).

A scene supplies its physics, `SONG`, `hit(layer, step)` table, palette (on top of `Engine.NEUTRALS`), audio buses and instruments, scenes and `draw(tau)`, then calls `Engine.run({...})`. Every export is commented at the top of `engine.js`; `site/frb/index.html` is the full-size reference scene.

## URL parameters

Every scene understands `?bpm=` (within its range), `?calm=1` (no screen shake or flashes), `?short=1` (the Shorts opening that hits on the first frame) and `?t=<seconds>` (freeze the visuals at that time, for screenshots). Many add their own physics parameters, listed under each scene's canvas.

## Adding a scene

The easiest way is to ask Claude Code for one ("a pixel-art explainer of standing waves"); the `pixel-science-explainer` skill knows the format. By hand:

1. Copy `.claude/skills/pixel-science-explainer/assets/scene-template.html` to `site/<scene>/index.html` and replace its content.
2. Draw an icon as a text grid in `scripts/icons/<scene>.txt` and convert it:
   `node .claude/skills/pixel-science-explainer/scripts/make-icon.mjs scripts/icons/<scene>.txt site/<scene>/icon.svg`
3. Add `site/<scene>/scene.json`:
   ```json
   { "title": "Standing Waves: Chip Funk Mix", "desc": "One line for the index card, 120 characters at most.", "order": 120, "listed": true }
   ```
   `order` sets the position on the index (they go up in tens). `"listed": false` keeps a draft off the index.
4. `npm run index`

## Scripts

```bash
npm install                        # once: playwright-core (drives your installed Chrome)
npm run index                      # rebuild site/scenes.js after adding or editing a scene.json
npm run verify -- <scene>          # same frames and audio levels as the last commit? (--ref <commit> to compare elsewhere)
scripts/publish.sh                 # push main; the Pages workflow rebuilds the index and deploys site/
```

`verify` is for changes that shouldn't alter a scene (refactors, engine changes). It draws the scene every 0.37 s over the whole loop and renders its audio offline, with randomness seeded, in both the normal and `?short=1&calm=1` variants, and reports any difference.

To turn a scene into a YouTube Short, run `/scene-to-short <scene>` in Claude Code, or the renderer directly:
`node .claude/skills/scene-to-short/scripts/render.mjs <scene>` (writes `out/<scene>.mp4` and a thumbnail; one loop must be under 180 s).
