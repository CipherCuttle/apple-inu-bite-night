# HERO_LINE_WARS_NATIVE_V0

Status: PASS — H1 PASS / H2 PASS / H3 PASS / H4 PASS / H5 PASS / H6 PASS / H7 PASS / H8 PASS

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

### H1 — NATIVE_ENTITY_BRIDGE_V0 — PASS

At least one Tower Wars creep from an accepted `tw_session_*` send is represented by a real OpenRealm server/game entity, crosses the normal server→client snapshot boundary and is rendered from that native entity state. No duplicate simulation authority may emerge.

Closure evidence:

- Candidate head: `fea5c56e866a9cc835d87852b38120c400e1dbdc`.
- GitHub Actions run: `34399229954` — PASS.
- Artifact: `hero-line-wars-native-h1-v0`, ID `10122790803`, SHA-256 `4ae40d46d08303acadab915a26302d22e7b78a76510b9ad7e350b1c9d1741222`.
- Authoritative session creep `1` was mirrored as OpenRealm edict `26`.
- The same entity number crossed server snapshot → client entity → renderer draw.
- Session movement `(0,3) → (1,3)` moved the same native edict; session retirement removed the same native edict.
- OpenRealm WebGL2 remained alive through the proof.
- Hostile review: 1 High — browser mutation boundary could report success after native presentation desync.
- High repair: partial mirrors clear fail-closed; reset/step surface native-sync failure; build/send/step freeze while presentation is degraded until reset.
- Targeted re-review after the High repair: `C0 / H0`.

### H2 — HERO_ENTITY_COMMAND_V0 — PASS

Both seats own one authoritative OpenRealm hero entity. Human and bot movement commands enter through the same validated hero-command boundary and produce deterministic world movement.

Closure evidence:

- Candidate head after High repair: `71ea6071d8bbf56428e1dec5dd88a447025dec2a`.
- GitHub Actions run: `34400730133` — PASS.
- Artifact: `hero-line-wars-native-h2-v0`, ID `10123410468`, SHA-256 `920e3685a9908967826ccc487e0db5837dbd1babd8c39fe7c27a33bf8f8fce8b`.
- H1 regression remained PASS in the same Wasm artifact.
- Native hero edicts were `26` and `27`; the same entity numbers crossed server snapshot → client entity → actual renderer draw.
- Human and bot both used the same exported `_HLW_BrowserHeroMove(actor, x, y)` boundary; no bot-only movement export existed and the raw native `HLW_OpenRealmHeroCommandMove` mutation was not exported to JS.
- Invalid actor, cross-lane and out-of-bounds movement commands failed closed without changing hero positions.
- After exactly five deterministic ticks, actor 0 moved `(-120,-140) → (-80,-140)` and actor 1 moved `(120,140) → (80,140)`.
- Reset plus the same ordered commands reproduced the same positions.
- Hostile review: 1 High — rapid reset freed hero edicts, but upstream `G_Spawn()` quarantines recently freed edicts for 1000 ms, so reset spam could consume `globals.num_edicts` and eventually exhaust the entity pool.
- High repair: healthy hero edicts are now unlinked, canonically reinitialized and relinked in place instead of freed/reallocated.
- Targeted proof performed 64 immediate resets; every reset retained exact entity IDs `26/27`, restored canonical starts, then both heroes still accepted the shared command and moved correctly.
- OpenRealm WebGL2 remained alive after the reset burst.
- Targeted re-review after the High repair: `C0 / H0`.
- Carry-forward Medium: when a later gate introduces native hero HP/combat fields, the in-place reset initializer must explicitly restore those newly authoritative fields too; H3 added session-owned attack cadence but no native hero HP state.

### H3 — HERO_BASIC_COMBAT_V0 — PASS

Hero basic attacks acquire legal incoming targets and apply deterministic damage/cadence. A hero kill retires the same underlying creep exactly once and grants exactly one combat reward.

Frozen H3 mechanics:

- Basic attack damage: `25`.
- Basic attack cadence: `4` authoritative match ticks.
- Native server target range: `96` OpenRealm world units.
- Hero kill reward: `20` gold.
- Target ordering: incoming creeps only; nearest squared native-server distance first; creep ID ascending as the deterministic tie-break.

Authority path:

`native OpenRealm hero position + session-derived native creep mirror → legal target ID → tw_session_hero_attack → authoritative creep HP/kill/reward/event → H1 native mirror sync/removal`

