#!/usr/bin/env python3
from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# The entity-state wire format packs scale as signed int16(scale * 500).
# Keep smoke transforms inside the representable positive range and put size
# into the synthetic model geometry instead of abusing network scale.
replace(
    "games/warcraft-3/game/g_main.c",
    "    VECTOR2 spawn = { -140.0f, 0.0f };\n",
    "    VECTOR2 spawn = { -120.0f, 0.0f };\n",
)
replace(
    "games/warcraft-3/game/g_main.c",
    "    ground->s.scale = 620.0f;\n",
    "    ground->s.scale = 48.0f;\n",
)
replace(
    "games/warcraft-3/game/g_main.c",
    "    ground->s.origin = (VECTOR3){ 0.0f, 0.0f, -12.0f };\n",
    "    ground->s.origin = (VECTOR3){ 0.0f, 0.0f, 0.0f };\n",
)
replace(
    "games/warcraft-3/game/g_main.c",
    "    wasm_map_unit_smoke_unit->s.scale = 92.0f;\n",
    "    wasm_map_unit_smoke_unit->s.scale = 18.0f;\n",
)
replace(
    "games/warcraft-3/game/g_main.c",
    "    wasm_map_unit_smoke_unit->s.origin.z = 8.0f;\n",
    "    wasm_map_unit_smoke_unit->s.origin.z = 6.0f;\n",
)

# OpenRealm's mdxgen quad fixture is normally 1x1. For this synthetic map-only
# browser fixture make just the quad_sprite preset 12x8 world units. This tool
# is compiled in CI and the change never touches native runtime semantics.
replace(
    "tools/mdxgen.c",
    '''    return build_model(tex, out, "QuadSprite",\n                       0.5f, 0.5f,\n                       names, starts, ends, 1) ? 0 : 1;\n''',
    '''    return build_model(tex, out, "QuadSprite",\n                       6.0f, 4.0f,\n                       names, starts, ends, 1) ? 0 : 1;\n''',
)

# Strengthen gate 5: renderer-list admission is not enough. Emit smoke evidence
# only from the actual entity draw loop, after visibility/model checks have
# passed and immediately before R_DrawEntity executes.
replace(
    "renderer/r_ents.c",
    '''        if (in_view) {\n            drawn++;\n            R_DrawEntity(ent, shad);\n        } else {\n''',
    '''        if (in_view) {\n            drawn++;\n#ifdef __EMSCRIPTEN__\n            {\n                static BOOL smoke_ground_drawn = false;\n                static BOOL smoke_unit_drawn = false;\n                if (ent->number == 24 && ent->scale > 0.0f && !smoke_ground_drawn) {\n                    fprintf(stderr,\n                            "OPENREALM_MAP_SCENE_DRAW=PASS ent=%u scale=%.3f\\n",\n                            (unsigned)ent->number, ent->scale);\n                    smoke_ground_drawn = true;\n                }\n                if (ent->number == 25 && ent->scale > 0.0f && !smoke_unit_drawn) {\n                    fprintf(stderr,\n                            "OPENREALM_MAP_UNIT_DRAW=PASS ent=%u scale=%.3f x=%.1f\\n",\n                            (unsigned)ent->number, ent->scale, ent->origin.x);\n                    smoke_unit_drawn = true;\n                }\n            }\n#endif\n            R_DrawEntity(ent, shad);\n        } else {\n''',
)

print("OpenRealm wasm visual smoke repair applied")
