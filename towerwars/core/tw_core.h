#ifndef TW_CORE_H
#define TW_CORE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define TW_PLAYERS 2
#define TW_WIDTH 12
#define TW_HEIGHT 8
#define TW_MAX_TOWERS (TW_WIDTH * TW_HEIGHT)
#define TW_MAX_CREEPS 128
#define TW_INCOME_PERIOD 20u
#define TW_START_GOLD 120
#define TW_START_INCOME 10
#define TW_START_LIVES 20
#define TW_NO_WINNER (-1)
#define TW_DRAW (-2)

typedef enum {
    TW_TOWER_BASIC = 0,
    TW_TOWER_RAPID,
    TW_TOWER_CANNON,
    TW_TOWER_COUNT
} tw_tower_kind_t;

typedef enum {
    TW_CREEP_RUNNER = 0,
    TW_CREEP_GRUNT,
    TW_CREEP_TANK,
    TW_CREEP_SWARM,
    TW_CREEP_COUNT
} tw_creep_kind_t;

typedef enum {
    TW_OK = 0,
    TW_ERR_PLAYER,
    TW_ERR_KIND,
    TW_ERR_BOUNDS,
    TW_ERR_OCCUPIED,
    TW_ERR_ENDPOINT,
    TW_ERR_CREEP_OCCUPIED,
    TW_ERR_BLOCKS_PATH,
    TW_ERR_GOLD,
    TW_ERR_CAPACITY,
    TW_ERR_GAME_OVER,
    TW_ERR_FAULTED
} tw_result_t;

typedef enum {
    TW_ACTION_PLACE_TOWER = 0,
    TW_ACTION_SEND_CREEP,
    TW_ACTION_TICK
} tw_action_type_t;

typedef struct {
    uint8_t x;
    uint8_t y;
} tw_cell_t;

typedef struct {
    bool active;
    uint32_t id;
    uint8_t x;
    uint8_t y;
    tw_tower_kind_t kind;
    uint16_t cooldown_remaining;
} tw_tower_t;

typedef struct {
    bool active;
    uint32_t id;
    uint8_t owner;
    uint8_t board;
    uint8_t x;
    uint8_t y;
    tw_creep_kind_t kind;
    int hp;
    uint16_t move_cooldown;
} tw_creep_t;

typedef struct {
    int gold;
    int income;
    int lives;
    bool blocked[TW_HEIGHT][TW_WIDTH];
    tw_tower_t towers[TW_MAX_TOWERS];
} tw_player_t;

typedef struct {
    uint32_t tick;
    uint32_t next_tower_id;
    uint32_t next_creep_id;
    bool faulted;
    tw_player_t players[TW_PLAYERS];
    tw_creep_t creeps[TW_MAX_CREEPS];
} tw_state_t;

typedef struct {
    tw_action_type_t type;
    uint8_t player;
    uint8_t x;
    uint8_t y;
    uint8_t kind;
} tw_action_t;

void tw_init(tw_state_t *state);

tw_result_t tw_place_tower(tw_state_t *state, unsigned player,
                           tw_tower_kind_t kind, unsigned x, unsigned y);
tw_result_t tw_send_creep(tw_state_t *state, unsigned player,
                          tw_creep_kind_t kind);
tw_result_t tw_apply_action(tw_state_t *state, const tw_action_t *action);
void tw_tick(tw_state_t *state);

bool tw_find_path(const tw_state_t *state, unsigned board,
                  unsigned start_x, unsigned start_y,
                  tw_cell_t *out_path, size_t path_capacity,
                  size_t *out_path_length);
bool tw_validate_state(const tw_state_t *state);
uint64_t tw_state_hash(const tw_state_t *state);
int tw_winner(const tw_state_t *state);

#endif
