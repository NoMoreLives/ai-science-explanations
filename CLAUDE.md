# CLAUDE.md

Pixel-art science explainers with code-synthesised chiptune; see README.md for the layout and scripts.

## Rules

- **Scenes run on the shared engine** (`site/engine/engine.js`). Don't copy engine code into a scene; if several scenes need the same thing, add it to the engine. New scenes start from `.claude/skills/pixel-science-explainer/assets/scene-template.html` (the `pixel-science-explainer` skill has the full guide).
- **Physics first:** everything drawn or heard comes from the constants at the top of the scene, with `num()` URL overrides, and derived values exposed in `window.__phys`.
- **`hit(layer, step)` is the single source of truth** for what plays when; audio, the HUD and visuals all read it.
- **`draw(tau)` is pure in `tau`:** no `performance.now()`, `Date.now()`, `Math.random()` or `ac` inside it, or the video export and `?t=` screenshots stop being reproducible. Use `Engine.rand`.
- **Colours:** palettes spread `...Engine.NEUTRALS` and only add instrument colours. Don't give a scene its own background or text colours.
- **Refactors and engine changes must not change output:** run `npm run verify -- <scene>` on every affected scene (all of them for an engine change) and report the result. If a change is meant to alter visuals, show before/after screenshots and get approval.
- **Every scene folder needs** `index.html`, `icon.svg` and `scene.json` (desc at most 120 characters). Run `npm run index` after adding or editing a `scene.json`; the deploy also rebuilds it.
- **Keep a loop under 180 s** so the scene can be exported as a YouTube Short.
- **Scenes must work from `file://`:** classic scripts only (no ES modules, no fetch of local files).
- The user commits and publishes; don't commit or push unless asked.
