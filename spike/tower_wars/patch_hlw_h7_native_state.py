#!/usr/bin/env python3
from pathlib import Path

path = Path("games/warcraft-3/game/g_main.c")
text = path.read_text()

anchor = '''    return best_creep_id;
}
#endif
'''

replacement = '''    return best_creep_id;
}

/* H7 semantic presentation digest. Entity numbers are intentionally excluded:
 * G_Spawn may legally choose different edict slots after a reset, while the
 * reconstructed hero/creep world state must remain identical. */
static uint64_t HLW_NativeHashByte(uint64_t hash, BYTE byte) {
    hash ^= byte;
    return hash * UINT64_C(1099511628211);
}

static uint64_t HLW_NativeHashU32(uint64_t hash, DWORD value) {
    FOR_LOOP(shift, 4) {
        hash = HLW_NativeHashByte(hash, (BYTE)(value >> (shift * 8)));
    }
    return hash;
}

static uint64_t HLW_NativeHashI32(uint64_t hash, int value) {
    return HLW_NativeHashU32(hash, (DWORD)(uint32_t)value);
}

DWORD HLW_OpenRealmNativePresentationCount(void) {
    DWORD count = 0;
    FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
        LPCEDICT ent = hlw_native_creeps[i].ent;
        if (hlw_native_creeps[i].creep_id && ent && ent->inuse) count++;
    }
    return count;
}

uint64_t HLW_OpenRealmNativeSemanticHash(void) {
    uint64_t hash = UINT64_C(1469598103934665603);

    FOR_LOOP(actor, HLW_NATIVE_HERO_COUNT) {
        hlwNativeHero_t const *hero = &hlw_native_heroes[actor];
        LPCEDICT ent = hero->ent;
        hash = HLW_NativeHashByte(hash, (BYTE)actor);
        hash = HLW_NativeHashByte(hash, ent && ent->inuse ? 1 : 0);
        if (!ent || !ent->inuse) continue;
        hash = HLW_NativeHashI32(hash, (int)ent->s.origin.x);
        hash = HLW_NativeHashI32(hash, (int)ent->s.origin.y);
        hash = HLW_NativeHashI32(hash, (int)hero->goal.x);
        hash = HLW_NativeHashI32(hash, (int)hero->goal.y);
        hash = HLW_NativeHashByte(hash, hero->has_goal ? 1 : 0);
        hash = HLW_NativeHashU32(hash, (DWORD)ent->s.class_id);
        hash = HLW_NativeHashU32(hash, (DWORD)ent->s.model);
    }

    const DWORD count = HLW_OpenRealmNativePresentationCount();
    hash = HLW_NativeHashU32(hash, count);

    /* Hash presentation creeps in creep-ID order rather than slot/edict order. */
    DWORD previous_id = 0;
    FOR_LOOP(n, count) {
        hlwNativeCreepSlot_t const *best = NULL;
        FOR_LOOP(i, HLW_NATIVE_PRESENTATION_MAX) {
            hlwNativeCreepSlot_t const *slot = &hlw_native_creeps[i];
            LPCEDICT ent = slot->ent;
            if (!slot->creep_id || slot->creep_id <= previous_id || !ent || !ent->inuse) continue;
            if (!best || slot->creep_id < best->creep_id) best = slot;
        }
        if (!best || !best->ent) {
            hash = HLW_NativeHashByte(hash, 0xff);
            break;
        }
        LPCEDICT ent = best->ent;
        hash = HLW_NativeHashU32(hash, best->creep_id);
        hash = HLW_NativeHashByte(hash, ent->s.player);
        hash = HLW_NativeHashI32(hash, (int)ent->s.origin.x);
        hash = HLW_NativeHashI32(hash, (int)ent->s.origin.y);
        hash = HLW_NativeHashU32(hash, (DWORD)ent->s.class_id);
        hash = HLW_NativeHashU32(hash, (DWORD)ent->s.model);
        previous_id = best->creep_id;
    }
    return hash;
}
#endif
'''

count = text.count(anchor)
if count != 1:
    raise SystemExit(f"g_main.c: expected H7 native-state anchor once, got {count}")
path.write_text(text.replace(anchor, replacement, 1))
print("Hero Line Wars H7 semantic native-state digest applied")
