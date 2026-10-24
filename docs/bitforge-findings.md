# Bit Forge: how the pixel-art science Shorts are probably made

Context for continuing this work in a new Claude session.

## Source
- Channel: https://www.youtube.com/@bitforge000/shorts
- Example studied: https://www.youtube.com/shorts/qdbEqKZrB0U
  ("Why Does a Passing Siren Drop in Pitch? The Doppler Effect")
- Only about 20 seconds of that one video were looked at. The channel page didn't load, so the other videos weren't checked.

## Conclusion
This is **not generative AI video** and probably **not hand-animated sprites** either.
It looks like a **game-engine / code renderer** drawing scenes from a structured
scene description that an AI writes. A human probably builds the engine and asset library once, and the LLM
writes a new scene file for each topic. That explains how often they post.

## Evidence from the video
- **Mathematically exact diagrams:** the sound-wave rings are perfect circles, squeezed in front
  of the moving ambulance and spread out behind it, matching the real physics. Image or video models can't do this.
  Code can.
- **Top-down tile map:** road, lane lines, buildings and trees on a grid, with small sprites
  (ambulance, cars, pedestrian) moving over it, like a 2D game.
- **Dithered lighting:** headlight cones and the siren halo use checkerboard dithering, which points to a
  retro shader or palette effect.
- **Template UI text:** one pixel font in bordered boxes. A title card
  ("A PASSING SIREN / DROPS PITCH"), a mode banner ("SCHEMATIC: SOUND SLOWED"),
  explanation cards ("IF IT STOOD STILL / EVEN RINGS / SAME PITCH ON BOTH SIDES",
  "NOW IT MOVES / SQUEEZED / SHORTER WAVES = HIGHER PITCH"), labels that follow the objects
  ("BEHIND", "AHEAD", "LONG", "SHORT"), and a disclaimer ("SIREN SPEED EXAGGERATED").
- **Built in stages:** real scene, then a schematic overlay, then a still-vs-moving comparison, then back to the
  scene. Every video likely follows the same set of scene "beats".
- **Music:** chiptune-style background music that is also AI or code-generated.

## Likely pipeline
1. **LLM writes a scene file (JSON-like):** setting, actors and their motion, overlays
   (rings, arrows, vectors, graphs), caption cards, narration text, and timing.
2. **Custom renderer:** for example Godot, Pygame, PICO-8-style code, HTML Canvas + Remotion, or Python
   writing frames to FFmpeg. It holds a reusable library of tilesets, sprites, physics-overlay
   primitives and caption-box templates. Sprites may be hand-made, from asset packs, or
   AI-generated and cleaned up once.
3. **Music:** Suno, Udio or ElevenLabs Music with a chiptune prompt, *or* chiptune generated in code
   (square/triangle/noise waves), which makes it easy to sync with scene cuts.
4. **Voice:** AI text-to-speech (for example ElevenLabs).
5. **Assembly:** FFmpeg puts video, voice and music together into a 1080×1920 vertical MP4.
6. **Optional:** automation (n8n, Make, or a script) plus a YouTube API upload.

## Proposed next step: a prototype
Build a small version of this pipeline:
- A renderer (Python + Pygame/Pillow, or HTML Canvas) that reads a JSON scene file.
- Features: tile background, moving sprites, animated wave rings, dithered glow,
  pixel-font caption boxes, and stage transitions.
- Render at low resolution (for example 180×320) and scale up with nearest-neighbor to 1080×1920.
- Chiptune music generated in code, then put together with FFmpeg into an MP4.
- First test scene: recreate the Doppler-effect video.
- Then have Claude write scene files for new topics (for example resonance, which the channel
  has also covered).
