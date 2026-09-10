# Hero Line Wars on OpenRealm

This repository is now building an original deterministic Hero Line Wars / Line Tower Wars-style browser game on a pinned WebAssembly port of OpenRealm.

The old Apple Inu Phaser survival prototype is closed and is not current implementation authority.

## Current phase

**HERO_LINE_WARS_PLAYABLE_V1 — P1 MATCH_CONTROL_LOOP_V1**

Authority contract: `docs/HERO_LINE_WARS_PLAYABLE_V1.md`

Closed predecessor: `docs/HERO_LINE_WARS_NATIVE_V0.md` — H1 through H8 PASS.

## Core loop

`move hero → defend lane → attack/cast → earn gold + XP → send pressure → gain income → survive leaks → reach terminal result`

## Architecture invariants

- `tw_session_*` is the authoritative deterministic economy/send/combat/outcome/replay boundary.
- OpenRealm native entities provide the proven hero/native presentation path without becoming a second simulation authority.
- Human and deterministic bot use the same actor-indexed public movement, attack, PHASE LANCE and send boundaries.
- Browser UI may schedule commands and display authoritative state; it may not manufacture damage, HP, rewards, XP, cooldowns, costs, income, lives, leaks, retirement or terminal outcomes.
- Same seed + same accepted ordered command log must replay exactly.
- No Blizzard retail content.

## Engine / browser toolchain

- OpenRealm pinned commit: `cf12357883950c14abce8d636596952c3fc547bb`
- Emscripten: `6.0.9`
- Browser proof: Chromium / Puppeteer
- Renderer: SDL2 + WebGL2 / OpenGL ES 3

## Governance

Use `PLAN → CHANGESET → VERIFY → VERDICT` and the bounded completion policy recorded in the active phase contract. Do not reopen closed H1-H8 work unless a frozen invariant is falsified. Do not merge without explicit merge authority.
