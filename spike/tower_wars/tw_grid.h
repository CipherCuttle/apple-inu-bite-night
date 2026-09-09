#ifndef TW_GRID_H
#define TW_GRID_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define TW_GRID_MAX_WIDTH 32
#define TW_GRID_MAX_HEIGHT 32
#define TW_GRID_MAX_CELLS (TW_GRID_MAX_WIDTH * TW_GRID_MAX_HEIGHT)

typedef struct {
    uint8_t x;
    uint8_t y;
} tw_cell_t;

typedef struct {
    uint8_t width;
    uint8_t height;
    tw_cell_t entrance;
    tw_cell_t exit;
    uint8_t blocked[TW_GRID_MAX_CELLS];
} tw_grid_t;

typedef struct {
    tw_cell_t cells[TW_GRID_MAX_CELLS];
    uint16_t length;
} tw_path_t;

bool tw_grid_init(tw_grid_t *grid, uint8_t width, uint8_t height,
                  tw_cell_t entrance, tw_cell_t exit);
bool tw_grid_find_path_between(const tw_grid_t *grid, tw_cell_t start, tw_cell_t goal,
                               tw_path_t *path);
bool tw_grid_find_path(const tw_grid_t *grid, tw_path_t *path);
bool tw_grid_try_place(tw_grid_t *grid, tw_cell_t cell, tw_path_t *resulting_path);
uint64_t tw_grid_hash(const tw_grid_t *grid);

#endif
