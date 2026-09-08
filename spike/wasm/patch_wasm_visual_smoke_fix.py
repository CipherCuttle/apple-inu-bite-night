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

# The upstream preview camera is intentionally shallow because it previews MDX
# models, not an RTS board. The smoke ground is an XY plane, so that camera made
# a healthy draw collapse to a ~6px strip. Use a browser-smoke-only high RTS
# camera while preserving the ordinary preview camera for every native path.
replace(
    "client/cl_view.c",
    '''        if (wasm_smoke) {\n            VECTOR3 target = { 0, 0, 0 };\n            Matrix4_getPreviewCameraMatrix(&target, &cl.viewDef.viewProjectionMatrix);\n            Matrix4_getPreviewLightMatrix(&lightAngles, &target, VIEW_SHADOW_SIZE, &cl.viewDef.lightMatrix);\n        } else\n''',
    '''        if (wasm_smoke) {\n            MATRIX4 smoke_proj, smoke_view;\n            size2_t smoke_window = re.GetWindowSize();\n            VECTOR3 target = { 0, 0, 0 };\n            VECTOR3 eye = { 0.0f, -180.0f, 700.0f };\n            VECTOR3 dir = Vector3_sub(&target, &eye);\n            FLOAT aspect = smoke_window.height > 0\n                ? (FLOAT)smoke_window.width / (FLOAT)smoke_window.height\n                : 1.0f;\n            Matrix4_perspective(&smoke_proj, 45.0f, aspect, 10.0f, 4000.0f);\n            Matrix4_lookAt(&smoke_view, &eye, &dir, &(VECTOR3){0, 0, 1});\n            Matrix4_multiply(&smoke_proj, &smoke_view, &cl.viewDef.viewProjectionMatrix);\n            Matrix4_getPreviewLightMatrix(&lightAngles, &target, VIEW_SHADOW_SIZE, &cl.viewDef.lightMatrix);\n        } else\n''',
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
