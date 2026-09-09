#include "tw_grid.h"

#include <string.h>

static bool tw_cell_equal(tw_cell_t a, tw_cell_t b) {
    return a.x == b.x && a.y == b.y;
}

static bool tw_cell_valid(const tw_grid_t *grid, tw_cell_t cell) {
    return grid && cell.x < grid->width && cell.y < grid->height;
}

static uint16_t tw_index(const tw_grid_t *grid, tw_cell_t cell) {
    return (uint16_t)(cell.y * grid->width + cell.x);
}

static tw_cell_t tw_cell_from_index(const tw_grid_t *grid, uint16_t index) {
    return (tw_cell_t){
        .x = (uint8_t)(index % grid->width),
        .y = (uint8_t)(index / grid->width),
    };
}

bool tw_grid_init(tw_grid_t *grid, uint8_t width, uint8_t height,
                  tw_cell_t entrance, tw_cell_t exit) {
    if (!grid || width == 0 || height == 0 ||
        width > TW_GRID_MAX_WIDTH || height > TW_GRID_MAX_HEIGHT) {
        return false;
    }

    memset(grid, 0, sizeof(*grid));
    grid->width = width;
    grid->height = height;
    grid->entrance = entrance;
    grid->exit = exit;

    if (!tw_cell_valid(grid, entrance) || !tw_cell_valid(grid, exit) ||
        tw_cell_equal(entrance, exit)) {
        memset(grid, 0, sizeof(*grid));
        return false;
    }
    return true;
}

bool tw_grid_find_path(const tw_grid_t *grid, tw_path_t *path) {
    uint16_t queue[TW_GRID_MAX_CELLS];
    int16_t parent[TW_GRID_MAX_CELLS];
    uint8_t visited[TW_GRID_MAX_CELLS] = {0};
    uint16_t head = 0;
    uint16_t tail = 0;
    const uint16_t cell_count = (uint16_t)(grid ? grid->width * grid->height : 0);

    if (!grid || !path || !cell_count ||
        !tw_cell_valid(grid, grid->entrance) || !tw_cell_valid(grid, grid->exit)) {
        return false;
    }
    memset(path, 0, sizeof(*path));
    memset(parent, 0xff, sizeof(parent));

    const uint16_t start = tw_index(grid, grid->entrance);
    const uint16_t goal = tw_index(grid, grid->exit);
    if (grid->blocked[start] || grid->blocked[goal]) return false;

    queue[tail++] = start;
    visited[start] = 1;

    /* Frozen deterministic neighbor order: north, east, south, west. */
    static const int8_t dx[4] = {0, 1, 0, -1};
    static const int8_t dy[4] = {-1, 0, 1, 0};

    while (head < tail && !visited[goal]) {
        const uint16_t current = queue[head++];
        const tw_cell_t at = tw_cell_from_index(grid, current);

        for (size_t direction = 0; direction < 4; ++direction) {
            const int nx = (int)at.x + dx[direction];
            const int ny = (int)at.y + dy[direction];
            if (nx < 0 || ny < 0 || nx >= grid->width || ny >= grid->height) continue;

            const tw_cell_t next_cell = {(uint8_t)nx, (uint8_t)ny};
            const uint16_t next = tw_index(grid, next_cell);
            if (visited[next] || grid->blocked[next]) continue;

            visited[next] = 1;
            parent[next] = (int16_t)current;
            queue[tail++] = next;
            if (next == goal) break;
        }
    }

    if (!visited[goal]) return false;

    uint16_t reverse[TW_GRID_MAX_CELLS];
    uint16_t reverse_length = 0;
    for (int current = goal; current >= 0; current = parent[current]) {
        reverse[reverse_length++] = (uint16_t)current;
        if ((uint16_t)current == start) break;
        if (reverse_length >= cell_count) return false;
    }

    path->length = reverse_length;
    for (uint16_t i = 0; i < reverse_length; ++i) {
        path->cells[i] = tw_cell_from_index(grid, reverse[reverse_length - 1 - i]);
    }
    return true;
}

bool tw_grid_try_place(tw_grid_t *grid, tw_cell_t cell, tw_path_t *resulting_path) {
    if (!grid || !tw_cell_valid(grid, cell) ||
        tw_cell_equal(cell, grid->entrance) || tw_cell_equal(cell, grid->exit)) {
        return false;
    }

    const uint16_t index = tw_index(grid, cell);
    if (grid->blocked[index]) return false;

    grid->blocked[index] = 1;
    tw_path_t candidate;
    if (!tw_grid_find_path(grid, &candidate)) {
        grid->blocked[index] = 0;
        return false;
    }

    if (resulting_path) *resulting_path = candidate;
    return true;
}

uint64_t tw_grid_hash(const tw_grid_t *grid) {
    if (!grid) return 0;

    /* FNV-1a over the complete authoritative grid payload used by G1 tests. */
    uint64_t hash = UINT64_C(1469598103934665603);
    const uint8_t header[] = {
        grid->width, grid->height,
        grid->entrance.x, grid->entrance.y,
        grid->exit.x, grid->exit.y,
    };
    for (size_t i = 0; i < sizeof(header); ++i) {
        hash ^= header[i];
        hash *= UINT64_C(1099511628211);
    }
    const size_t cells = (size_t)grid->width * grid->height;
    for (size_t i = 0; i < cells; ++i) {
        hash ^= grid->blocked[i];
        hash *= UINT64_C(1099511628211);
    }
    return hash;
}
