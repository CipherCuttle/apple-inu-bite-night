# Pixi Bean Visual Spike V0

## Objective

Test whether a renderer/art-pipeline change can materially improve the fighter's visual quality without touching the deterministic combat authority.

This is a disposable experiment, not a migration authorization.

## Base

Branch: `spike/pixi-bean-visual-v0`

Base commit: `f40af40c637aef0ef5afd354a051bdcc98ea1bda`

The existing Phaser fighter remains the baseline and is not replaced on this branch.

## Human reference correction

The supplied Bean reference is a **purple meme-bean sticker aesthetic**: rounded purple body, huge googly eyes, expressive reaction variants, slightly cheap/low-fi web compositing, and cursed internet-sticker energy.

Do not reinterpret Bean as a polished yellow/orange mascot, generic fantasy character, or glossy mobile-game hero.

## Experiment

The build contains two pages:

- `/` — current Phaser baseline;
- `/pixi-spike.html` — PixiJS 8 visual spike.

The Pixi page intentionally focuses on rendering proof:

- authored local Bean SVG instead of Phaser primitive anatomy;
- layered room composition instead of debug rectangles;
- contact shadows, decals, ambient color pools and depth sorting;
- attack arc, blood burst, camera impulse and animated props/enemies;
- cursed old-web HUD treatment;
- WASD + mouse + LMB for a tiny interactive visual slice.

The spike currently loads PixiJS from a pinned CDN module to avoid contaminating the package/lockfile before the renderer earns migration authority. If the bake-off passes, the next step is to vendor Pixi as a normal project dependency and bind it to the real `GameState` rather than the isolated visual mock.

## Frozen boundary

Do not modify combat geometry, damage, stamina, dodge, enemy simulation, score, RNG, fixed-tick behavior, or determinism to make the Pixi version look better.

## Acceptance

The spike passes only if the human comparison produces an immediate visual preference for Pixi large enough to justify migration work.

If the visual improvement is marginal, kill the spike and improve the Phaser asset pipeline instead.
