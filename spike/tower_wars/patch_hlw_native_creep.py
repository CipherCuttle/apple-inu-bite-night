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
# Game module: presentation-only mirrors of authoritative tw_session creeps.
# These edicts have no think/combat/economy authority. The Tower Wars session
# pushes the complete active-creep set after each accepted simulation step.
# ---------------------------------------------------------------------------
g_main = Path("games/warcraft-3/game/g_main.c")
text = g_main.read_text()
anchor = '''    fprintf(stderr,
            "OPENREALM_MAP_SCENE_SERVER=PASS ent=%d model=%u scale=%.1f\\n",
            ground->s.number, (unsigned)ground->s.model, ground->s.scale);
    return true;
}
#endif
'''
insert = '''    fprintf(stderr,
            "OPENREALM_MAP_SCENE_SERVER=PASS ent=%d model=%u scale=%.1f\\n",
            ground->s.number, (unsigned)ground->s.model, ground->s.scale);
    return true;
}

#define HLW_NATIVE_CREEP_CLASS MAKEFOURCC('h', 'l', 'w', 'c')
#define HLW_NATIVE_PRESENTATION_MAX 64

typedef struct {
    DWORD creep_id;
    DWORD seen_epoch;
    LPEDICT ent;
} hlwNativeCreepSlot_t;

static hlwNativeCreepSlot_t hlw_native_creeps[HLW_NATIVE_PRESENTATION_MAX];
static DWORD hlw_native_epoch = 1;

static void HLW_FreePresentationSlot(hlwNativeCreepSlot_t *slot) {
    if (!slot) return;
    if (slot->ent && slot->ent->inuse) {
        fprintf(stderr,
                "HLW_NATIVE_CREEP_SERVER=REMOVE creep=%u ent=%u\\n",
                (unsigned)slot->creep_id,
                (unsigned)slot->ent->s.number);
        G_FreeEdict(slot->ent);
    }
    memset(slot, 0, sizeof(*slot));
}

int HLW_OpenRealmPresentationReset(void) {
    if (!wasm_map_unit_smoke) return 0;
    FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
        HLW_FreePresentationSlot(&hlw_native_creeps[i]);
    }
    hlw_native_epoch = 1;
    fprintf(stderr, "HLW_NATIVE_PRESENTATION_RESET=PASS\\n");
    return 1;
}

int HLW_OpenRealmPresentationBegin(void) {
    if (!wasm_map_unit_smoke) return 0;
    hlw_native_epoch++;
    if (hlw_native_epoch == 0) {
        hlw_native_epoch = 1;
        FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
            hlw_native_creeps[i].seen_epoch = 0;
        }
    }
    return 1;
}

static hlwNativeCreepSlot_t *HLW_FindPresentationSlot(DWORD creep_id) {
    hlwNativeCreepSlot_t *empty = NULL;
    FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
        hlwNativeCreepSlot_t *slot = &hlw_native_creeps[i];
        if (slot->creep_id == creep_id && slot->ent && slot->ent->inuse) return slot;
        if (!empty && slot->creep_id == 0) empty = slot;
    }
    return empty;
}

int HLW_OpenRealmPresentationSyncCreep(DWORD creep_id,
                                       BYTE target,
                                       BYTE kind,
                                       BYTE cell_x,
                                       BYTE cell_y,
                                       USHORT progress_milli,
                                       DWORD hit_points) {
    (void)kind;
    (void)progress_milli;
    (void)hit_points;
    if (!wasm_map_unit_smoke || creep_id == 0 || target > 1) return 0;

    hlwNativeCreepSlot_t *slot = HLW_FindPresentationSlot(creep_id);
    if (!slot) return 0;

    BOOL spawned = false;
    if (!slot->creep_id) {
        LPEDICT ent = G_Spawn();
        if (!ent) return 0;
        ent->s.class_id = ent->class_id = HLW_NATIVE_CREEP_CLASS;
        ent->s.model = G_RegisterModel("TestUI\\\\Models\\\\anim_pulse.mdx");
        if (!ent->s.model) {
            G_FreeEdict(ent);
            return 0;
        }
        ent->s.scale = 14.0f;
        ent->s.radius = 18.0f;
        ent->s.player = target;
        ent->think = NULL;
        slot->creep_id = creep_id;
        slot->ent = ent;
        spawned = true;
    }

    LPEDICT ent = slot->ent;
    if (!ent || !ent->inuse) return 0;
    ent->s.player = target;
    ent->s.origin = (VECTOR3){
        .x = -160.0f + (FLOAT)cell_x * 40.0f,
        .y = (target ? 82.0f : -82.0f) + ((FLOAT)cell_y - 3.0f) * 22.0f,
        .z = 12.0f,
    };
    gi.LinkEntity(ent);
    slot->seen_epoch = hlw_native_epoch;

    fprintf(stderr,
            "HLW_NATIVE_CREEP_SERVER=%s creep=%u ent=%u cell=%u,%u world=%.1f,%.1f\\n",
            spawned ? "SPAWN" : "SYNC",
            (unsigned)creep_id,
            (unsigned)ent->s.number,
            (unsigned)cell_x,
            (unsigned)cell_y,
            ent->s.origin.x,
            ent->s.origin.y);
    return 1;
}

int HLW_OpenRealmPresentationEnd(void) {
    if (!wasm_map_unit_smoke) return 0;
    FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
        hlwNativeCreepSlot_t *slot = &hlw_native_creeps[i];
        if (slot->creep_id && slot->seen_epoch != hlw_native_epoch) {
            HLW_FreePresentationSlot(slot);
        }
    }
    return 1;
}

BOOL HLW_OpenRealmIsPresentationEntityNumber(DWORD number) {
    if (!number) return false;
    FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
        LPCEDICT ent = hlw_native_creeps[i].ent;
        if (ent && ent->inuse && (DWORD)ent->s.number == number) return true;
    }
    return false;
}
#endif
'''
count = text.count(anchor)
if count != 1:
    raise SystemExit(f"g_main.c: expected native presentation anchor once, got {count}")
