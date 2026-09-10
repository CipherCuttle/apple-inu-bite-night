# HERO_LINE_WARS_PLAYABLE_V1

Status: IMPLEMENTING — P1 GREEN CANDIDATE / AWAITING INDEPENDENT REVIEW / P2-P5 INACTIVE

Parent closure: `HERO_LINE_WARS_NATIVE_V0 = PASS` at `56361b751fd6da63e63fdcaf22347b5d0ff95de6`.

Branch: `phase-hlw/playable-v1`

## Product objective

Turn the technically proven OpenRealm Hero Line Wars V0 slice into the first match that is understandable and enjoyable to operate as a game, without widening simulation authority.

The player should be able to enter the browser, understand what to do, control the hero continuously, read combat/economy consequences, pressure the rival through sends, reach a terminal match result, and replay the same authoritative history exactly.

Primary loop remains:

`move hero → defend lane → attack/cast → earn gold + XP → send pressure → gain income → survive leaks → reach terminal result`

## Frozen inherited invariants

Everything closed by `HERO_LINE_WARS_NATIVE_V0` remains frozen unless a new explicit successor decision says otherwise:

- `tw_session_*` remains the only authority for economy, send, creep HP/outcomes, rewards, XP/level, lives, terminal state and replay.
- OpenRealm native hero state and presentation-derived creep entities remain on the proven authority boundary; browser UI is input/readout only.
- Browser code may not manufacture target IDs, damage, HP, reward, XP, level, cooldown, cost, income, lives, leak, retirement or terminal outcomes.
- Human and bot continue through the same actor-indexed public movement/basic-attack/PHASE-LANCE/send interfaces.
- Invalid commands fail closed and must not mutate authoritative state.
- A creep is rewarded or leaks, never both.
- Same seed + same accepted ordered command log must reproduce authoritative and native semantic hashes.
- Pinned OpenRealm remains `cf12357883950c14abce8d636596952c3fc547bb`; Emscripten remains `6.0.9` unless separately authorized.
- No Blizzard retail assets, names, maps, sounds or balance data.
- No online matchmaking/networking, accounts, persistence, monetization, skill trees or hero roster expansion in this phase.
- The closed Phaser/dog prototype remains closed.
- PR #6 / H8 is not merge-authorized merely because this successor exists.

## P1 — MATCH_CONTROL_LOOP_V1 — GREEN CANDIDATE / AWAITING INDEPENDENT REVIEW

Goal: replace proof-oriented button stepping with a game-like continuous human control loop while keeping commands deterministic and public-boundary-only.

Acceptance:

- Continuous match clock uses the existing fixed authoritative tick path; browser timing may schedule ticks but may not own simulation time.
- Human can move with keyboard controls while the match runs; repeated input is converted into the existing validated hero movement command, never direct position mutation.
- Basic attack and PHASE LANCE have keyboard bindings and still call only their existing actor-0 public commands.
- Pointer/buttons remain usable as an accessible fallback.
- Input handling ignores editable/browser-reserved contexts and does not create duplicate simultaneous timers.
- Pause/resume stops browser scheduling without mutating or rewinding authoritative state.
- Reset restores the frozen deterministic initial state and input scheduler state.
- H1-H8 regressions remain green.
- Chromium proof demonstrates physical key input → public command → authoritative/native state change while WebGL2 remains alive.

Validated code candidate: `3fea105b5db21d882260aa305090a4b17d906e5b`.

Validation evidence:

- GitHub Actions run `34501809328` — PASS on exact candidate `3fea105b5db21d882260aa305090a4b17d906e5b`.
- Artifact `hero-line-wars-playable-p1-v1`, ID `10162255492`, SHA-256 `0e725a8947436395d3b205cd40817258fa4edbcf88d29ea623609f67028cec92`.
- Full inherited H1→H8 deterministic/native/browser regression chain remained green.
- P1 Chromium proof passed sampled WASD/arrow movement, release-stop behavior, queued Space/E combat, focused-control shortcut isolation, pause stability, native replay exactness and WebGL2 survival.
- A strengthened focus-isolation test initially failed because its own `#hero-center` click retained focus; the corrected smoke commit `3fea105b…` only blurs that fallback control before intentionally exercising global shortcuts. Runtime focus-isolation semantics remained unchanged.

Review state:

- Required independent hostile review has not yet closed this gate.
- P1 remains a green candidate, not PASS, until that one review is evaluated under the bounded completion policy.
- If the review reports Critical/High findings, repair only those findings and perform at most one targeted re-review; otherwise close P1 and move directly to P2.

Non-goals for P1: rebalance, new abilities, new movement physics, camera system, art overhaul, economy changes.

## P2 — COMBAT_READABILITY_V1 — INACTIVE

Goal: make native combat state legible enough that a human can understand target pressure, attacks, ability use and progression without reading debug logs.

Acceptance direction:

- Current hero level/XP/basic readiness/PHASE-LANCE readiness and incoming creep HP are visibly readable from authoritative/native-derived state.
- Accepted attack/cast/kill/level-up events produce presentation feedback derived from accepted state transitions only.
- No UI animation or effect becomes an authority source or predicts unaccepted damage/reward.
- Accessibility includes non-color-only status cues and reduced-motion-safe presentation.

## P3 — SEND_ECONOMY_READABILITY_V1 — INACTIVE

Goal: make offensive decisions understandable before committing them.

Acceptance direction:

- Each send communicates authoritative cost and income gain.
- Affordability/readiness derives from current authoritative snapshot; rejection remains authoritative and fail-closed.
- The player can see own gold/income/lives and rival pressure without exposing hidden mutation controls.
- Sending through keyboard/pointer uses the existing public send command only.

No balance changes are authorized by this gate.

## P4 — MATCH_LIFECYCLE_BOT_PACING_V1 — INACTIVE

Goal: turn deterministic bot actions and terminal state into a coherent beginning/middle/end match flow.

Acceptance direction:

- Explicit ready/start/running/paused/terminal presentation states derive from the existing session state plus browser scheduler state.
- Bot remains deterministic and uses only the shared actor-1 public boundaries.
- Terminal winner/loser presentation derives exclusively from authoritative terminal state.
- Restart creates the exact frozen initial deterministic state.
- No hidden bot catch-up, teleport, damage, economy or spawn mutation path.

## P5 — PRODUCT_PLAYTHROUGH_V1 — INACTIVE

Goal: prove the complete V1 interaction layer as one bounded browser playthrough.

Final proof must demonstrate in Chromium using physical DOM/keyboard interaction:

`start → continuous hero movement → basic combat → PHASE LANCE → reward/XP → send pressure → income → leak/lives → deterministic bot response → terminal/restart or bounded terminal-producing scenario → exact replay/native reconstruction`

Required closure properties:

- OpenRealm WebGL2 remains alive.
- No page error/abort.
- H1-H8 regressions remain green.
- Legacy TW-only browser workflow remains green.
- No widened JS mutation surface.
- One independent hostile review of the V1 candidate; fix Critical/High only; at most one targeted re-review if required.

`HERO_LINE_WARS_PLAYABLE_V1 = PASS` requires P1-P5 PASS.

## Completion policy

For each bounded gate:

`IMPLEMENT → TEST → ONE independent hostile review → fix Critical/High → ONE targeted re-review only if Critical/High fixes were required → COMMIT → MOVE FORWARD`

Medium/Low findings do not restart a gate unless they invalidate the gate objective/evidence, violate a frozen invariant, or create a fail-open/dual-authority boundary.
