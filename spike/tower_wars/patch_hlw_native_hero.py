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
# Game module: two real native hero edicts. Unlike the H1 creep mirror, hero
# position is authoritative here. Both seats use the same actor-indexed command
# function, and movement advances only from the explicit deterministic tick.
# ---------------------------------------------------------------------------
g_main = Path("games/warcraft-3/game/g_main.c")
text = g_main.read_text()
anchor = '''BOOL HLW_OpenRealmIsPresentationEntityNumber(DWORD number) {
    if (!number) return false;
    FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
        LPCEDICT ent = hlw_native_creeps[i].ent;
        if (ent && ent->inuse && (DWORD)ent->s.number == number) return true;
    }
    return false;
}
#endif
'''
insert = '''BOOL HLW_OpenRealmIsPresentationEntityNumber(DWORD number) {
    if (!number) return false;
    FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
        LPCEDICT ent = hlw_native_creeps[i].ent;
        if (ent && ent->inuse && (DWORD)ent->s.number == number) return true;
    }
    return false;
}

#define HLW_NATIVE_HERO_CLASS MAKEFOURCC('h', 'l', 'w', 'h')
#define HLW_NATIVE_HERO_COUNT 2
#define HLW_NATIVE_HERO_STEP 8.0f
#define HLW_NATIVE_HERO_MIN_X -160
#define HLW_NATIVE_HERO_MAX_X 160
#define HLW_NATIVE_HERO_P0_MIN_Y -160
#define HLW_NATIVE_HERO_P0_MAX_Y -24
#define HLW_NATIVE_HERO_P1_MIN_Y 24
#define HLW_NATIVE_HERO_P1_MAX_Y 160

typedef struct {
    LPEDICT ent;
    VECTOR2 goal;
    BOOL has_goal;
} hlwNativeHero_t;

static hlwNativeHero_t hlw_native_heroes[HLW_NATIVE_HERO_COUNT];

static BOOL HLW_HeroTargetValid(BYTE actor, int x, int y) {
    if (actor >= HLW_NATIVE_HERO_COUNT) return false;
    if (x < HLW_NATIVE_HERO_MIN_X || x > HLW_NATIVE_HERO_MAX_X) return false;
    if (actor == 0) {
        return y >= HLW_NATIVE_HERO_P0_MIN_Y && y <= HLW_NATIVE_HERO_P0_MAX_Y;
    }
    return y >= HLW_NATIVE_HERO_P1_MIN_Y && y <= HLW_NATIVE_HERO_P1_MAX_Y;
}

static void HLW_FreeHero(BYTE actor) {
    if (actor >= HLW_NATIVE_HERO_COUNT) return;
    hlwNativeHero_t *hero = &hlw_native_heroes[actor];
    if (hero->ent && hero->ent->inuse) G_FreeEdict(hero->ent);
    memset(hero, 0, sizeof(*hero));
}

int HLW_OpenRealmHeroReset(void) {
    if (!wasm_map_unit_smoke) return 0;
    FOR_LOOP(i, HLW_NATIVE_HERO_COUNT) HLW_FreeHero((BYTE)i);

    static VECTOR3 const starts[HLW_NATIVE_HERO_COUNT] = {
        { -120.0f, -140.0f, 12.0f },
        {  120.0f,  140.0f, 12.0f },
    };

    FOR_LOOP(i, HLW_NATIVE_HERO_COUNT) {
        LPEDICT ent = G_Spawn();
        if (!ent) {
            FOR_LOOP(j, HLW_NATIVE_HERO_COUNT) HLW_FreeHero((BYTE)j);
            return 0;
        }
        ent->s.class_id = ent->class_id = HLW_NATIVE_HERO_CLASS;
        ent->s.model = G_RegisterModel("TestUI\\\\Models\\\\anim_pulse.mdx");
        if (!ent->s.model) {
            G_FreeEdict(ent);
            FOR_LOOP(j, HLW_NATIVE_HERO_COUNT) HLW_FreeHero((BYTE)j);
            return 0;
        }
        ent->s.scale = 18.0f;
        ent->s.radius = 24.0f;
        ent->s.player = (BYTE)i;
        ent->s.origin = starts[i];
        ent->collision = 16.0f;
        ent->s.collision = 16.0f;
        ent->think = NULL;
        gi.LinkEntity(ent);
        hlw_native_heroes[i].ent = ent;
        hlw_native_heroes[i].goal = *(LPCVECTOR2)&starts[i];
        hlw_native_heroes[i].has_goal = false;
        fprintf(stderr,
                "HLW_NATIVE_HERO_SERVER=SPAWN actor=%u ent=%u world=%.1f,%.1f\\n",
                (unsigned)i,
                (unsigned)ent->s.number,
                ent->s.origin.x,
                ent->s.origin.y);
    }

    fprintf(stderr,
            "HLW_NATIVE_HERO_RESET=PASS ent0=%u ent1=%u\\n",
            (unsigned)hlw_native_heroes[0].ent->s.number,
            (unsigned)hlw_native_heroes[1].ent->s.number);
    return 1;
}

int HLW_OpenRealmHeroCommandMove(BYTE actor, int x, int y) {
    if (!wasm_map_unit_smoke || !HLW_HeroTargetValid(actor, x, y)) return 0;
    hlwNativeHero_t *hero = &hlw_native_heroes[actor];
    if (!hero->ent || !hero->ent->inuse) return 0;
    hero->goal = (VECTOR2){ (FLOAT)x, (FLOAT)y };
    hero->has_goal = true;
    fprintf(stderr,
            "HLW_NATIVE_HERO_COMMAND=PASS actor=%u ent=%u goal=%d,%d\\n",
            (unsigned)actor,
            (unsigned)hero->ent->s.number,
            x, y);
    return 1;
}

static FLOAT HLW_MoveAxis(FLOAT current, FLOAT target) {
    if (current < target) return MIN(current + HLW_NATIVE_HERO_STEP, target);
    if (current > target) return MAX(current - HLW_NATIVE_HERO_STEP, target);
    return current;
}

int HLW_OpenRealmHeroStep(DWORD ticks) {
    if (!wasm_map_unit_smoke) return 0;
    FOR_LOOP(i, HLW_NATIVE_HERO_COUNT) {
        if (!hlw_native_heroes[i].ent || !hlw_native_heroes[i].ent->inuse) return 0;
    }

    FOR_LOOP(t, ticks) {
        FOR_LOOP(i, HLW_NATIVE_HERO_COUNT) {
            hlwNativeHero_t *hero = &hlw_native_heroes[i];
            if (!hero->has_goal) continue;
            LPEDICT ent = hero->ent;
            if (ent->s.origin.x != hero->goal.x) {
                ent->s.origin.x = HLW_MoveAxis(ent->s.origin.x, hero->goal.x);
            } else if (ent->s.origin.y != hero->goal.y) {
                ent->s.origin.y = HLW_MoveAxis(ent->s.origin.y, hero->goal.y);
            }
            if (ent->s.origin.x == hero->goal.x && ent->s.origin.y == hero->goal.y) {
                hero->has_goal = false;
            }
        }
    }

    FOR_LOOP(i, HLW_NATIVE_HERO_COUNT) {
        hlwNativeHero_t *hero = &hlw_native_heroes[i];
        gi.LinkEntity(hero->ent);
        fprintf(stderr,
                "HLW_NATIVE_HERO_SERVER=MOVE actor=%u ent=%u world=%.1f,%.1f goal=%s\\n",
                (unsigned)i,
                (unsigned)hero->ent->s.number,
                hero->ent->s.origin.x,
                hero->ent->s.origin.y,
                hero->has_goal ? "ACTIVE" : "REACHED");
    }
    return 1;
}

DWORD HLW_OpenRealmHeroEntityNumber(BYTE actor) {
    if (actor >= HLW_NATIVE_HERO_COUNT) return 0;
    LPCEDICT ent = hlw_native_heroes[actor].ent;
    return ent && ent->inuse ? (DWORD)ent->s.number : 0;
}

int HLW_OpenRealmHeroX(BYTE actor) {
    if (actor >= HLW_NATIVE_HERO_COUNT) return 0;
    LPCEDICT ent = hlw_native_heroes[actor].ent;
    return ent && ent->inuse ? (int)ent->s.origin.x : 0;
}

int HLW_OpenRealmHeroY(BYTE actor) {
    if (actor >= HLW_NATIVE_HERO_COUNT) return 0;
    LPCEDICT ent = hlw_native_heroes[actor].ent;
    return ent && ent->inuse ? (int)ent->s.origin.y : 0;
}

BOOL HLW_OpenRealmIsHeroEntityNumber(DWORD number) {
    if (!number) return false;
    FOR_LOOP(i, HLW_NATIVE_HERO_COUNT) {
        LPCEDICT ent = hlw_native_heroes[i].ent;
        if (ent && ent->inuse && (DWORD)ent->s.number == number) return true;
    }
    return false;
}
#endif
'''
count = text.count(anchor)
if count != 1:
    raise SystemExit(f"g_main.c: expected H1 tail anchor once, got {count}")
