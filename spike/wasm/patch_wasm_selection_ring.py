#!/usr/bin/env python3
from pathlib import Path

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
print("OpenRealm wasm procedural selection ring applied")
