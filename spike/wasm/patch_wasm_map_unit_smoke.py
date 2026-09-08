#!/usr/bin/env python3
from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Game module: browser-only synthetic map. The smoke unit is a real edict,
# spawned through OpenRealm's production WC3 spawn path. Only map/world data is
# synthetic; server authority and snapshot transport remain untouched.
# ---------------------------------------------------------------------------
g_main = Path("games/warcraft-3/game/g_main.c")
text = g_main.read_text()
anchor = '''static BOOL starting_resource_cheat_armed;
static DWORD starting_resource_cheat_applied_mask;
static DWORD starting_resource_cheat_deferred_mask;
'''
insert = '''static BOOL starting_resource_cheat_armed;
static DWORD starting_resource_cheat_applied_mask;
static DWORD starting_resource_cheat_deferred_mask;

#ifdef __EMSCRIPTEN__
#define WASM_MAP_UNIT_SMOKE_NAME "__wasm_smoke__"
#define WASM_MAP_UNIT_SMOKE_CLASS MAKEFOURCC('o', 'p', 'e', 'o')
#define WASM_MAP_SCENE_CLASS MAKEFOURCC('g', 'r', 'i', 'd')
static BOOL wasm_map_unit_smoke;
static LPEDICT wasm_map_unit_smoke_unit;
static LPEDICT wasm_map_unit_smoke_ground;
static FLOAT wasm_map_unit_smoke_direction = 1.0f;

static BOOL G_WasmMapUnitSmokeCanSeeEntity(DWORD player, LPCEDICT ent) {
    (void)player;
    if (wasm_map_unit_smoke) return ent && ent->inuse;
    return G_FowPlayerCanSeeEntity(player, ent);
}

static bool G_LoadWasmMapUnitSmoke(LPCSTR mapFilename) {
    VECTOR2 spawn = { -140.0f, 0.0f };
    LPEDICT ground;

    wasm_map_unit_smoke = true;
    wasm_map_unit_smoke_unit = NULL;
    wasm_map_unit_smoke_ground = NULL;
    wasm_map_unit_smoke_direction = 1.0f;

    G_FreeModels();
    G_MusicResetState();
    G_SetMapUnitOverrides(NULL);
    memset(&level, 0, sizeof(level));
    level.started = true;
    level.scriptsStarted = true;
    level.time = gi.GetTime();
    strlcpy(level.map_path, mapFilename, sizeof(level.map_path));

    /* Recreate the same client-edict ownership that G_SpawnEntities establishes,
     * without fabricating a W3I/terrain archive. The actual server handshake
     * still owns connection state and invokes ClientBegin below. */
    memset(game.clients, 0, sizeof(*game.clients) * game.max_clients);
    FOR_LOOP(p, game.max_clients) {
        memset(&g_edicts[p], 0, sizeof(g_edicts[p]));
        g_edicts[p].s.number = (int)p;
        g_edicts[p].client = game.clients + p;
        game.clients[p].ps.number = p;
        game.clients[p].ps.client_ui_state = CLIENT_UI_LOADING;
        game.clients[p].ps.fov = 45.0f;
        game.clients[p].ps.znear = 10.0f;
        game.clients[p].ps.zfar = 4000.0f;
    }
    globals.num_edicts = game.max_clients;

    /* The server spatial index is real even though the synthetic world bounds
     * collapse to zero without terrain. It is sufficient for these linked
     * smoke entities and keeps the normal LinkEntity boundary exercised. */
    gi.ClearWorld();

    ground = G_Spawn();
    if (!ground) return false;
    ground->s.class_id = ground->class_id = WASM_MAP_SCENE_CLASS;
    ground->s.model = G_RegisterModel("TestUI\\\\Models\\\\wasm_smoke_ground.mdx");
    ground->s.scale = 620.0f;
    ground->s.origin = (VECTOR3){ 0.0f, 0.0f, -12.0f };
    ground->s.player = PLAYER_NEUTRAL_PASSIVE;
    ground->svflags |= SVF_STATIC_SCENERY;
    gi.LinkEntity(ground);
    wasm_map_unit_smoke_ground = ground;

    wasm_map_unit_smoke_unit = SP_SpawnAtLocation(WASM_MAP_UNIT_SMOKE_CLASS, 0, &spawn);
    if (!wasm_map_unit_smoke_unit || !wasm_map_unit_smoke_unit->s.model || !ground->s.model) {
        fprintf(stderr,
                "OPENREALM_MAP_UNIT_SMOKE_SERVER=FAIL unit=%p unit_model=%u ground_model=%u\\n",
                (void *)wasm_map_unit_smoke_unit,
                (unsigned)(wasm_map_unit_smoke_unit ? wasm_map_unit_smoke_unit->s.model : 0),
                (unsigned)ground->s.model);
        return false;
    }

    /* OpenRealm's repository-owned test UnitUI intentionally leaves visual
     * scale unset. Make the smoke presentation explicit after production spawn;
     * identity, HP, movement speed, collision, model registration and lifecycle
     * still came from the real WC3 row/spawn path. */
    wasm_map_unit_smoke_unit->s.scale = 92.0f;
    wasm_map_unit_smoke_unit->s.radius = 36.0f;
    wasm_map_unit_smoke_unit->collision = 16.0f;
    wasm_map_unit_smoke_unit->s.collision = 16.0f;
    wasm_map_unit_smoke_unit->s.origin.z = 8.0f;
    wasm_map_unit_smoke_unit->think = NULL;
    gi.LinkEntity(wasm_map_unit_smoke_unit);

    fprintf(stderr,
            "OPENREALM_MAP_UNIT_SMOKE_SERVER=PASS ent=%d class=%.4s model=%u hp=%.1f speed=%.1f x=%.1f\\n",
            wasm_map_unit_smoke_unit->s.number,
            (LPCSTR)&wasm_map_unit_smoke_unit->s.class_id,
            (unsigned)wasm_map_unit_smoke_unit->s.model,
            wasm_map_unit_smoke_unit->health.value,
            wasm_map_unit_smoke_unit->unitinfo.MoveSpeed,
            wasm_map_unit_smoke_unit->s.origin.x);
    fprintf(stderr,
            "OPENREALM_MAP_SCENE_SERVER=PASS ent=%d model=%u scale=%.1f\\n",
            ground->s.number, (unsigned)ground->s.model, ground->s.scale);
    return true;
}
#endif
'''
if text.count(anchor) != 1:
    raise SystemExit("g_main.c: smoke globals anchor mismatch")
