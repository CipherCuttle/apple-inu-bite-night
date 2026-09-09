#ifndef TW_MATCH_H
#define TW_MATCH_H

#include "tw_grid.h"

#include <stdbool.h>
#include <stdint.h>

#define TW_PLAYER_COUNT 2
#define TW_MAX_TOWERS_PER_PLAYER TW_GRID_MAX_CELLS
#define TW_MAX_CREEPS 256
#define TW_MAX_PENDING_SENDS TW_MAX_CREEPS
#define TW_STARTING_INCOME 10
#define TW_INCOME_PERIOD_TICKS 20
#define TW_STARTING_LIVES 20
#define TW_NO_PLAYER UINT8_MAX

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

typedef enum {
    TW_CREEP_SCOUT = 0,
    TW_CREEP_SWARM = 1,
    TW_CREEP_BRUTE = 2,
    TW_CREEP_SIEGE = 3,
    TW_CREEP_COUNT = 4,
} tw_creep_kind_t;

typedef struct {
    tw_creep_kind_t kind;
    uint32_t cost;
    uint32_t income_gain;
    uint32_t hit_points;
    uint16_t speed_milli_cells_per_tick;
    uint8_t leak_damage;
} tw_creep_def_t;

typedef struct {
    uint32_t id;
    uint8_t owner;
    tw_tower_kind_t kind;
    tw_cell_t cell;
    uint16_t cooldown_ticks;
} tw_tower_t;

typedef struct {
    uint32_t id;
    uint8_t sender;
    uint8_t target;
    tw_creep_kind_t kind;
} tw_pending_send_t;

typedef struct {
    uint32_t id;
    uint8_t sender;
    uint8_t target;
    tw_creep_kind_t kind;
    uint32_t hit_points;
    tw_cell_t cell;
    uint16_t progress_milli;
} tw_creep_t;

typedef struct {
    uint32_t gold;
    uint32_t income;
    uint16_t lives;
    tw_grid_t grid;
    uint16_t tower_count;
    tw_tower_t towers[TW_MAX_TOWERS_PER_PLAYER];
} tw_player_state_t;

typedef struct {
    tw_player_state_t players[TW_PLAYER_COUNT];
    uint32_t next_tower_id;
    uint32_t next_creep_id;
    uint64_t tick;
    uint16_t pending_send_count;
    tw_pending_send_t pending_sends[TW_MAX_PENDING_SENDS];
    uint16_t active_creep_count;
    tw_creep_t active_creeps[TW_MAX_CREEPS];
    bool terminal;
    uint8_t winner;
    uint8_t loser;
} tw_match_t;

typedef enum {
    TW_ACTION_BUILD = 1,
    TW_ACTION_SEND = 2,
} tw_action_kind_t;

typedef struct {
    uint8_t actor;
    tw_action_kind_t kind;
    union {
        struct {
            tw_tower_kind_t tower;
            tw_cell_t cell;
        } build;
        struct {
            tw_creep_kind_t creep;
        } send;
    } data;
} tw_action_t;

typedef enum {
    TW_APPLY_OK = 0,
    TW_APPLY_INVALID_MATCH,
    TW_APPLY_INVALID_ACTOR,
    TW_APPLY_INVALID_ACTION,
    TW_APPLY_MATCH_TERMINAL,
    TW_APPLY_INVALID_TOWER,
    TW_APPLY_INVALID_CREEP,
    TW_APPLY_INSUFFICIENT_GOLD,
    TW_APPLY_TOWER_CAPACITY,
    TW_APPLY_SEND_CAPACITY,
    TW_APPLY_ILLEGAL_PLACEMENT,
    TW_APPLY_ECONOMY_OVERFLOW,
} tw_apply_result_t;

bool tw_match_init(tw_match_t *match,
                   uint8_t width,
                   uint8_t height,
                   tw_cell_t entrance,
                   tw_cell_t exit,
                   uint32_t starting_gold);

const tw_tower_def_t *tw_tower_def(tw_tower_kind_t kind);
const tw_creep_def_t *tw_creep_def(tw_creep_kind_t kind);

tw_apply_result_t tw_match_apply_action(tw_match_t *match, const tw_action_t *action);

/* Advance the authoritative deterministic simulation by whole ticks. */
bool tw_match_step(tw_match_t *match, uint32_t ticks);

/* Compatibility name retained for the G3 tests; it advances the same clock. */
bool tw_match_advance_income(tw_match_t *match, uint32_t ticks);

/* Pure deterministic planner: chooses an action but never mutates match state. */
bool tw_bot_choose_build(const tw_match_t *match, uint8_t actor, tw_action_t *action_out);

/* Deterministic hash of the authoritative state introduced through the current gate. */
uint64_t tw_match_hash(const tw_match_t *match);
uint64_t tw_match_build_hash(const tw_match_t *match);

#endif