The browser may request only `HLW_BrowserHeroAttack(actor)`. It cannot supply target ID, range, damage, HP, reward or retirement state. Native target acquisition chooses a legal incoming target; `tw_session_hero_attack` remains authoritative for cadence, damage, kill retirement, reward and replay logging.

Closure evidence:

- Candidate head: `e7f1ecff0078a97d31c981b4fa3fffe79b36ef13`.
- GitHub Actions run: `34402182442` — PASS.
- Artifact: `hero-line-wars-native-h3-v0`, ID `10123944857`, SHA-256 `9b7c74d1e8757166d467b0fea3b5ed4970d1ae1700e0213fe256cb91c615dbf6`.
- Deterministic host combat test passed before the OpenRealm build.
- H1 native-creep bridge and both H2 movement/reset regressions remained PASS in the same Wasm artifact.
- Scout creep `1` entered player 0's lane as the same native OpenRealm edict `28` used by target acquisition and later retirement.
- Wrong-seat actor 1 could not acquire the outgoing creep; the rejected attack left authoritative state/log hashes unchanged.
- Actor 0 acquired creep `1` / edict `28` inside the frozen native range and the first attack changed authoritative HP `45 → 20`, granted no reward and set readiness to tick `5`.
- An immediate repeat was rejected by deterministic cadence without changing state, log, HP or gold.
- At tick `5`, the second attack killed the same creep, removed native edict `28`, granted exactly `20` combat gold (`500 → 520`) and advanced readiness to tick `9`.
- A post-kill retry could not reacquire the retired creep and granted no second reward.
- Advancing another 80 ticks left player 0 at `20` lives with no active creep, proving the killed creep did not later leak.
- Browser replay verification passed with the H3 attack events included in state/log hashes.
- OpenRealm WebGL2 remained alive through the proof.
- Hostile review: `C0 / H0`; no repair or re-review cycle required.
- Carry-forward Medium: native H3 range currently uses the authoritative server creep mirror's cell coordinates and does not apply `progress_milli`, so renderer interpolation can be visually finer-grained than attack-range legality.
- Carry-forward Medium: H3 replay reproduces accepted attack effects/cadence, but native range legality is not replayed because native hero movement is not in the session log; H7 explicitly owns full replay/native consistency.
- Carry-forward Medium: nearest/creep-ID target ordering is deterministic in implementation, but H3 browser evidence exercises a single legal target rather than a multi-target tie case.

### H4 — HERO_ABILITY_V0 — PASS

One original active hero ability is available to both seats through the same authority path, with deterministic cooldown/cost/targeting/effect semantics and fail-closed invalid casts.

Frozen H4 ability: **PHASE LANCE**.

- Damage: `60`.
- Cooldown: `12` authoritative match ticks.
- Cost: `15` authoritative gold.
- Native server target range: `128` OpenRealm world units.
- A lethal cast uses the frozen H3 combat-kill reward: `20` gold.
- Target ordering is the same native nearest-incoming-creep / creep-ID tie-break used by H3.

Authority path:

`native OpenRealm hero position + session-derived native creep mirror → legal target ID → tw_session_hero_ability → authoritative gold/cooldown/creep HP/kill/reward/event → H1 native mirror sync/removal`

The browser may request only `HLW_BrowserHeroAbility(actor)`. It cannot supply target ID, range, damage, cost, cooldown, HP, reward or retirement state. Human and bot seats use the same actor-indexed public cast boundary; no bot-only ability mutation path exists.

Closure evidence:

- Candidate head: `1a5f083f940c65b6336faa605d1ff45909096241`.
- GitHub Actions run: `34403426017` — PASS.
- Artifact: `hero-line-wars-native-h4-v0`, ID `10124414057`, SHA-256 `9d3865ee3c61f95e6f55c49c65d99b70c92da068136cb962af7a5eae9db70a8b`.
- Deterministic H3 and H4 host authority tests passed before the OpenRealm build.
- H1 native-creep, H2 movement/reset and H3 basic-combat regressions remained PASS in the same Wasm artifact.
- Wrong-seat actor 1 could not cast PHASE LANCE on actor 0's incoming creep; the rejected cast left authoritative state/log/HP unchanged.
- Actor 0 acquired creep `1` / native edict `28` at the frozen `128` world-unit range and cast PHASE LANCE through the shared browser command.
- First cast changed authoritative HP `70 → 10`, charged exactly `15` gold (`500 → 485`), granted no kill reward and set ability readiness to tick `13`.
- An immediate second cast was rejected by the `12`-tick cooldown without changing authoritative HP, gold, state hash or log hash.
- At tick `13`, the second cast killed creep `1`, charged `15`, granted the existing `20` combat-kill reward, produced actor-0 gold `490`, set readiness to tick `25`, and removed the same native edict `28`.
- A post-kill cast could not reacquire the retired creep and granted no second reward.
- Browser replay verification reproduced the accepted PHASE LANCE events and authoritative state/log hashes.
- After reset, actor 1 was moved through the ordinary H2 command path, received an incoming swarm, and successfully used the same `HLW_BrowserHeroAbility(1)` command; that cast produced HP `10`, cost `15`, and readiness `tick + 12`.
- Final evidence reported `bothSeatsSameCommand=true`, `replayOk=true`, and `finalWebGL2=true`.
- Hostile review of the complete H3-closure→H4 delta: `C0 / H0`; no repair or targeted re-review cycle required.
- Carry-forward Medium: PHASE LANCE inherits H3's coarse server-cell target coordinates rather than applying creep `progress_milli`; renderer interpolation can therefore be visually finer-grained than range legality.
- Carry-forward Medium: full native positional legality is not reconstructed by session replay yet because native hero movement is not in the ordered session log; H7 explicitly owns that consistency gate.
- Carry-forward Medium: H3/H4 currently duplicate a small active-creep retirement helper; H5 should consolidate kill reward/XP/retirement into one deterministic resolution path rather than adding a third copy.

### H5 — HERO_XP_LEVEL_V0 — PASS

Creep kills grant deterministic XP. Crossing the frozen threshold changes hero level/stats exactly once and is represented in the authoritative state hash/replay.

Frozen H5 progression:

- Start level: `1`.
- Kill XP reward: `50`.
- Level-2 threshold: `100` XP.
- V0 max level: `2`.
- Level-1 basic damage: `25`.
- Level-2 basic damage: `30`.
- Basic attacks and PHASE LANCE share one deterministic lethal-resolution path for creep retirement, gold reward, XP and level transition.

Closure evidence:

- Candidate head: `7fbdd247e1b61e37a30ff08e560686f685ad833d`.
- GitHub Actions run: `34411660223` — PASS.
- Artifact: `hero-line-wars-native-h5-v0`, ID `10127523494`, SHA-256 `35f3811d7068c00dc1123e52455be13b3221b3670be11a640a8bc51b50561b2e`.
- Deterministic H3, H4 and H5 host authority tests all passed under `-Wall -Wextra -Werror` before the OpenRealm build.
- H1 native-creep, H2 movement/reset, H3 basic-combat and H4 PHASE LANCE regressions all remained PASS in the same Wasm artifact.
- First Scout kill through the basic-attack path granted exactly `50` XP and `20` gold; actor 0 remained level `1` with `25` basic damage.
- Second Scout kill through PHASE LANCE raised XP `50 → 100`, transitioned level `1 → 2` exactly at the frozen threshold, and changed basic damage `25 → 30`.
- A subsequent level-2 basic hit changed Scout HP `45 → 15`, independently proving the `30` damage stat is used by combat rather than being HUD-only state.
- Progression fields are included in the authoritative session state hash; browser replay reproduced XP `100`, level `2`, damage `30` and the same state/log hashes.
- Reset restored XP `0`, level `1`, damage `25` while preserving the stable native hero entity IDs.
- The shared lethal resolver rejects nonlethal use and preflights gold/XP overflow before mutation; overflow/rejected paths are non-mutating in the host proof.
- The raw lethal resolver is not exported to the browser; product ingress remains the actor-indexed attack/ability commands.
- OpenRealm WebGL2 remained alive through the full H1→H5 proof.
- Hostile review of the complete H4-closure→H5 delta: `C0 / H0`; no repair or targeted re-review cycle required.
- Carry-forward Medium: the shared lethal resolver is a cross-file internal helper rather than an opaque private symbol. Product/browser ingress cannot call it, but H6/H7 must not widen or bypass this mutation surface.
- Carry-forward Medium: H5 intentionally does not resolve H3/H4's coarse creep-position range legality or missing native-movement replay; H7 owns full replay/native consistency.