g_main.write_text(text.replace(anchor, insert, 1))

# Client proof: the native hero class must arrive through the normal snapshot
# and be converted into renderEntity_t. Log only position changes per actor.
replace(
    "client/cl_view.c",
    '''    re.splat = cl.pics[ent->current.splat & 0xffff];
''',
    '''#ifdef __EMSCRIPTEN__
    if (ent->current.class_id == MAKEFOURCC('h', 'l', 'w', 'h')) {
        static VECTOR2 last_hero[2] = {
            { -99999.0f, -99999.0f }, { -99999.0f, -99999.0f }
        };
        DWORD const actor = ent->current.player < 2 ? ent->current.player : 0;
        if (fabsf(re.origin.x - last_hero[actor].x) >= 1.0f ||
            fabsf(re.origin.y - last_hero[actor].y) >= 1.0f) {
            fprintf(stderr,
                    "HLW_NATIVE_HERO_CLIENT=PASS actor=%u ent=%u world=%.1f,%.1f model=%u\\n",
                    (unsigned)actor,
                    (unsigned)ent->current.number,
                    re.origin.x,
                    re.origin.y,
                    (unsigned)ent->current.model);
            last_hero[actor] = *(LPCVECTOR2)&re.origin;
        }
    }
#endif
    re.splat = cl.pics[ent->current.splat & 0xffff];
''',
)

