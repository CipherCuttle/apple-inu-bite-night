#!/usr/bin/env python3
from pathlib import Path

path = Path("games/warcraft-3/game/g_main.c")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    text = text.replace(old, new, 1)


replace_once(
'''typedef struct {
    DWORD creep_id;
    DWORD seen_epoch;
    LPEDICT ent;
} hlwNativeCreepSlot_t;
''',
'''typedef struct {
    DWORD creep_id;
    DWORD seen_epoch;
    LPEDICT ent;
    int world_x_milli;
    int world_y_milli;
} hlwNativeCreepSlot_t;
''',
"native creep slot fixed-point state",
)

replace_once(
'''int HLW_OpenRealmPresentationSyncCreep(DWORD creep_id,
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
''',
'''int HLW_OpenRealmPresentationSyncCreep(DWORD creep_id,
                                       BYTE target,
                                       BYTE kind,
                                       BYTE cell_x,
                                       BYTE cell_y,
                                       BYTE next_cell_x,
                                       BYTE next_cell_y,
                                       USHORT progress_milli,
                                       DWORD hit_points) {
    (void)kind;
    (void)hit_points;
    if (!wasm_map_unit_smoke || creep_id == 0 || target > 1 || progress_milli >= 1000) return 0;
''',
"native creep sync signature",
)

replace_once(
'''    LPEDICT ent = slot->ent;
    if (!ent || !ent->inuse) return 0;
    ent->s.player = target;
    ent->s.origin = (VECTOR3){
        .x = -160.0f + (FLOAT)cell_x * 40.0f,
        .y = (target ? 82.0f : -82.0f) + ((FLOAT)cell_y - 3.0f) * 22.0f,
        .z = 12.0f,
    };
''',
'''    LPEDICT ent = slot->ent;
    if (!ent || !ent->inuse) return 0;
    ent->s.player = target;

    /* Keep the mirror derived from authoritative cell/progress state. Integer
     * milli-world coordinates avoid platform-dependent float accumulation and
     * preserve exact replay semantics for fractional in-cell progress. */
    const int current_x_milli = -160000 + (int)cell_x * 40000;
    const int current_y_milli = (target ? 82000 : -82000) + ((int)cell_y - 3) * 22000;
    const int next_x_milli = -160000 + (int)next_cell_x * 40000;
    const int next_y_milli = (target ? 82000 : -82000) + ((int)next_cell_y - 3) * 22000;
    slot->world_x_milli = current_x_milli +
        ((next_x_milli - current_x_milli) * (int)progress_milli) / 1000;
    slot->world_y_milli = current_y_milli +
        ((next_y_milli - current_y_milli) * (int)progress_milli) / 1000;
    ent->s.origin = (VECTOR3){
        .x = (FLOAT)slot->world_x_milli / 1000.0f,
        .y = (FLOAT)slot->world_y_milli / 1000.0f,
        .z = 12.0f,
    };
''',
"native creep progress interpolation",
)

replace_once(
'''            "HLW_NATIVE_CREEP_SERVER=%s creep=%u ent=%u cell=%u,%u world=%.1f,%.1f\\n",
            spawned ? "SPAWN" : "SYNC",
            (unsigned)creep_id,
            (unsigned)ent->s.number,
            (unsigned)cell_x,
            (unsigned)cell_y,
            ent->s.origin.x,
            ent->s.origin.y);
''',
'''            "HLW_NATIVE_CREEP_SERVER=%s creep=%u ent=%u cell=%u,%u world=%.1f,%.1f next=%u,%u progress=%u\\n",
            spawned ? "SPAWN" : "SYNC",
            (unsigned)creep_id,
            (unsigned)ent->s.number,
            (unsigned)cell_x,
            (unsigned)cell_y,
            ent->s.origin.x,
            ent->s.origin.y,
            (unsigned)next_cell_x,
            (unsigned)next_cell_y,
            (unsigned)progress_milli);
''',
"native creep progress evidence",
)

replace_once(
'''        hash = HLW_NativeHashU32(hash, best->creep_id);
        hash = HLW_NativeHashByte(hash, ent->s.player);
        hash = HLW_NativeHashI32(hash, (int)ent->s.origin.x);
        hash = HLW_NativeHashI32(hash, (int)ent->s.origin.y);
        hash = HLW_NativeHashU32(hash, (DWORD)ent->s.class_id);
''',
'''        hash = HLW_NativeHashU32(hash, best->creep_id);
        hash = HLW_NativeHashByte(hash, ent->s.player);
        hash = HLW_NativeHashI32(hash, best->world_x_milli);
        hash = HLW_NativeHashI32(hash, best->world_y_milli);
        hash = HLW_NativeHashU32(hash, (DWORD)ent->s.class_id);
''',
"native semantic hash exact creep position",
)

path.write_text(text)
print("Hero Line Wars H7 authoritative creep progress projection applied")