### H6 — BOT_PARITY_V0 — PASS

The bot can move, attack, cast and send only through the same public authority interfaces available to the human. A hostile test demonstrates no bot-only mutation path for HP, position, gold, income, XP or lives.

Closure evidence:

- Candidate head: `7713d2a912aae67f01fe9d643b6475286715375b`.
- GitHub Actions run: `34412160420` — PASS.
- Artifact: `hero-line-wars-native-h6-v0`, ID `10127706518`, SHA-256 `8dc2bf408107c19e372a02e35b7682958f785d45664c1609b293cedb2493f988`.
- H1 through H5 regressions remained PASS in the same OpenRealm Wasm artifact.
- Actor 1 used exactly the same actor-indexed public movement, basic-attack, PHASE LANCE and creep-send commands as actor 0: `HLW_BrowserHeroMove`, `HLW_BrowserHeroAttack`, `HLW_BrowserHeroAbility`, and `TW_BrowserSend`.
- Explicit raw match/session/native combat mutation exports were absent from JS, and no suspicious bot-named HP/position/gold/income/XP/lives mutation export was present.
- Invalid bot commands (cross-lane move, no-target attack/ability, invalid-seat send) all returned failure; authoritative state hash, log hash and hero position were unchanged.
- Actor 1 moved through the shared H2 command to `(-120,140)`.
- Actor 1 killed an incoming Swarm through the shared PHASE LANCE command and received `50` XP.
- Actor 1 sent a Scout through the shared send command; its own gold changed by `-40` and income by `+4`.
- Actor 1 then killed an incoming Scout through the shared basic-attack command, reaching XP `100`, level `2`, and basic damage `30`.
- Browser replay verification passed and OpenRealm WebGL2 remained alive.
- Hostile review of the complete H5-closure→H6 delta: `C0 / H0`; no repair or targeted re-review cycle required.
- Carry-forward Medium: H6 proves authority parity with a scripted deterministic driver, not autonomous bot decision scheduling. H8 must provide actual deterministic bot choices for the playable local 1v1.

### H7 — REPLAY_NATIVE_CONSISTENCY_V0 — PASS

Replaying the same ordered session/hero command log from the same seed reproduces economy, lives, hero state, creep outcomes and terminal state hashes. Native OpenRealm presentation must be reconstructible from authoritative replay state rather than being a second source of truth.

Closure evidence:

- Repair candidate head: `e9b5f80e9e275cb311503d95872e5b7d56afd08c` on `repair/h7-progress-legality-v0`.
- GitHub Actions run: `34419657230` — PASS.
- Artifact: `hero-line-wars-native-h7-v0`, ID `10130455171`, SHA-256 `18b7602b9e741ff7e1549ced8065cf1cfddae5028774fccde94e3c668e336f0a`.
- H1 through H6 browser regressions, deterministic H3-H5 host authority tests, full OpenRealm/Wasm compilation, H7 fractional-position legality, ordered public-command replay and artifact upload all passed in the same run.
- Native creep position is reconstructed from authoritative current cell + deterministic next route cell + `progress_milli`; native semantic hashing uses deterministic fixed-point milli-world coordinates rather than float truncation.
- Falsification proof placed a Scout at cell `(0,3)`, progress `250`, where coarse cell-only distance was `100` but authoritative interpolated distance was `90` against basic range `96`; the legal attack was accepted and exact native replay reproduced the partial-progress state.
- H7 destructive replay reissues the saved ordered browser command journal from reset and reproduces authoritative session state/log hashes, hero/native semantic state, creep outcomes and terminal state while keeping presentation derived from authority.
- Independent hostile review: `C0 / H1`. High: an accepted route-changing tower build could mutate the authoritative grid while leaving a partially-progressed creep's native mirror on the old route until the next step, allowing an immediate attack/cast to use stale pre-build native legality.
- High repair: every accepted `TW_BrowserBuild` now immediately resynchronizes native creep presentation from the post-build authoritative grid before reporting product success; native sync failure enters the existing degraded fail-closed gate.
- Targeted regression blocks `(1,3)` while a Scout is at `(0,3)` / progress `250`, proves the native semantic hash changes immediately with no intervening step, then proves the stale-route basic attack is rejected with HP, XP, session-log, command and native hashes unchanged.
- The repaired route-changing state round-trips through H7 native replay exactly and OpenRealm WebGL2 remains alive.
- Exactly one targeted re-review of the High repair: `C0 / H0`. Review budget consumed; no further review loop.

