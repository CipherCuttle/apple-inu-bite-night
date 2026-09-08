# HERO_WEAPON_ABILITY_KERNEL_V0

## Objective

Stop encoding Apple Inu as synonymous with the global player implementation and introduce the smallest deterministic buildcraft kernel needed before stamina/dodge, shop, level-pipeline, fortress, backend, or Telegram work.

## Bounded content

Hero:
- APPLE INU

Weapons:
- MOUTHBLADE
- GREATSWORD
- SPEAR

Abilities:
- BARK BLAST
- ZOOMIES
- VAMPIRIC BITE

`VAMPIRIC BITE` fills the previously-TBD third V0 ability slot using an ability already named in the architecture handoff. Its tuning values are provisional.

## Architecture

- `HeroDefinition` / `HERO_REGISTRY`
- `WeaponDefinition` / `WEAPON_REGISTRY`
- `AbilityDefinition` / `ABILITY_REGISTRY`
- `Loadout`
- `Stamina` state/profile contract

The ability layer uses a small effect vocabulary rather than one bespoke engine per ability.

## Compatibility invariant

The default APPLE INU + MOUTHBLADE loadout must preserve the pre-kernel melee geometry and timings exactly. Alternative weapon families may change authoritative combat behavior by explicit loadout selection, but the same seed + same loadout + same inputs must remain deterministic.

## Acceptance

PASS only if:

1. Apple Inu exists as a first-class hero definition.
2. Mouthblade, Greatsword, and Spear exist as data definitions.
3. Greatsword and Spear differ by geometry/timing/commitment, not only damage numbers.
4. Bark Blast, Zoomies, and Vampiric Bite compose from the shared effect vocabulary.
5. A validated `Loadout` selects hero + weapon + two swappable skills while hero signature ability remains fixed.
6. A stamina contract exists but attack stamina consumption/dodge is deferred to `SOULSLIKE_STAMINA_DODGE_V0`.
7. `GameState` accepts an explicit loadout and routes weapon attacks through the weapon registry.
8. Default Mouthblade behavior remains backward-compatible.
9. Determinism includes loadout identity.
10. Full repository CI passes.

## Explicitly out of scope

- stamina consumption/regeneration gameplay
- dodge / i-frames
- shop / BONES purchase flow
- weapon art runtime execution
- ability runtime execution
- new weapon art assets
- new level/Tiled pipeline
- fortress/siege
- backend
- Telegram integration

This phase is a kernel, not a content explosion.