text = text.replace(anchor, insert, 1)
g_main.write_text(text)

replace(
    "games/warcraft-3/game/g_main.c",
    '''static bool G_LoadMap(LPCSTR mapFilename) {
    if (!CM_LoadMap(mapFilename)) {
''',
    '''static bool G_LoadMap(LPCSTR mapFilename) {
#ifdef __EMSCRIPTEN__
    if (mapFilename && !strcmp(mapFilename, WASM_MAP_UNIT_SMOKE_NAME)) {
        return G_LoadWasmMapUnitSmoke(mapFilename);
    }
    wasm_map_unit_smoke = false;
    wasm_map_unit_smoke_unit = NULL;
    wasm_map_unit_smoke_ground = NULL;
#endif
    if (!CM_LoadMap(mapFilename)) {
''',
)

replace(
    "games/warcraft-3/game/g_main.c",
    '''static void G_RunFrame(void) {
    int path_work_budget = WC3_PATH_WORK_BUDGET;
    LPCSTR path_work_value;

    if (!level.started)
        return;

    level.framenum++;
    level.time = gi.GetTime();

    G_StartScripts();
''',
    '''static void G_RunFrame(void) {
    int path_work_budget = WC3_PATH_WORK_BUDGET;
    LPCSTR path_work_value;

    if (!level.started)
        return;

    level.framenum++;
    level.time = gi.GetTime();

#ifdef __EMSCRIPTEN__
    if (wasm_map_unit_smoke) {
        static DWORD last_report_frame;
        if (!wasm_map_unit_smoke_unit || !wasm_map_unit_smoke_unit->inuse) return;
        wasm_map_unit_smoke_unit->s.origin.x += 4.0f * wasm_map_unit_smoke_direction;
        if (wasm_map_unit_smoke_unit->s.origin.x >= 140.0f) wasm_map_unit_smoke_direction = -1.0f;
        if (wasm_map_unit_smoke_unit->s.origin.x <= -140.0f) wasm_map_unit_smoke_direction = 1.0f;
        gi.LinkEntity(wasm_map_unit_smoke_unit);
        if (!last_report_frame || level.framenum - last_report_frame >= 20) {
            fprintf(stderr,
                    "OPENREALM_MAP_UNIT_SMOKE_SERVER_TICK frame=%u ent=%d x=%.1f\\n",
                    (unsigned)level.framenum,
                    wasm_map_unit_smoke_unit->s.number,
                    wasm_map_unit_smoke_unit->s.origin.x);
            last_report_frame = level.framenum;
        }
        return;
    }
#endif

    G_StartScripts();
''',
)

