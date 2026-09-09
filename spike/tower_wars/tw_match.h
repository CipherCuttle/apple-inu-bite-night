#ifndef TW_MATCH_H
#define TW_MATCH_H

#include "tw_grid.h"

#include <stdbool.h>
#include <stdint.h>

#define TW_PLAYER_COUNT 2
#define TW_MAX_TOWERS_PER_PLAYER TW_GRID_MAX_CELLS

typedef enum {
    TW_TOWER_NEEDLE = 0,
    TW_TOWER_PULSE = 1,
    TW_TOWER_ANVIL = 2,
    TW_TOWER_COUNT = 3,
} tw_tower_kind_t;

typedef struct {
    tw_tower_kind_t kind;
    uint32_t cost;
    uint32_t damage;
    uint16_t range_cells;
    uint16_t cadence_ticks;
} tw_tower_def_t;

typedef struct {
    uint32_t id;
    uint8_t owner;
    tw_tower_kind_t kind;
    tw_cell_t cell;
} tw_tower_t;

typedef struct {
    uint32_t gold;
    tw_grid_t grid;
    uint16_t tower_count;
    tw_tower_t towers[TW_MAX_TOWERS_PER_PLAYER];
} tw_player_state_t;

typedef struct {
    tw_player_state_t players[TW_PLAYER_COUNT];
    uint32_t next_tower_id;
} tw_match_t;

typedef enum {
    TW_ACTION_BUILD = 1,
} tw_action_kind_t;

typedef struct {
    uint8_t actor;
    tw_action_kind_t kind;
    union {
        struct {
            tw_tower_kind_t tower;
            tw_cell_t cell;
        } build;
    } data;
} tw_action_t;

typedef enum {
    TW_APPLY_OK = 0,
    TW_APPLY_INVALID_MATCH,
    TW_APPLY_INVALID_ACTOR,
    TW_APPLY_INVALID_ACTION,
    TW_APPLY_INVALID_TOWER,
    TW_APPLY_INSUFFICIENT_GOLD,
    TW_APPLY_TOWER_CAPACITY,
    TW_APPLY_ILLEGAL_PLACEMENT,
} tw_apply_result_t;

bool tw_match_init(tw_match_t *match,
                   uint8_t width,
                   uint8_t height,
                   tw_cell_t entrance,
                   tw_cell_t exit,
                   uint32_t starting_gold);

const tw_tower_def_t *tw_tower_def(tw_tower_kind_t kind);

tw_apply_result_t tw_match_apply_action(tw_match_t *match, const tw_action_t *action);

/* Pure deterministic planner: chooses an action but never mutates match state. */
bool tw_bot_choose_build(const tw_match_t *match, uint8_t actor, tw_action_t *action_out);

/* Deterministic hash of the G2 authoritative build/economy payload. */
uint64_t tw_match_build_hash(const tw_match_t *match);

#endif
