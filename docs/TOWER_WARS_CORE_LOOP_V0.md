# TOWER_WARS_CORE_LOOP_V0

## Parent authority

- parent branch: `pivot/openrealm-wasm-spike-v0`
- parent SHA: `ffef4921710f09d3107c92b2a26d9ba18ec81ef2`
- parent verdict: `OPENREALM_WASM_SPIKE_V0 = PASS`
- evidence run: GitHub Actions `34283438831`

The OpenRealm browser port is therefore a frozen technical foundation for this phase. This phase does not merge or rewrite the older Phaser branches.

## Product objective

Build the first deterministic Tower Wars gameplay kernel before adding presentation polish.

The canonical loop is:

`BUILD MAZE -> SEND CREEPS -> INCOME GROWS -> PATH REROUTES -> TOWERS KILL OR CREEPS LEAK -> LIVES FALL -> WIN/LOSE`

This is an original Tower Wars implementation. No Blizzard maps, textures, audio, names, balance tables, or other retail Warcraft III content are required or admitted.

## Frozen invariants

1. Server/game state is authoritative; browser rendering never invents economy, path, damage, leaks, or winner state.
2. Simulation uses integer/fixed discrete state only. No wall-clock time or floating-point state enters the kernel.
3. Pathfinding has a fixed neighbor order and stable tie-breaking.
4. Tower placement is fail-closed: a placement is rejected if it blocks entrance-to-exit or strands any active creep already on that board.
5. Send costs and income deltas are data-driven and deterministic.
6. Target selection is deterministic: closest path distance to exit, then lowest creep id.
7. Identical initial state + identical action sequence must produce the same state hash.
8. Original/synthetic assets only for the public browser build.

## Phase gates

### Gate A — deterministic core

- two player boards
- 12x8 build grid
- entrance and exit remain connected
- three tower archetypes
- four creep send archetypes
- gold, periodic income, bounty, lives
- deterministic tower targeting and creep movement
- path-blocking placement rejection
- leak and winner semantics
- explicit state validator
- deterministic state hash / replay proof
- sanitizer-backed host tests

### Gate B — OpenRealm bridge

- repo-owned core is compiled into the pinned OpenRealm browser build
- `__tower_wars_v0__` starts through the existing local authoritative server/client loop
- board, towers and creeps are represented by original/synthetic renderer assets
- browser commands route through one game-authority action boundary

### Gate C — browser interaction proof

A headless Chromium test must prove, from actual user-facing actions:

1. place a legal tower
2. reject a path-blocking tower
3. send at least one creep
4. observe authoritative movement and rerouting
5. observe either a tower kill or a leak
6. observe economy/lives changing in the rendered UI
7. retain a stable WebGL2 context throughout

`TOWER_WARS_CORE_LOOP_V0 = PASS` requires Gates A-C.

## Non-goals

- no remote multiplayer transport
- no matchmaking/accounts/persistence
- no meta progression
- no dog hero combat/stamina/dodge
- no literal Wintermaul Wars map or copyrighted asset recreation
- no full WC3 compatibility work

## Completion policy

`IMPLEMENT -> TEST -> ONE independent hostile review -> fix Critical/High -> ONE targeted re-review only if needed -> COMMIT -> MOVE FORWARD.`
