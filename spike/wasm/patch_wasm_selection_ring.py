#!/usr/bin/env python3
from pathlib import Path

# Browser builds do not ship Blizzard's WC3 selection-circle BLPs. Reuse the
# engine-owned procedural selection ring that OpenRealm already provides.
path = Path("games/warcraft-3/renderer/r_game.c")
text = path.read_text()
old = '''    FOR_LOOP(i, NUM_SELECTION_CIRCLES) {
        tr.texture[TEX_SELECTION_CIRCLE+i] = R_LoadTexture(selCirclesNames[i]);
    }
'''
new = '''#ifdef __EMSCRIPTEN__
    /* The standalone browser build deliberately ships no Blizzard BLP assets.
     * Reuse OpenRealm's renderer-owned procedural ring instead of letting the
     * missing-texture checker become the selected-unit visualization. */
    {
        LPTEXTURE ring = R_MakeSelectionCircleTexture();
        FOR_LOOP(i, NUM_SELECTION_CIRCLES) {
            tr.texture[TEX_SELECTION_CIRCLE+i] = ring;
        }
        fprintf(stderr, "OPENREALM_SELECTION_RING=PROCEDURAL\\n");
    }
#else
    FOR_LOOP(i, NUM_SELECTION_CIRCLES) {
        tr.texture[TEX_SELECTION_CIRCLE+i] = R_LoadTexture(selCirclesNames[i]);
    }
#endif
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"r_game.c: expected one selection-circle load block, got {count}")
path.write_text(text.replace(old, new, 1))

# Selecting the smoke unit also wakes WC3's classic inventory panel. The
# standalone Tower Wars browser proof has no hero inventory and intentionally
# ships no retail war3skins data, so the symbolic ConsoleInventoryCoverTexture
# otherwise resolves to the renderer's magenta missing-texture checker. Suppress
# only that cover in wasm; native OpenRealm behavior remains untouched.
path = Path("games/warcraft-3/game/hud/hud_infopanel.c")
text = path.read_text()
old = '''static void WriteInventoryCover(LPEDICT player) {
    static FRAMEDEF frame;
'''
new = '''static void WriteInventoryCover(LPEDICT player) {
#ifdef __EMSCRIPTEN__
    (void)player;
    return;
#endif
    static FRAMEDEF frame;
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"hud_infopanel.c: expected one WriteInventoryCover anchor, got {count}")
path.write_text(text.replace(old, new, 1))

print("OpenRealm wasm selection asset fallbacks repaired")
