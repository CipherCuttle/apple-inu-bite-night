#!/usr/bin/env python3
from pathlib import Path

path = Path("spike/tower_wars/tw_browser.c")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    text = text.replace(old, new, 1)


replace_once(
'''extern int HLW_OpenRealmPresentationSyncCreep(uint32_t id,
                                              uint8_t target,
                                              uint8_t kind,
                                              uint8_t x,
                                              uint8_t y,
                                              uint16_t progress_milli,
                                              uint32_t hit_points);
''',
'''extern int HLW_OpenRealmPresentationSyncCreep(uint32_t id,
                                              uint8_t target,
                                              uint8_t kind,
                                              uint8_t x,
                                              uint8_t y,
                                              uint8_t next_x,
                                              uint8_t next_y,
                                              uint16_t progress_milli,
                                              uint32_t hit_points);
''',
"presentation sync declaration",
)

replace_once(
'''    for (uint16_t i = 0; i < browser_session.match.active_creep_count; ++i) {
        const tw_creep_t *creep = &browser_session.match.active_creeps[i];
        if (HLW_OpenRealmPresentationSyncCreep(creep->id,
                                              creep->target,
                                              (uint8_t)creep->kind,
                                              creep->cell.x,
                                              creep->cell.y,
                                              creep->progress_milli,
                                              creep->hit_points) != 1) {
            return fail_native_presentation();
        }
    }
''',
'''    for (uint16_t i = 0; i < browser_session.match.active_creep_count; ++i) {
        const tw_creep_t *creep = &browser_session.match.active_creeps[i];
        if (creep->target >= TW_PLAYER_COUNT) return fail_native_presentation();

        const tw_grid_t *grid = &browser_session.match.players[creep->target].grid;
        tw_path_t path;
        if (!tw_grid_find_path_between(grid, creep->cell, grid->exit, &path) || path.length == 0) {
            return fail_native_presentation();
        }
        tw_cell_t next_cell = creep->cell;
        if (path.length > 1) next_cell = path.cells[1];

        if (HLW_OpenRealmPresentationSyncCreep(creep->id,
                                              creep->target,
                                              (uint8_t)creep->kind,
                                              creep->cell.x,
                                              creep->cell.y,
                                              next_cell.x,
                                              next_cell.y,
                                              creep->progress_milli,
                                              creep->hit_points) != 1) {
            return fail_native_presentation();
        }
    }
''',
"presentation sync authoritative next cell",
)

path.write_text(text)
print("Hero Line Wars H7 browser progress projection applied")
