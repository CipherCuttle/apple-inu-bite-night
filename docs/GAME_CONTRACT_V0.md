# Game Contract v0 — Phase 1 Combat Toy

## Objective
Prove the core toy before progression, backend, Telegram, or final art.

## Frozen semantics
- Player controls movement only.
- Facing follows movement direction.
- Sword auto-attacks on a fixed tick cadence.
- Sword damage is an analytical arc/sector test; no rigid-body sword physics.
- Zombies chase the player with simple deterministic steering.
- Kills are counted; elapsed simulation ticks are the primary survival measure.
- Contact damage can kill the player; death ends the run.
- `R` restarts immediately.
- Simulation runs at a fixed 60 Hz and all authoritative randomness comes from the seeded PRNG.
- Presentation effects may not alter simulation state.

## Explicitly out of scope
- Telegram SDK
- Neon/database
- wallet/token functionality
- upgrades/progression
- bosses
- final Apple Inu art
- imported third-party binaries
- leaderboards/replays/ghosts

## Phase 1 kill gate
Do not authorize progression if repeated internal playtests do not make the bare sword+horde loop worth replaying.
