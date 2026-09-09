#!/usr/bin/env python3
from pathlib import Path

path = Path("games/warcraft-3/game/g_main.c")
text = path.read_text()

old = '''static void HLW_FreeHero(BYTE actor) {
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
'''

new = '''static BOOL HLW_ResetHeroEntity(BYTE actor, LPCVECTOR3 start) {
    hlwNativeHero_t *hero;
    LPEDICT ent;
    DWORD model;
    BOOL spawned = false;

    if (actor >= HLW_NATIVE_HERO_COUNT || !start) return false;
    hero = &hlw_native_heroes[actor];
    ent = hero->ent;
    if (!ent || !ent->inuse) {
        ent = G_Spawn();
        if (!ent) return false;
        spawned = true;
    } else {
        gi.UnlinkEntity(ent);
    }

    model = G_RegisterModel("TestUI\\\\Models\\\\anim_pulse.mdx");
    if (!model) {
        if (spawned) G_FreeEdict(ent);
        return false;
    }

    ent->s.class_id = ent->class_id = HLW_NATIVE_HERO_CLASS;
    ent->s.model = model;
    ent->s.scale = 18.0f;
    ent->s.radius = 24.0f;
    ent->s.player = actor;
    ent->s.origin = *start;
    ent->collision = 16.0f;
    ent->s.collision = 16.0f;
    ent->think = NULL;
    gi.LinkEntity(ent);

    hero->ent = ent;
    hero->goal = (VECTOR2){ start->x, start->y };
    hero->has_goal = false;
    fprintf(stderr,
            "HLW_NATIVE_HERO_SERVER=%s actor=%u ent=%u world=%.1f,%.1f\\n",
            spawned ? "SPAWN" : "REUSE",
            (unsigned)actor,
            (unsigned)ent->s.number,
            ent->s.origin.x,
            ent->s.origin.y);
    return true;
}

int HLW_OpenRealmHeroReset(void) {
    if (!wasm_map_unit_smoke) return 0;
    static VECTOR3 const starts[HLW_NATIVE_HERO_COUNT] = {
        { -120.0f, -140.0f, 12.0f },
        {  120.0f,  140.0f, 12.0f },
    };

    FOR_LOOP(i, HLW_NATIVE_HERO_COUNT) {
        if (!HLW_ResetHeroEntity((BYTE)i, &starts[i])) return 0;
    }

    fprintf(stderr,
            "HLW_NATIVE_HERO_RESET=PASS ent0=%u ent1=%u\\n",
            (unsigned)hlw_native_heroes[0].ent->s.number,
            (unsigned)hlw_native_heroes[1].ent->s.number);
    return 1;
}
'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"g_main.c: expected H2 hero reset block once, got {count}")
path.write_text(text.replace(old, new, 1))
print("Hero Line Wars hero reset now reuses native edicts")