replace(
    "games/warcraft-3/game/g_main.c",
    '''static void G_ClientBegin(LPEDICT edict) {
    LPGAMECLIENT client = edict->client ? edict->client : game.clients;
    if (!edict->client) {
        edict->client = client;
    }

    G_SetClientConnected(edict, true);
    G_InitClientUIState(client);
''',
    '''static void G_ClientBegin(LPEDICT edict) {
    LPGAMECLIENT client = edict->client ? edict->client : game.clients;
    if (!edict->client) {
        edict->client = client;
    }

    G_SetClientConnected(edict, true);
    G_InitClientUIState(client);
#ifdef __EMSCRIPTEN__
    if (wasm_map_unit_smoke) {
        client->ps.client_ui_state = CLIENT_UI_GAME;
        level.started = true;
        fprintf(stderr,
                "OPENREALM_MAP_UNIT_SMOKE_CLIENT_BEGIN=PASS player=%u edict=%u\\n",
                (unsigned)client->ps.number,
                (unsigned)(edict - globals.edicts));
        return;
    }
#endif
''',
)

replace(
    "games/warcraft-3/game/g_main.c",
    '''static void G_ClientLoading(LPEDICT edict) { UI_WriteLoadingLayout(edict); }
''',
    '''static void G_ClientLoading(LPEDICT edict) {
#ifdef __EMSCRIPTEN__
    if (wasm_map_unit_smoke) return;
#endif
    UI_WriteLoadingLayout(edict);
}
''',
)

replace(
    "games/warcraft-3/game/g_main.c",
    '''static void G_CustomizeEntity(DWORD player, LPCEDICT ent, LPENTITYSTATE state) {
    BOOL const hoverable = (ent->svflags & SVF_MONSTER) &&
''',
    '''static void G_CustomizeEntity(DWORD player, LPCEDICT ent, LPENTITYSTATE state) {
#ifdef __EMSCRIPTEN__
    if (wasm_map_unit_smoke) {
        (void)player;
        (void)ent;
        (void)state;
        return;
    }
#endif
    BOOL const hoverable = (ent->svflags & SVF_MONSTER) &&
''',
)

replace(
    "games/warcraft-3/game/g_main.c",
    '''    globals.CanSeeEntity = G_FowPlayerCanSeeEntity;
''',
    '''#ifdef __EMSCRIPTEN__
    globals.CanSeeEntity = G_WasmMapUnitSmokeCanSeeEntity;
#else
    globals.CanSeeEntity = G_FowPlayerCanSeeEntity;
#endif
''',
)

# ---------------------------------------------------------------------------
# Client: the pseudo map deliberately has no WC3 terrain archive. Treat it as a
# registered no-world-model scene, then prove packet parsing and renderer
# collection independently for both the checker ground and moving unit.
# ---------------------------------------------------------------------------
replace(
    "client/cl_view.c",
    '''void CL_PrepRefresh(void) {
    if (!cl.layout[LAYER_LOADING]) return;
    if (!*cl.configstrings[CS_WORLD]) {
''',
    '''void CL_PrepRefresh(void) {
#ifdef __EMSCRIPTEN__
    BOOL const wasm_smoke = !strcmp(cl.configstrings[CS_WORLD], "__wasm_smoke__");
    if (!cl.layout[LAYER_LOADING] && !wasm_smoke) return;
#else
    BOOL const wasm_smoke = false;
    if (!cl.layout[LAYER_LOADING]) return;
#endif
    if (!*cl.configstrings[CS_WORLD]) {
''',
)

replace(
    "client/cl_view.c",
    '''    if (!world_loaded) {
        if (!CM_IsMapLoaded(cl.configstrings[CS_WORLD])) {
            CM_LoadMap(cl.configstrings[CS_WORLD]);
        }
        re.RegisterMap(cl.configstrings[CS_WORLD]);
        world_loaded = true;
    }
''',
    '''    if (!world_loaded) {
#ifdef __EMSCRIPTEN__
        if (!wasm_smoke) {
#endif
            if (!CM_IsMapLoaded(cl.configstrings[CS_WORLD])) {
                CM_LoadMap(cl.configstrings[CS_WORLD]);
            }
            re.RegisterMap(cl.configstrings[CS_WORLD]);
#ifdef __EMSCRIPTEN__
        } else {
            fprintf(stderr, "OPENREALM_MAP_SCENE_CLIENT_PREP=PASS no-terrain-archive\\n");
        }
#endif
        world_loaded = true;
    }
''',
)

