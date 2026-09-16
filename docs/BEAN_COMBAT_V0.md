# Bean Combat V0 — Resurrection Receipt

## Intent

Resurrect the pre-Hero-Line-Wars top-down combat game and make `@BeanOnInk` the player identity without importing tower-defense / Hero Line Wars gameplay into the fighter.

## Authority

Resurrection base:

`d3126dfbfb32aa09165b287710585db996d391fa`

Branch:

`resurrect/bean-combat-v0`

## Frozen gameplay boundary

`GameScene`, `GameState`, `Sword`, `Stamina`, `Dodge`, enemy simulation, fixed-tick timing, scoring, style, gore and determinism remain authoritative.

Bean V0 is presentation-only. It must not change combat geometry, damage, stamina costs, dodge invulnerability, enemy behavior, spawn logic, score, RNG or deterministic replay behavior.

## Bean presentation V0

`BeanGameScene` subclasses the preserved fighter scene, calls the original `create()`, then replaces only the visible Apple Inu player children while retaining the original player container used by simulation/render synchronization.

The current `@BeanOnInk` X avatar is loaded from the public profile CDN as the temporary canonical visual reference:

`https://x.com/BeanOnInk`

A simple local vector Bean fallback is rendered if the remote avatar fails to load, so CDN/network failure does not block gameplay.

The inherited sword asset is intentionally retained for this first resurrection proof. Weapon redesign is a separate art/combat-feel decision and is not bundled into the identity swap.

## Known debt

The X/PBS avatar is a runtime network dependency. This is acceptable only for the resurrection proof. The next art pass should vendor approved full-body Bean artwork into `public/assets/characters/bean-on-ink/` and remove the external dependency.

## Acceptance

- game boots into the old top-down fighter, not Hero Line Wars / tower defense;
- the visible protagonist is BeanOnInk (or the Bean fallback if the CDN is unavailable);
- WASD, aim, slash, dash, whirlwind, stab and dodge still operate through the inherited combat scene;
- the existing test suite and determinism regression remain unchanged and pass;
- no tower-defense or HLW module becomes a dependency of this branch.
