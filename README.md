# Apple Inu: Bite Night

Top-down deterministic survival combat prototype: Apple Inu moves, an oversized sword auto-slashes from the mouth, zombies converge, and the bare combat loop must become fun before progression or Telegram systems are authorized.

## Phase
**Phase 1 — Combat Toy**

## Stack
- Phaser 3.90
- Vite 8
- TypeScript
- Vitest
- oxlint

## Run
```bash
corepack enable
pnpm install
pnpm dev
```

## Verify
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:determinism
```

## Controls
- WASD — move / face
- sword — automatic
- R — restart

## Current art
Programmer art is deliberate in Phase 1. Third-party asset packs are catalogued but not imported yet; see `licenses/ASSET_MANIFEST.json` and `docs/ASSET_PIPELINE.md`.

## Architecture invariant
Simulation is fixed-tick and seeded. Rendering/gore is presentation-only. That boundary is intended to support deterministic daily runs, replays, ghosts, and later score verification without making those systems Phase 1 dependencies.
