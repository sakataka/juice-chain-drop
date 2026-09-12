# HyperFrames Composition Project

## Skills

Use the existing composition and project scripts first. Read an available HyperFrames skill only when the requested change needs its framework-specific guidance. A missing skill does not authorize installing skills or packages; use existing documentation when sufficient, and install only when needed within the authorized scope.

## Commands

```bash
bun run preview             # preview in browser (studio editor)
bun run render              # render to MP4
bun run lint                # project lint with accepted warning filtered
bun run inspect             # check layout
bun run promo:update        # capture, validate, render, and export GIF
```

## Project Structure

- `index.html` — main composition (root timeline)
- `compositions/` — sub-compositions referenced via `data-composition-src`
- `assets/` — media files (video, audio, images)
- `meta.json` — project metadata (id, name)
- `transcript.json` — whisper word-level transcript (if generated)

## Validation by change

After creating or editing any `.html` composition, run the linter before considering the task complete:

```bash
bun run lint
```

Fix errors caused by the requested change before delivery. Reuse successful checks already run by `promo:update` on the same final inputs. For documentation or instructions only, verify wording, references, and the diff; do not render media or run game tests. For video-only changes, run the affected video checks; run root game build/tests only when game code or shared build inputs also change.

Use Bun to invoke the project scripts. Some existing script bodies still call npx; this guide does not require a new npx command or package installation. If changing those scripts, use the project’s installed tooling and Bun without introducing an unpinned download.

## Key Rules

1. Every timed element needs `data-start`, `data-duration`, and `data-track-index`
2. Visible timed elements **must** have `class="clip"` — the framework uses this for visibility control
3. GSAP timelines must be paused and registered on `window.__timelines`:
   ```js
   window.__timelines = window.__timelines || {};
   window.__timelines["composition-id"] = gsap.timeline({ paused: true });
   ```
4. Videos use `muted` with a separate `<audio>` element for the audio track
5. Sub-compositions use `data-composition-src="compositions/file.html"`
6. Only deterministic logic — no `Date.now()`, no `Math.random()`, no network fetches

## Documentation

Full docs: https://hyperframes.heygen.com/introduction

Machine-readable index for AI tools: https://hyperframes.heygen.com/llms.txt
