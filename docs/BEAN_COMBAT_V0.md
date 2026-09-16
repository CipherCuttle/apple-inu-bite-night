# Bean Combat V0 — Resurrection Receipt

## Intent

Resurrect the pre-Hero-Line-Wars top-down combat game and make Bean the player identity without importing tower-defense / Hero Line Wars gameplay into the fighter.

## Authority

Resurrection base:

`d3126dfbfb32aa09165b287710585db996d391fa`

Branch:

`resurrect/bean-combat-v0`

## Frozen gameplay boundary

`GameScene`, `GameState`, `Sword`, `Stamina`, `Dodge`, enemy simulation, fixed-tick timing, scoring, style, gore and determinism remain authoritative.

Bean V0 is presentation-only. It must not change combat geometry, damage, stamina costs, dodge invulnerability, enemy behavior, spawn logic, score, RNG or deterministic replay behavior.

## Bean presentation V0

`BeanGameScene` subclasses the preserved fighter scene, calls the original `create()`, then replaces only the visible player children while retaining the original player container used by simulation/render synchronization.

The owner-supplied visual reference defines the canonical direction: warm yellow/orange bean, thick near-black outline, tiny face, blue-and-white cap, oversized white `BEAN` shirt, blue accents, chunky low-resolution/Y2K web-game energy.

The runtime Bean is now generated entirely from local Phaser primitives and the inherited weapon asset. There is no X/PBS runtime dependency.

The inherited sword asset is intentionally retained for this first resurrection proof. Weapon redesign is a separate combat-feel/art experiment.

## Acceptance

- game boots into the old top-down fighter, not Hero Line Wars / tower defense;
- visible protagonist reads as Bean in the owner-approved cheap-web/Y2K aesthetic;
- WASD, aim, slash, dash, whirlwind, stab and dodge still operate through the inherited combat scene;
- existing test suite and determinism regression remain unchanged and pass;
- no tower-defense or HLW module becomes a dependency of this branch.

## Next evidence

Use `PROMPT_TO_PLAYABLE_V1.md` and the `bean-playtest` workflow to create short, isolated taste experiments. The human playtest verdict remains the authority on fun.
