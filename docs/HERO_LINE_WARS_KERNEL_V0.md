# HERO_LINE_WARS_KERNEL_V0

## Objective

Replace the OpenRealm browser smoke toy with a small, original Hero Line Wars-style game loop while preserving the proven WebAssembly/OpenGL ES 3/WebGL2 engine path and avoiding Warcraft III retail assets.

## Frozen V0 rules

- Two isolated lines: player and enemy AI.
- One hero per line.
- Player hero movement: WASD.
- Heroes auto-attack hostile creeps in their own line.
- Player ability: Q Nova, 6 second cooldown.
- Starting resources: 80 gold, 20 income, 20 lives.
- Income pays every 10 seconds.
- Sending creeps costs gold and increases future income.
- Runner: 10 gold, +2 income.
- Brute: 35 gold, +6 income.
- Juggernaut: 75 gold, +12 income.
- Creeps that reach the end of a line remove one life from that defender.
- Hero kills grant gold and XP; XP increases hero level.
- Enemy AI uses the same send/economy primitives as the player.
- First side reduced to zero lives loses.
- R restarts the local match.

## Authority and trust boundaries

The OpenRealm game module is authoritative for gold, income, sends, hero movement, combat, XP, levels, leaks, lives and win/loss. The browser shell only forwards input to explicit Emscripten exports and renders read-only HUD values returned by the authoritative module.

The browser build remains asset-free with respect to Blizzard retail content. It uses OpenRealm source/test assets and renderer-owned primitives only.

## Acceptance gates

1. Pinned OpenRealm `cf12357883950c14abce8d636596952c3fc547bb` compiles and links to Wasm.
2. Existing SDL/WebGL2 engine smoke remains green.
3. Drag-selection must not reintroduce missing-texture magenta artifacts.
4. Hero Line Wars browser test proves:
   - initial economy/lives;
   - send spends gold and increases income;
   - sent creep appears on enemy line;
   - WASD changes authoritative hero position;
   - Q arms a real cooldown;
   - AI sends into the player line and grows its own income;
   - a 10-second income tick credits the post-send income amount;
   - renderer emits the Hero Line Wars board marker;
   - no Wasm runtime abort occurs.
5. Static preview publishes only after all browser gates pass.

## Explicitly deferred

- Online multiplayer / lobby / matchmaking.
- Additional heroes and ability kits.
- Items, tomes, stat shop and hero selection.
- Large creep roster / tech tiers.
- Team sizes above local 1v1.
- Full terrain/model art pass.
- Sound/music browser port.
- Balance tuning beyond proving the core economy/defense loop.
