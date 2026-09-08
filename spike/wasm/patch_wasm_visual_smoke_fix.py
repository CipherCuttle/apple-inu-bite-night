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
# models, not an RTS board. Give the browser smoke a high RTS-style view.
replace(
    "client/cl_view.c",
    '''        if (wasm_smoke) {\n            VECTOR3 target = { 0, 0, 0 };\n            Matrix4_getPreviewCameraMatrix(&target, &cl.viewDef.viewProjectionMatrix);\n            Matrix4_getPreviewLightMatrix(&lightAngles, &target, VIEW_SHADOW_SIZE, &cl.viewDef.lightMatrix);\n        } else\n''',
    '''        if (wasm_smoke) {\n            MATRIX4 smoke_proj, smoke_view;\n            size2_t smoke_window = re.GetWindowSize();\n            VECTOR3 target = { 0, 0, 0 };\n            VECTOR3 eye = { 0.0f, -180.0f, 700.0f };\n            VECTOR3 dir = Vector3_sub(&target, &eye);\n            FLOAT aspect = smoke_window.height > 0\n                ? (FLOAT)smoke_window.width / (FLOAT)smoke_window.height\n                : 1.0f;\n            Matrix4_perspective(&smoke_proj, 45.0f, aspect, 10.0f, 4000.0f);\n            Matrix4_lookAt(&smoke_view, &eye, &dir, &(VECTOR3){0, 0, 1});\n            Matrix4_multiply(&smoke_proj, &smoke_view, &cl.viewDef.viewProjectionMatrix);\n            Matrix4_getPreviewLightMatrix(&lightAngles, &target, VIEW_SHADOW_SIZE, &cl.viewDef.lightMatrix);\n        } else\n''',
)

# MDX draw submission is still exercised below, but the public smoke scene must
# not depend on retail WC3 terrain/material data. Build a visible board using
# OpenRealm's existing renderer-owned splat rectangle primitive. The moving
# marker is positioned from the authoritative client entity snapshot.
replace(
    "client/cl_view.c",
    '''static void CL_AddEntities(void) {\n''',
    '''#ifdef __EMSCRIPTEN__\nstatic void CL_AddWasmSmokeSplats(void) {\n    if (strcmp(cl.configstrings[CS_WORLD], "__wasm_smoke__")) return;\n\n    const int cols = 12;\n    const int rows = 8;\n    const FLOAT cell = 48.0f;\n    const FLOAT minx = -0.5f * cols * cell;\n    const FLOAT miny = -0.5f * rows * cell;\n\n    for (int y = 0; y < rows; y++) {\n        for (int x = 0; x < cols; x++) {\n            if (view_state.num_splat_rects >= MAX_RENDER_SPLAT_RECTS) return;\n            renderSplatRect_t *rect = &view_state.splat_rects[view_state.num_splat_rects++];\n            rect->mins = (VECTOR2){ minx + x * cell, miny + y * cell };\n            rect->maxs = (VECTOR2){ rect->mins.x + cell, rect->mins.y + cell };\n            rect->color = ((x + y) & 1)\n                ? (COLOR32){ 78, 28, 118, 255 }\n                : (COLOR32){ 38, 16, 62, 255 };\n        }\n    }\n\n    FOR_LOOP(i, cl.num_active) {\n        DWORD const number = cl.active_entities[i];\n        entityState_t const *state;\n        if (!number || number >= MAX_CLIENT_ENTITIES) continue;\n        state = &cl.ents[number].current;\n        if (state->class_id != MAKEFOURCC('o', 'p', 'e', 'o')) continue;\n        if (view_state.num_splat_rects >= MAX_RENDER_SPLAT_RECTS) return;\n        renderSplatRect_t *marker = &view_state.splat_rects[view_state.num_splat_rects++];\n        marker->mins = (VECTOR2){ state->origin.x - 18.0f, state->origin.y - 18.0f };\n        marker->maxs = (VECTOR2){ state->origin.x + 18.0f, state->origin.y + 18.0f };\n        marker->color = (COLOR32){ 255, 56, 208, 255 };\n        break;\n    }\n}\n#endif\n\nstatic void CL_AddEntities(void) {\n''',
)
replace(
    "client/cl_view.c",
    '''    CL_AddBuilding();\n    CL_AddCursorSplat();\n\n    cl.viewDef.num_entities = view_state.num_entities;\n''',
    '''    CL_AddBuilding();\n    CL_AddCursorSplat();\n#ifdef __EMSCRIPTEN__\n    CL_AddWasmSmokeSplats();\n#endif\n\n    cl.viewDef.num_entities = view_state.num_entities;\n''',
)

# Strengthen gate 5: renderer-list admission is not enough. Emit smoke evidence
# only from the actual entity draw loop, after visibility/model checks have
# passed and immediately before R_DrawEntity executes.
replace(
    "renderer/r_ents.c",
    '''        if (in_view) {\n            drawn++;\n            R_DrawEntity(ent, shad);\n        } else {\n''',
    '''        if (in_view) {\n            drawn++;\n#ifdef __EMSCRIPTEN__\n            {\n                static BOOL smoke_ground_drawn = false;\n                static BOOL smoke_unit_drawn = false;\n                if (ent->number == 24 && ent->scale > 0.0f && !smoke_ground_drawn) {\n                    fprintf(stderr,\n                            "OPENREALM_MAP_SCENE_DRAW=PASS ent=%u scale=%.3f\\n",\n                            (unsigned)ent->number, ent->scale);\n                    smoke_ground_drawn = true;\n                }\n                if (ent->number == 25 && ent->scale > 0.0f && !smoke_unit_drawn) {\n                    fprintf(stderr,\n                            "OPENREALM_MAP_UNIT_DRAW=PASS ent=%u scale=%.3f x=%.1f\\n",\n                            (unsigned)ent->number, ent->scale, ent->origin.x);\n                    smoke_unit_drawn = true;\n                }\n            }\n#endif\n            R_DrawEntity(ent, shad);\n        } else {\n''',
)
replace(
    "renderer/r_ents.c",
    '''    R_BeginSplatBatch(R_SPLAT_SHADER(&tr.shader_splat));\n''',
    '''#ifdef __EMSCRIPTEN__\n    {\n        static BOOL wasm_splat_reported = false;\n        if (!wasm_splat_reported && tr.viewDef.num_splat_rects >= 96) {\n            fprintf(stderr, "OPENREALM_MAP_SPLAT_DRAW=PASS rects=%u\\n",\n                    (unsigned)tr.viewDef.num_splat_rects);\n            wasm_splat_reported = true;\n        }\n    }\n#endif\n    R_BeginSplatBatch(R_SPLAT_SHADER(&tr.shader_splat));\n''',
)

print("OpenRealm wasm visual smoke repair applied")
