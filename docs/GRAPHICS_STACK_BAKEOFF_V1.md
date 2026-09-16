# Graphics Stack Bake-Off V1

## Objective

Choose the permanent graphics/chaos foundation before building the over-the-top zombie-survival effects layer.

This is a presentation/physics experiment only. It does **not** authorize changes to combat damage, hit geometry, stamina, dodge, enemy authority, RNG, fixed-tick simulation, scoring, or replay semantics.

## Frozen comparison

All modes render the same room, authored Bean asset, sword asset, zombie asset, and **120 zombies**.

### A — Raw Pixi

Purpose: establish the renderer baseline.

- PixiJS 8 only;
- authored sprites;
- no blood field;
- no particle burst;
- no dynamic composite lighting;
- no Rapier debris.

### B — Pixi Max FX

Purpose: measure the value of a deliberately excessive presentation layer before adding another simulation/runtime.

Adds:

- persistent world blood decals;
- 1,800 pooled presentation particles;
- layered ambient glow;
- contact shadows;
- grime;
- scanline treatment;
- screen flash;
- camera impulse;
- repeated automated blasts in CI capture.

### C — Pixi Max FX + Light + Rapier

Purpose: test the intended 2.5D graphics/chaos architecture.

Adds on top of B:

- composited dynamic emergency/player/blast light layers;
- `@dimforge/rapier2d-compat` for chaos-object physics only;
- 42 physical debris bodies with collision, damping, restitution, torque and blast impulses.

Rapier is **not** combat authority in this experiment.

## Why normal maps are not in V1

C proves the render-composite and physics architecture first. If C wins the human visual/performance gate, the next binding phase may add authored normal maps + custom Pixi shader lighting. We do not add that complexity before the stack itself proves useful.

## Human decision rule

Choose one:

- `A WINS — KEEP PIXI SIMPLE`
- `B WINS — MAX FX WITHOUT RAPIER`
- `C WINS — FREEZE PIXI + FX + LIGHT + RAPIER`
- `NONE — REDESIGN THE GRAPHICS STACK`

CI success does not choose a winner.

## Performance rule

The lab exposes rolling frame metrics in the top-right HUD. Treat CI screenshots as comparative evidence only because GitHub-hosted runners are not a substitute for the target machine/browser.

The permanent stack must preserve graceful degradation: presentation effects may drop quality or count before simulation authority is allowed to miss ticks.
