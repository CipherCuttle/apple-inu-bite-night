# HERO_LINE_WARS_PLAYABLE_V1

Status: IMPLEMENTING — P1 PASS / P2 PASS / P3 ACTIVE / P4-P5 INACTIVE

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

## P1 — MATCH_CONTROL_LOOP_V1 — PASS

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

Initial green candidate: `3fea105b5db21d882260aa305090a4b17d906e5b`.

Initial validation:

- GitHub Actions run `34501809328` — PASS on exact candidate `3fea105b5db21d882260aa305090a4b17d906e5b`.
- Artifact `hero-line-wars-playable-p1-v1`, ID `10162255492`, SHA-256 `0e725a8947436395d3b205cd40817258fa4edbcf88d29ea623609f67028cec92`.
- Full inherited H1→H8 deterministic/native/browser regression chain remained green.
- P1 Chromium proof passed sampled WASD/arrow movement, release-stop behavior, queued Space/E combat, focused-control shortcut isolation, pause stability, native replay exactness and WebGL2 survival.

Independent hostile review:

- PR #7 first Codex review on docs/review head `6082db022bccc00637077791a64bd0938f7b223e` reported one P1/High: clicking `Run match` left the button focused, so the global focused-control guard rejected subsequent WASD/arrow/Space/E input during the normal click-Run-then-keyboard flow.
- The finding was accepted as gate-relevant because P1 explicitly requires game-like continuous keyboard control and accessible focused-control isolation simultaneously.

High repair:

- Semantic repair `8468de694995172174452bdf5e6c8903b87fe70a` changes only the P1 overlay so Run/Pause hands focus back to the game immediately after activation; other focused interactive/editable controls remain isolated from global shortcuts.
- Regression commit `92e6ed643b8c0e3979a9bcf562db73527cf5afcc` strengthens the Chromium smoke to prove the exact normal flow `click Run → press D → hero moves`, while retaining pause stability, queued combat, replay and WebGL2 checks.

Final validation:

- GitHub Actions run `34508014497` — PASS on exact repair head `92e6ed643b8c0e3979a9bcf562db73527cf5afcc`.
- Deterministic H3/H4/H5 host authority tests — PASS.
- Pinned OpenRealm + all H1-H8/P1 overlays and Wasm compile — PASS.
- Full H1→H8 browser regressions + strengthened P1 Chromium proof — PASS.
- Browser failure trace and diagnostic-bundle uploads were skipped because the browser gate passed.
- Artifact `hero-line-wars-playable-p1-v1`, ID `10164721862`, SHA-256 `65da74aa9305beaa060a5df14f86d58bc44d847c932ea50448554cf159b6bb40`.

Targeted re-review:

- One targeted Codex re-review was requested on exact repair head `92e6ed643b…`, restricted to the single High repair and inherited authority boundaries.
- Codex returned `👍` with no further suggestions. `C0/H0` for the targeted repair.
- P1 review budget is consumed. No further P1 review loop is authorized.

Result: `P1 MATCH_CONTROL_LOOP_V1 = PASS`.

Non-goals for P1: rebalance, new abilities, new movement physics, camera system, art overhaul, economy changes.

## P2 — COMBAT_READABILITY_V1 — PASS

Goal: make native combat state legible enough that a human can understand target pressure, attacks, ability use and progression without reading debug logs.

Acceptance:

- Current hero level/XP/basic readiness/PHASE-LANCE readiness and incoming creep HP are visibly readable from authoritative/native-derived state.
- Accepted attack/cast/kill/level-up events produce presentation feedback derived from accepted state transitions only.
- No UI animation or effect becomes an authority source or predicts unaccepted damage/reward.
- Accessibility includes non-color-only status cues and reduced-motion-safe presentation.

Implementation/authority notes:

- Combat readouts derive from authoritative browser snapshots; no raw attack/ability/kill-resolver mutation surface was exposed to JS.
- Positive authoritative XP delta is the kill-confirmation source. A creep ID is named only when exactly one observed incoming creep disappeared; ambiguous presentation deltas render generic `KILL CONFIRMED` rather than guessing a target.
- Visible creep HP is paired with semantic labels; readiness remains derived from authoritative tick/cooldown state.

Initial green candidate: `a424020fa7762e4b0ba90fab0eb0bfd9640291f0`.

Initial validation:

- GitHub Actions run `34511005108` — PASS on exact candidate `a424020fa7762e4b0ba90fab0eb0bfd9640291f0`.
- Artifact `hero-line-wars-playable-p2-v1`, ID `10165881326`, SHA-256 `d83a66685ae2a4944d3214bc7c3283f9e125bba621d8e2976b09a4d3b53129ab`.
- Deterministic H3/H4/H5 authority tests, pinned OpenRealm/Wasm compile, H1→H8 browser regressions, P1 regression and P2 Chromium proof all passed.
- P2 proof covered visible HP, cooldown/readiness, accepted damage, conservative kill/XP/level-up feedback, reduced motion, exact replay and WebGL2 survival.

Independent hostile review:

- The single broad Codex review on exact candidate `a424020fa7…` found one gate-relevant High: `renderCombatFeed()` rebuilt the `role="status"` / `aria-live="polite"` region on every ~110 ms render even with no new event, which could repeatedly announce identical history to assistive technology.
- No other Critical/High finding was reported.

High repair:

- `60abfc24f8c52245812f807f6560a92c3ebbfb04` revision-gates combat-feed DOM writes so no event-list change means no live-region mutation; reset deliberately advances the presentation revision once.
- `364ae6b1ecda5c6f625f047413e3bb76001a9806` adds a MutationObserver regression proving an idle authoritative tick causes zero live-region mutations while preserving feed node identity and text, then continues the full P2 combat/replay/WebGL proof.

Final validation:

- GitHub Actions run `34522375093` — PASS on exact repaired runtime head `364ae6b1ecda5c6f625f047413e3bb76001a9806`.
- Deterministic H3/H4/H5 host authority tests — PASS.
- Pinned OpenRealm/Wasm compile — PASS.
- Complete H1→H8 browser regression chain — PASS.
- P1 Chromium regression — PASS.
- Strengthened P2 Chromium proof — PASS, including `idle live-region mutations = 0`.
- Artifact `hero-line-wars-playable-p2-v1`, ID `10170290133`, SHA-256 `aa5f53d39c64d52e441d46df032e5a104306b4371f9981d51ee877a3e30f1a96`.

Targeted re-review:

- Exactly one targeted Codex re-review was requested on `364ae6b1ec…`, restricted to the live-region High repair, accepted-event updates and inherited authority/replay boundaries.
- Codex returned: `Didn't find any major issues. Nice work!` on reviewed commit `364ae6b1ec`. `C0/H0` for the targeted repair.
- P2 review budget is consumed. No further P2 review loop is authorized.

Result: `P2 COMBAT_READABILITY_V1 = PASS`.

## P3 — SEND_ECONOMY_READABILITY_V1 — ACTIVE

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