g_main.write_text(text.replace(anchor, insert, 1))

# ---------------------------------------------------------------------------
# Client proof: class_id arrived in a normal entity snapshot and was converted
# into the renderer-facing renderEntity_t. The class marker itself is never
# manufactured by JS.
# ---------------------------------------------------------------------------
replace(
    "client/cl_view.c",
    '''    re.radius = ent->current.radius;
    re.number = ent->current.number;
    re.splat = cl.pics[ent->current.splat & 0xffff];
''',
    '''    re.radius = ent->current.radius;
    re.number = ent->current.number;
#ifdef __EMSCRIPTEN__
    if (ent->current.class_id == MAKEFOURCC('h', 'l', 'w', 'c')) {
        fprintf(stderr,
                "HLW_NATIVE_CREEP_CLIENT=PASS ent=%u world=%.1f,%.1f model=%u\\n",
                (unsigned)ent->current.number,
                re.origin.x,
                re.origin.y,
                (unsigned)ent->current.model);
    }
#endif
    re.splat = cl.pics[ent->current.splat & 0xffff];
''',
)

# ---------------------------------------------------------------------------
# Renderer proof: hook the surviving renderer draw call itself, rather than the
# surrounding block, because the earlier visual-smoke overlay also instruments
# that block before this patch runs. The exact edict number must still reach the
# real R_DrawEntity path after model/frustum validation.
# ---------------------------------------------------------------------------
replace(
    "renderer/r_ents.c",
    '''            R_DrawEntity(ent, shad);
''',
    '''#ifdef __EMSCRIPTEN__
            extern BOOL HLW_OpenRealmIsPresentationEntityNumber(DWORD number);
            if (HLW_OpenRealmIsPresentationEntityNumber(ent->number)) {
                fprintf(stderr,
                        "HLW_NATIVE_CREEP_DRAW=PASS ent=%u world=%.1f,%.1f scale=%.1f\\n",
                        (unsigned)ent->number,
                        ent->origin.x,
                        ent->origin.y,
                        ent->scale);
            }
#endif
            R_DrawEntity(ent, shad);
''',
)

print("Hero Line Wars native creep presentation bridge applied")