replace(
    "client/cl_view.c",
    '''        cl.viewDef.rdflags = cl.playerstate.rdflags;
        cl.viewDef.player = cl.playerstate.number;
        cl.viewDef.hover_entity = cl.hover_entity;
''',
    '''#ifdef __EMSCRIPTEN__
        if (wasm_smoke) {
            cl.viewDef.viewport = (RECT){ 0, 0, 1, 1 };
            cl.viewDef.scissor = cl.viewDef.viewport;
            cl.viewDef.rdflags = RDF_NOWORLDMODEL | RDF_NOFRUSTUMCULL | RDF_NOFOG;
        } else
#endif
        {
            cl.viewDef.rdflags = cl.playerstate.rdflags;
        }
        cl.viewDef.player = cl.playerstate.number;
        cl.viewDef.hover_entity = cl.hover_entity;
''',
)

replace(
    "client/cl_view.c",
    '''        Matrix4_getCameraMatrix(&cl.viewDef.viewProjectionMatrix);
        Matrix4_getLightMatrix(&lightAngles, VIEW_SHADOW_SIZE, &cl.viewDef.lightMatrix);

        V_ClearScene();
''',
    '''#ifdef __EMSCRIPTEN__
        if (wasm_smoke) {
            VECTOR3 target = { 0, 0, 0 };
            Matrix4_getPreviewCameraMatrix(&target, &cl.viewDef.viewProjectionMatrix);
            Matrix4_getPreviewLightMatrix(&lightAngles, &target, VIEW_SHADOW_SIZE, &cl.viewDef.lightMatrix);
        } else
#endif
        {
            Matrix4_getCameraMatrix(&cl.viewDef.viewProjectionMatrix);
            Matrix4_getLightMatrix(&lightAngles, VIEW_SHADOW_SIZE, &cl.viewDef.lightMatrix);
        }

        V_ClearScene();
''',
)

# `wasm_smoke` above is local to CL_PrepRefresh, so create the render-time flag
# in V_RenderView as a separate exact map-name check.
replace(
    "client/cl_view.c",
    '''void V_RenderView(void) {
    static DWORD lastTime = 0;
    BOOL rebuild;
''',
    '''void V_RenderView(void) {
    static DWORD lastTime = 0;
    BOOL rebuild;
#ifdef __EMSCRIPTEN__
    BOOL const wasm_smoke = !strcmp(cl.configstrings[CS_WORLD], "__wasm_smoke__");
#else
    BOOL const wasm_smoke = false;
#endif
''',
)

replace(
    "client/cl_view.c",
    '''    view_state.entities[view_state.num_entities++] = re;

    if (ent->current.model2 > 0) {
''',
    '''    view_state.entities[view_state.num_entities++] = re;
#ifdef __EMSCRIPTEN__
    if (ent->current.class_id == MAKEFOURCC('o', 'p', 'e', 'o') ||
        ent->current.class_id == MAKEFOURCC('g', 'r', 'i', 'd')) {
        static FLOAT last_unit_x = -99999.0f;
        static BOOL scene_reported;
        if (ent->current.class_id == MAKEFOURCC('g', 'r', 'i', 'd') && !scene_reported && re.model) {
            fprintf(stderr,
                    "OPENREALM_MAP_SCENE_RENDER=PASS ent=%u model=%p scale=%.1f\\n",
                    (unsigned)ent->current.number, (void *)re.model, re.scale);
            scene_reported = true;
        }
        if (ent->current.class_id == MAKEFOURCC('o', 'p', 'e', 'o') && re.model &&
            fabsf(ent->current.origin.x - last_unit_x) >= 8.0f) {
            fprintf(stderr,
                    "OPENREALM_MAP_UNIT_RENDER ent=%u model=%p x=%.1f\\n",
                    (unsigned)ent->current.number, (void *)re.model, ent->current.origin.x);
            last_unit_x = ent->current.origin.x;
        }
    }
#endif

    if (ent->current.model2 > 0) {
''',
)

replace(
    "client/cl_parse.c",
    '''        MSG_ReadDeltaEntity(msg, &ent->current, nument, bits);
        /* Keep the active list in sync with current.model on both transitions:
''',
    '''        MSG_ReadDeltaEntity(msg, &ent->current, nument, bits);
#ifdef __EMSCRIPTEN__
        if (ent->current.class_id == MAKEFOURCC('o', 'p', 'e', 'o')) {
            static FLOAT last_smoke_x = -99999.0f;
            if (fabsf(ent->current.origin.x - last_smoke_x) >= 8.0f) {
                fprintf(stderr,
                        "OPENREALM_MAP_UNIT_CLIENT frame=%d ent=%d model=%u x=%.1f\\n",
                        cl.frame.serverframe, nument,
                        (unsigned)ent->current.model,
                        ent->current.origin.x);
                last_smoke_x = ent->current.origin.x;
            }
        }
#endif
        /* Keep the active list in sync with current.model on both transitions:
''',
)

print("OpenRealm authoritative wasm map-unit smoke overlay applied")