# Renderer proof: same native entity number must reach the actual draw call.
replace(
    "renderer/r_ents.c",
    '''            R_DrawEntity(ent, shad);
''',
    '''#ifdef __EMSCRIPTEN__
            extern BOOL HLW_OpenRealmIsHeroEntityNumber(DWORD number);
            if (HLW_OpenRealmIsHeroEntityNumber(ent->number)) {
                static VECTOR2 last_hero_draw[2] = {
                    { -99999.0f, -99999.0f }, { -99999.0f, -99999.0f }
                };
                DWORD const slot = ent->team < 2 ? ent->team : 0;
                if (fabsf(ent->origin.x - last_hero_draw[slot].x) >= 1.0f ||
                    fabsf(ent->origin.y - last_hero_draw[slot].y) >= 1.0f) {
                    fprintf(stderr,
                            "HLW_NATIVE_HERO_DRAW=PASS actor=%u ent=%u world=%.1f,%.1f scale=%.1f\\n",
                            (unsigned)slot,
                            (unsigned)ent->number,
                            ent->origin.x,
                            ent->origin.y,
                            ent->scale);
                    last_hero_draw[slot] = *(LPCVECTOR2)&ent->origin;
                }
            }
#endif
            R_DrawEntity(ent, shad);
''',
)

print("Hero Line Wars native hero command authority applied")
