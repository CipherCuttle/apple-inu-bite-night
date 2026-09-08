# OPENREALM_WASM_SPIKE_V0

## Objective

Determine whether the real OpenRealm Warcraft III engine can become a browser-first foundation for the Tower Wars pivot without rewriting the engine before evidence exists.

This branch is an isolated technical spike. It does not merge or modify the existing Phaser gameplay branches.

## Upstream pin

- repository: `corepunch/open-realm`
- commit: `cf12357883950c14abce8d636596952c3fc547bb`
- license: MIT

## V0 acceptance ladder

The spike is intentionally staged. A later gate is not claimed if an earlier gate fails.

1. `COMPILE_CORE`: Emscripten compiles meaningful OpenRealm engine code to WebAssembly.
2. `SDL_WEBGL_BOOT`: an SDL2/WebGL2 canvas created by OpenRealm-compatible code boots under a headless browser.
3. `ENGINE_LINK`: the Warcraft III client/server/game/renderer code can be linked for a browser target with native-only dependencies either replaced or explicitly isolated.
4. `SYNTHETIC_DATA_BOOT`: browser runtime boots using repository-owned/synthetic assets only; retail Warcraft III data is not required for proof.
5. `MAP_UNIT_SMOKE`: render a synthetic map-like scene and drive at least one authoritative unit through the OpenRealm client/server loop.

`OPENREALM_WASM_SPIKE_V0 = PASS` requires gates 1-5.

## Known browser pressure points to falsify

- Makefile assumes native GCC/shared-library/rpath semantics.
- renderer platform headers do not currently define an Emscripten/WebGL branch.
- the desktop entry point uses a blocking `while (true)` loop rather than `emscripten_set_main_loop`.
- local listen-server traffic is already implemented through in-process loopback queues and should not require UDP.
- remote multiplayer currently uses native UDP and must not be treated as browser-compatible; WebSocket/WebTransport work is later.
- filesystem code assumes host directories and must be adapted to Emscripten virtual storage / user-provided data.
- desktop sleep/console/platform calls must not leak into the browser path.

## Non-goals

- no Wintermaul gameplay implementation yet
- no Blizzard retail assets in this repository
- no multiplayer networking rewrite
- no Phaser deletion
- no claims of full Warcraft III compatibility

## Completion policy

`IMPLEMENT -> TEST -> ONE hostile review -> fix Critical/High -> ONE re-review only if needed -> record verdict -> stop.`
