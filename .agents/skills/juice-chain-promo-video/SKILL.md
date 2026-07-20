---
name: juice-chain-promo-video
description: Update or recreate the Juice Chain Drop promotional video when the game UI, features, rules, README GIF preview, screenshots, HyperFrames composition, or MP4 artifact need to reflect the current product. Use for requests like "今の機能に合わせて動画を作って", "紹介動画を更新して", "README用のGIFを作って", or "ゲーム画面を撮って動画を書き出して".
---

# Juice Chain Drop Promo Video

Use this skill to keep the repository's short promo video aligned with the current game.

## Source locations

- Game README: `README.md`
- Game app: `src/`, `index.html`
- Video project: `video/`
- HyperFrames composition: `video/index.html`
- Design guide: `video/DESIGN.md`
- Screenshot assets: `video/assets/screenshots/`
- Output MP4: `video/output/fruit-puzzle-promo.mp4` (local generated artifact, ignored by Git)
- Local GIF preview: `video/output/fruit-puzzle-promo.gif` (local generated artifact, ignored by Git)

## Workflow

1. Read `README.md`, recent relevant source changes, and `video/README.md` to understand the current product pitch.
2. If game visuals or features changed, update the storyboard/copy inside `video/index.html`; keep the video around 15 seconds unless the user asks otherwise.
3. Keep the game screen prominent. Use short Japanese captions and avoid long technical explanations.
4. Run the standard update pipeline:

```bash
cd video
bun run promo:update
```

This starts the game server, captures screenshots, runs filtered HyperFrames lint, runs layout inspect, renders the MP4, and exports the README GIF preview.

If screenshots are already current:

```bash
cd video
bun run promo:update:no-capture
```

5. Also run repository checks from the root:

```bash
bun run build
bun run test
```

6. Treat screenshots, MP4, and GIF files as local generated artifacts. Do not stage or embed them in GitHub-facing documentation.

## Accepted warning

`composition_file_too_large` is intentionally ignored for the current one-file promo composition. Use `bun run lint:raw` only when you need to inspect the original HyperFrames output.

## Completion checklist

- `video/output/fruit-puzzle-promo.mp4` was rendered locally and is about 15 seconds unless otherwise requested, but remains ignored by Git.
- `video/output/fruit-puzzle-promo.gif` exists for local preview when generation was requested, but remains ignored by Git.
- `bun run lint` in `video/` reports zero warnings after filtering.
- `bun run inspect` in `video/` reports zero layout issues.
- `bun run build` and `bun run test` pass at repository root.
- Final response includes output path, commands, and any remaining limitations.
