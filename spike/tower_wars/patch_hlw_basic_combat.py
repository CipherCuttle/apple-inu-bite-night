#!/usr/bin/env python3
from pathlib import Path

path = Path("games/warcraft-3/game/g_main.c")
text = path.read_text()

anchor = '''BOOL HLW_OpenRealmIsHeroEntityNumber(DWORD number) {
    if (!number) return false;
    FOR_LOOP(i, HLW_NATIVE_HERO_COUNT) {
        LPCEDICT ent = hlw_native_heroes[i].ent;
        if (ent && ent->inuse && (DWORD)ent->s.number == number) return true;
    }
    return false;
}
#endif
'''

replacement = '''BOOL HLW_OpenRealmIsHeroEntityNumber(DWORD number) {
    if (!number) return false;
    FOR_LOOP(i, HLW_NATIVE_HERO_COUNT) {
        LPCEDICT ent = hlw_native_heroes[i].ent;
        if (ent && ent->inuse && (DWORD)ent->s.number == number) return true;
    }
    return false;
}

/*
 * Native hero position owns range legality. Creep HP/reward/retirement do not
 * live here: this returns only the deterministic ID of a legal incoming target
 * for the Tower Wars session to attack authoritatively.
 */
DWORD HLW_OpenRealmHeroAcquireTarget(BYTE actor, FLOAT range) {
    if (!wasm_map_unit_smoke || actor >= HLW_NATIVE_HERO_COUNT || range <= 0.0f) return 0;
    LPCEDICT hero = hlw_native_heroes[actor].ent;
    if (!hero || !hero->inuse) return 0;

    const FLOAT max_distance_sq = range * range;
    FLOAT best_distance_sq = max_distance_sq;
    DWORD best_creep_id = 0;
    DWORD best_entity = 0;

    FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
        hlwNativeCreepSlot_t const *slot = &hlw_native_creeps[i];
        LPCEDICT creep = slot->ent;
        if (!slot->creep_id || !creep || !creep->inuse) continue;
        if (creep->s.player != actor) continue;

        const FLOAT dx = creep->s.origin.x - hero->s.origin.x;
        const FLOAT dy = creep->s.origin.y - hero->s.origin.y;
        const FLOAT distance_sq = dx * dx + dy * dy;
        if (distance_sq > max_distance_sq) continue;
        if (!best_creep_id || distance_sq < best_distance_sq ||
            (distance_sq == best_distance_sq && slot->creep_id < best_creep_id)) {
            best_distance_sq = distance_sq;
            best_creep_id = slot->creep_id;
            best_entity = (DWORD)creep->s.number;
        }
    }

    if (best_creep_id) {
        fprintf(stderr,
                "HLW_NATIVE_HERO_TARGET=PASS actor=%u creep=%u ent=%u distance2=%.1f range=%.1f\\n",
                (unsigned)actor,
                (unsigned)best_creep_id,
                (unsigned)best_entity,
                best_distance_sq,
                range);
    }
    return best_creep_id;
}
#endif
'''

count = text.count(anchor)
if count != 1:
    raise SystemExit(f"g_main.c: expected hero combat anchor once, got {count}")
path.write_text(text.replace(anchor, replacement, 1))
print("Hero Line Wars native hero target acquisition applied")
