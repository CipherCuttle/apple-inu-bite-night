# SOULSLIKE_STAMINA_DODGE_V0

## Objective

Turn the Phase-2 stamina contract into real deterministic resource pressure and add a committed dodge with a bounded invulnerability window, without starting shop, ability-runtime, level-pipeline, fortress, backend, or Telegram work.

## Semantics

- weapon attacks spend the selected attack definition's `staminaCost`
- unaffordable attacks fail closed and emit no attack
- stamina regeneration is delayed after every successful spend
- dodge is a distinct buffered action
- dodge cannot cancel an active weapon cooldown
- dodge has finite travel plus vulnerable recovery
- invulnerability covers only a strict subset of the dodge commitment
- dodge movement remains collision-bound by maze and props
- stamina and dodge state are included in deterministic hashing

## Apple Inu V0 dodge

- cost: 24 stamina
- distance: 78 units
- travel: 8 ticks
- recovery: 4 ticks
- i-frames: commitment ticks 1–6 only

These values are tuning inputs, not permanent balance authority.

## Acceptance

PASS only if:

1. successful attacks spend weapon-defined stamina
2. insufficient stamina blocks attack execution without going negative
3. regeneration begins only after the configured delay
4. dodge spends stamina and moves along deterministic input direction
5. dodge cannot cancel an active attack cooldown
6. dodge collision respects world geometry
7. i-frames end before dodge recovery ends
8. same seed + same loadout + same inputs remains deterministic
9. HUD exposes current stamina and dodge state
10. full repository CI passes

## Explicitly deferred

- ability stamina execution
- weapon windup/active/recovery animation-state enforcement beyond existing cooldown commitment
- parry/block
- equipment load / roll classes
- shop / BONES economy
- fortress / siege
- backend
- Telegram integration
