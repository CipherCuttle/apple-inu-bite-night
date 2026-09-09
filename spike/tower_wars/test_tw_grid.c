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
    tw_path_t repeated;

    assert(tw_grid_init(&grid, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}));
    assert(tw_grid_find_path(&grid, &before));
    assert(tw_grid_try_place(&grid, (tw_cell_t){3, 2}, &after));
    assert(tw_grid_find_path(&grid, &repeated));

    assert(after.length > before.length);
    assert(!same_path(&before, &after));
    assert(same_path(&after, &repeated));
    assert(grid.blocked[2 * grid.width + 3] == 1);

    /* N,E,S,W is a semantic tie-break, not an implementation accident. When
     * north and south detours are equally short, the canonical path goes north. */
    assert(after.length >= 2);
    assert(after.cells[0].x == 0 && after.cells[0].y == 2);
    assert(after.cells[1].x == 0 && after.cells[1].y == 1);
}

static void full_block_rejected_without_mutation(void) {
    tw_grid_t grid;
    tw_path_t path;

    assert(tw_grid_init(&grid, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}));

    /* Column x=2 is the only separator needed. Top and bottom placements are
     * individually legal; filling the center would sever entrance from exit. */
    assert(tw_grid_try_place(&grid, (tw_cell_t){2, 0}, NULL));
    assert(tw_grid_try_place(&grid, (tw_cell_t){2, 2}, NULL));

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
