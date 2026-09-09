#include "tw_grid.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static bool same_path(const tw_path_t *a, const tw_path_t *b) {
    return a->length == b->length &&
           memcmp(a->cells, b->cells, (size_t)a->length * sizeof(a->cells[0])) == 0;
}

static void deterministic_route_repeats(void) {
    tw_grid_t grid;
    tw_path_t first;
    tw_path_t second;

    assert(tw_grid_init(&grid, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}));
    assert(tw_grid_find_path(&grid, &first));
    assert(tw_grid_find_path(&grid, &second));
    assert(same_path(&first, &second));
    assert(first.length == 7);
}

static void legal_placement_reroutes(void) {
    tw_grid_t grid;
    tw_path_t before;
    tw_path_t after;

    assert(tw_grid_init(&grid, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}));
    assert(tw_grid_find_path(&grid, &before));
    assert(tw_grid_try_place(&grid, (tw_cell_t){3, 2}, &after));

    assert(after.length > before.length);
    assert(!same_path(&before, &after));
    assert(grid.blocked[2 * grid.width + 3] == 1);

    /* Tie-break is frozen N,E,S,W, so the first detour goes north. */
    assert(after.length >= 3);
    assert(after.cells[1].x == 1 && after.cells[1].y == 2);
    assert(after.cells[2].x == 2 && after.cells[2].y == 2);
}

static void full_block_rejected_without_mutation(void) {
    tw_grid_t grid;
    tw_path_t path;

    assert(tw_grid_init(&grid, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}));

    /* Build two walls with a single remaining gap at x=2,y=1. */
    for (uint8_t x = 0; x < grid.width; ++x) {
        if (x != 2) {
            assert(tw_grid_try_place(&grid, (tw_cell_t){x, 0}, NULL));
            assert(tw_grid_try_place(&grid, (tw_cell_t){x, 2}, NULL));
        }
    }
    assert(tw_grid_try_place(&grid, (tw_cell_t){1, 1}, NULL));
    assert(tw_grid_try_place(&grid, (tw_cell_t){3, 1}, NULL));

    const uint64_t before = tw_grid_hash(&grid);
    assert(!tw_grid_try_place(&grid, (tw_cell_t){2, 1}, &path));
    const uint64_t after = tw_grid_hash(&grid);

    assert(before == after);
    assert(grid.blocked[1 * grid.width + 2] == 0);
    assert(tw_grid_find_path(&grid, &path));
}

static void invalid_placement_is_non_mutating(void) {
    tw_grid_t grid;
    assert(tw_grid_init(&grid, 6, 4, (tw_cell_t){0, 1}, (tw_cell_t){5, 1}));

    const uint64_t before = tw_grid_hash(&grid);
    assert(!tw_grid_try_place(&grid, grid.entrance, NULL));
    assert(!tw_grid_try_place(&grid, grid.exit, NULL));
    assert(!tw_grid_try_place(&grid, (tw_cell_t){99, 99}, NULL));
    assert(before == tw_grid_hash(&grid));
}

int main(void) {
    deterministic_route_repeats();
    legal_placement_reroutes();
    full_block_rejected_without_mutation();
    invalid_placement_is_non_mutating();
    puts("TOWER_WARS_G1_DETERMINISTIC_GRID_PATH=PASS");
    return 0;
}
