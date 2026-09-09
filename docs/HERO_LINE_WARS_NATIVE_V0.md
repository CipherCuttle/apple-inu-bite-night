# HERO_LINE_WARS_NATIVE_V0

Status: PREREGISTERED / NOT YET IMPLEMENTED

Parent: `pivot/tower-wars-core-v0` closure lineage through `5c778c1c7151581a5863f6c269f505b0bd41f5e6`

## Product objective

Turn the closed deterministic Tower Wars core into the first actual Hero-Line-Wars-style game slice on OpenRealm.

The primary player loop for this phase is:

`control hero → defend your lane → kill incoming creeps → earn combat gold/XP → spend gold on sends → sends increase income → pressure rival lane → leaks cost lives → level hero → repeat`

The previous tower/path kernel is retained as tested infrastructure and optional future mode material, but towers are **not** the primary defense mechanic in this phase.

## Frozen V0 rules

- Local deterministic 1v1: one human hero and one deterministic bot hero.
- The authoritative `tw_session_*` event/replay boundary remains the only product mutation authority for economy/send/match state.
- Hero/creep presentation and combat entities must exist through OpenRealm's native game/server entity path; the browser DOM may display HUD/control surfaces but may not fabricate hero/creep world state.
- Exactly one hero archetype per seat for V0; use original names/visuals and repository-owned/generated assets only.
- Human hero supports deterministic movement orders, basic attacks and exactly one active ability for V0.
- Bot hero uses the same hero command/combat authority as the human; no privileged damage/teleport/economy mutation path.
- Existing 4 creep-send archetypes remain the send roster for V0.
- Killed incoming creeps grant deterministic combat reward to the defending seat; a creep may be rewarded or leaked, never both.
- Hero XP and level are deterministic authoritative state. V0 level-up may increase fixed combat stats but introduces no skill tree.
- Existing periodic income/send economy semantics remain frozen unless an explicit successor decision changes them.
- Existing lives, leak, terminal winner/loser and replay semantics remain frozen.
- Browser V0 remains local/in-process; no matchmaking or remote networking.
- No Blizzard retail archives, maps, art, sounds, unit names or balance data.

## Acceptance gates

### H1 — NATIVE_ENTITY_BRIDGE_V0

At least one Tower Wars creep from an accepted `tw_session_*` send is represented by a real OpenRealm server/game entity, crosses the normal server→client snapshot boundary and is rendered from that native entity state. No duplicate simulation authority may emerge.

### H2 — HERO_ENTITY_COMMAND_V0

Both seats own one authoritative OpenRealm hero entity. Human and bot movement commands enter through the same validated hero-command boundary and produce deterministic world movement.

### H3 — HERO_BASIC_COMBAT_V0

Hero basic attacks acquire legal incoming targets and apply deterministic damage/cadence. A hero kill retires the same underlying creep exactly once and grants exactly one combat reward.

### H4 — HERO_ABILITY_V0

One original active hero ability is available to both seats through the same authority path, with deterministic cooldown/cost/targeting/effect semantics and fail-closed invalid casts.

### H5 — HERO_XP_LEVEL_V0

Creep kills grant deterministic XP. Crossing the frozen threshold changes hero level/stats exactly once and is represented in the authoritative state hash/replay.

### H6 — BOT_PARITY_V0

The bot can move, attack, cast and send only through the same public authority interfaces available to the human. A hostile test demonstrates no bot-only mutation path for HP, position, gold, income, XP or lives.

### H7 — REPLAY_NATIVE_CONSISTENCY_V0

Replaying the same ordered session/hero command log from the same seed reproduces economy, lives, hero state, creep outcomes and terminal state hashes. Native OpenRealm presentation must be reconstructible from authoritative replay state rather than being a second source of truth.

### H8 — BROWSER_PLAYABLE_SLICE_V0

Chromium visibly proves a playable loop in the actual OpenRealm Wasm build: human hero moves, kills or damages an incoming native creep, earns reward/XP, performs the active ability, sends a creep to the rival lane, rival state changes, income/leak/lives remain authoritative, and OpenRealm WebGL2 stays stable.

`HERO_LINE_WARS_NATIVE_V0 = PASS` requires H1–H8.

## Non-goals

- Production online multiplayer/matchmaking.
- Accounts, persistence, progression/meta, cosmetics or monetization.
- Multiple hero roster or skill trees.
- Full Warcraft III compatibility.
- Blizzard retail content.
- Reopening the closed Phaser/dog action prototype.
- Reopening `TOWER_WARS_CORE_V0` unless a frozen invariant is falsified.

## Completion policy

`IMPLEMENT → TEST → ONE independent hostile review → fix Critical/High → ONE targeted re-review only if Critical/High fixes were required → COMMIT → MOVE FORWARD`

Medium/Low findings do not restart a gate unless they invalidate that gate, undermine evidence, violate a frozen invariant, or create a fail-open/dual-authority boundary.
