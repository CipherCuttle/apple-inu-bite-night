# TOWER_WARS_CORE_V0

Status: CLOSED / PASS

Base: `pivot/openrealm-wasm-spike-v0` @ `0d8d9368140f9242652ebf30cf1816b0fd12f647`

Closure candidate: `8effd0b7faa2f59cf5f36b06916a4d780233669d`

## Objective

Prove the first deterministic Tower-Wars gameplay loop on the browser OpenRealm port without widening scope into production multiplayer, persistence, progression, or copied Warcraft III content.

The player-facing loop is:

`build maze → path reroutes → send creeps → income grows → creeps leak or die → lives resolve → win/lose`

## Frozen V0 rules

- Local deterministic 1v1 only: one human seat and one deterministic bot seat.
- Both seats use the same authoritative action interface; the bot gets no privileged mutation path.
- Two build fields with explicit entrance and exit cells.
- Tower placement occupies grid cells and is rejected if it removes every legal entrance→exit route.
- Pathfinding is deterministic and has a stable tie-break rule.
- Exactly 3 initial tower archetypes.
- Exactly 4 initial creep-send archetypes.
- Gold is spendable immediately.
- Income is periodic and deterministic.
- Valid creep sends cost gold and increase future periodic income by a declared amount.
- A creep reaching the target exit leaks exactly once and removes lives exactly once.
- Lives reaching zero produces a terminal winner/loser state.
- All authoritative actions are recorded in a deterministic action log and produce a reproducible state hash.
- Browser V0 may continue using the OpenRealm in-process loopback server/client transport.
- Repository-owned/generated assets only. No Blizzard retail archives, maps, art, sound, names, or balance data are introduced.

## Non-goals

- Online networking or matchmaking.
- Accounts, persistence, progression, cosmetics, monetization, leaderboards.
- Audio-port repair.
- Browser save/load repair.
- Full WC3 map compatibility.
- Dog hero, stamina, dodge, weapon, or Phaser gameplay systems.
- More than the minimum 3 towers / 4 sends needed to prove the loop.

## Acceptance gates

### G1 — DETERMINISTIC_GRID_PATH_V0 — PASS

Given the same grid and placements, path resolution returns the same route byte-for-byte across repeated runs. A legal placement reroutes the path; a placement that blocks all routes is rejected without mutating authoritative state.

### G2 — AUTHORITATIVE_BUILD_V0 — PASS

Human and bot tower placements enter through the same validated action boundary. Successful builds debit gold exactly once and create the expected authoritative tower entity/state.

### G3 — AUTHORITATIVE_SEND_INCOME_V0 — PASS

A valid send debits gold exactly once, queues/spawns the declared creep, and increments the sender's future periodic income exactly once. Invalid sends are fail-closed and non-mutating.

### G4 — CREEP_ROUTE_LEAK_V0 — PASS

Creeps advance deterministically along the current legal route. A creep reaching the exit leaks once, decrements lives once, and is retired from simulation.

### G5 — TOWER_COMBAT_V0 — PASS

All 3 frozen tower archetypes acquire legal targets and apply deterministic damage/cadence semantics. A killed creep cannot subsequently leak.

### G6 — MATCH_TERMINATION_V0 — PASS

Lives reaching zero deterministically establishes exactly one winner and one loser and freezes further gameplay mutations except explicitly safe inspection/replay operations.

### G7 — REPLAY_HASH_V0 — PASS

Replaying the same ordered action log from the same seed produces the same authoritative state hash and terminal result. Divergence fails closed.

### G8 — BROWSER_VERTICAL_SLICE_V0 — PASS

The actual OpenRealm Wasm build boots in Chromium and visibly proves the loop through the Tower Wars C session compiled into the same Wasm module.

Closure evidence from the accepted browser run:

- OpenRealm SDL/WebGL2 remained live before and after the Tower Wars sequence.
- JS mutation ingress exposed the `TW_Browser*` session bridge; raw `tw_match_apply_action` was not exported.
- Human Needle build at `(4,3)` changed path length `9 → 11` and gold `500 → 450`.
- Rival Siege send changed rival gold `500 → 370` and income `10 → 23`.
- The authoritative Siege moved from `(0,3)+120` to `(0,2)+80` progress state.
- Periodic income paid at tick 20, taking rival gold to `393`.
- The Siege leaked at tick 85, reducing defender lives `20 → 17`, then retired.
- Replay verification reproduced state hash `023bd31afe3af1a5` and log hash `f1919327f09b401b` across 25 events.
- The rendered browser instrument occupied a real 1280×720 layout with nonzero board/tower/creep geometry; composited screenshot evidence measured ~76.9% non-dark and ~7.63% colorful pixels.
- G1–G7 core regression suite passed at the same G8 source head.

`TOWER_WARS_CORE_V0 = PASS`

## Final hostile review

Critical: 0

High: 0

Medium: 1 — the V0 Tower Wars presentation is a DOM instrument layer driven by the authoritative C session inside the same OpenRealm Wasm module. Tower Wars entities are not yet represented as native OpenRealm server entities rendered through the engine's normal 3D entity/snapshot presentation path. This does not invalidate G8, but it is the next integration boundary for the Hero Line Wars product phase.

## Completion policy

`IMPLEMENT → TEST → ONE independent hostile review → fix Critical/High → ONE targeted re-review only if Critical/High fixes were required → COMMIT → MOVE FORWARD`

Medium/Low findings do not restart the phase unless they invalidate a gate above, violate a frozen invariant, undermine evidence, or create a fail-open authority boundary.