### H8 — BROWSER_PLAYABLE_SLICE_V0 — PASS

Chromium visibly proves a playable loop in the actual OpenRealm Wasm build: human hero moves, kills or damages an incoming native creep, earns reward/XP, performs the active ability, sends a creep to the rival lane, rival state changes, income/leak/lives remain authoritative, and OpenRealm WebGL2 stays stable.

Closure evidence:

- Final validated repair head: `90e3e2fb064e89b02bf6262afc90eaeffc33cb00` on `phase-hlw/h8-browser-playable-slice-v0`.
- Full H1→H8 GitHub Actions run: `34498411186` — PASS.
- H8 artifact: `hero-line-wars-native-h8-v0`, ID `10160864492`, SHA-256 `1291fc66ef5c8022699037f7703a1d9bfc2bc2e5a786eaa7398e500e93670a4a`.
- Existing TW-only compatibility run: `34498411184` — PASS.
- TW-only artifact: `tower-wars-openrealm-wasm-v0`, ID `10160827707`, SHA-256 `1ea8b7e1dbbe9758cd0de6e91fe31cc37aca218ca9f49e80b47d2ffb52ae4883`.
- The full H1→H8 run passed deterministic H3-H5 host authority tests, pinned OpenRealm checkout, all H1-H7 browser regressions, the H8 physical DOM interaction proof, playable local 1v1 proof and success-only Wasm artifact upload.
- H8 browser controls enter only through the existing actor-indexed public movement/basic-attack/PHASE-LANCE/send boundaries. The deterministic bot uses actor `1` through the same public boundaries; no bot-only HP, position, gold, income, XP, lives or retirement authority was introduced.
- The playable proof covers human native hero movement, basic damage and kill reward/XP, PHASE LANCE damage/cost, periodic income, exactly-once leak/lives loss, human send into the rival lane, autonomous deterministic bot movement/combat/send response, exact H7 native replay and stable OpenRealm WebGL2.
- Browser presentation repair: H8 overrides only OpenRealm video policy with `vid_native=0` and `vid_fullscreen=0`, preventing the native canvas from entering the browser fullscreen top layer and removing sibling H8 controls from physical hit-testing. Simulation/game authority is unchanged.
- Independent Codex hostile review of candidate `3daf3753b321dc3d9215a2539557709a683056db`: `C0 / H1` plus one coupled P2. High: the shared shell required `_HLW_Browser*` exports and therefore no longer booted under the existing TW-only browser build. Coupled P2: the shared shell had dropped legacy `globalThis.__TW_API.replay`, which the existing `browser_vertical_slice.mjs` still calls.
- High/coupled repair at `5446ec423274a5216c33cc2617b11674e9c56681`: the shell now detects TW-core availability independently from optional H8 hero exports, preserves TW-only rendering/stepping, disables hero-only controls when unavailable, and exposes `__TW_API.replay` in both modes; H8 mode retains the native replay verifier and deterministic bot/hero path.
- Exactly one targeted Codex re-review of semantic repair `5446ec423274a5216c33cc2617b11674e9c56681`: no major issues (`C0 / H0`). Review budget consumed.
- Post-re-review validation deliberately ran the existing TW-only workflow on the H8 stacked lineage. Its first run exposed a pre-existing H7 compile-mode hygiene defect before browser execution: native-only static helper `fail_native_presentation` was visible without `HLW_NATIVE_V0` and failed `-Werror` as unused.
- Validation-only source-hygiene repair at `90e3e2fb064e89b02bf6262afc90eaeffc33cb00`: the helper definition itself is now compiled only under the already-existing `HLW_NATIVE_V0` guard. No native-HLW runtime behavior, simulation authority or public command semantics changed.
- Final validation then passed both the unchanged legacy TW-only Chromium vertical slice—including the restored `__TW_API.replay` contract—and the full H1→H8 native authority/browser suite on the same exact source head.
- No second hostile re-review was opened after the validation-only compile guard because the single targeted re-review budget had already been consumed; the guard is compile-time mode hygiene only and the two exact CI modes are green.

`HERO_LINE_WARS_NATIVE_V0 = PASS` requires H1–H8. H1–H8 are now PASS.

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
