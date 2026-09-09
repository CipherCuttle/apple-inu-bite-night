#include "tw_core.h"

#include <limits.h>
#include <string.h>

typedef struct {
    int cost;
    int damage;
    unsigned range;
    unsigned cooldown;
} tw_tower_def_t;

typedef struct {
    int cost;
    int income_delta;
    int hp;
    unsigned move_period;
    int bounty;
} tw_creep_def_t;

static const tw_tower_def_t TW_TOWER_DEFS[TW_TOWER_COUNT] = {
    [TW_TOWER_BASIC] = {20, 5, 2u, 2u},
    [TW_TOWER_RAPID] = {30, 3, 2u, 1u},
    [TW_TOWER_CANNON] = {45, 12, 3u, 4u},
};

static const tw_creep_def_t TW_CREEP_DEFS[TW_CREEP_COUNT] = {
    [TW_CREEP_RUNNER] = {12, 1, 12, 1u, 2},
    [TW_CREEP_GRUNT] = {18, 2, 30, 2u, 4},
    [TW_CREEP_TANK] = {30, 3, 60, 3u, 6},
    [TW_CREEP_SWARM] = {8, 1, 8, 1u, 1},
};

static const tw_cell_t TW_ENTRY = {0u, 3u};
static const tw_cell_t TW_EXIT = {TW_WIDTH - 1u, 3u};
static const int TW_DX[4] = {1, 0, 0, -1};
static const int TW_DY[4] = {0, -1, 1, 0};

static bool valid_player(unsigned player) { return player < TW_PLAYERS; }
static bool valid_tower_kind(tw_tower_kind_t kind) {
    return kind >= TW_TOWER_BASIC && kind < TW_TOWER_COUNT;
}
static bool valid_creep_kind(tw_creep_kind_t kind) {
    return kind >= TW_CREEP_RUNNER && kind < TW_CREEP_COUNT;
}
static bool in_bounds(unsigned x, unsigned y) {
    return x < TW_WIDTH && y < TW_HEIGHT;
}
static bool is_endpoint(unsigned x, unsigned y) {
    return (x == TW_ENTRY.x && y == TW_ENTRY.y) ||
           (x == TW_EXIT.x && y == TW_EXIT.y);
}
static unsigned cell_index(unsigned x, unsigned y) {
    return y * TW_WIDTH + x;
}

void tw_init(tw_state_t *state) {
    if (!state) return;
    memset(state, 0, sizeof(*state));
    state->next_tower_id = 1u;
    state->next_creep_id = 1u;
    for (unsigned p = 0; p < TW_PLAYERS; ++p) {
        state->players[p].gold = TW_START_GOLD;
        state->players[p].income = TW_START_INCOME;
        state->players[p].lives = TW_START_LIVES;
    }
}

bool tw_find_path(const tw_state_t *state, unsigned board,
                  unsigned start_x, unsigned start_y,
                  tw_cell_t *out_path, size_t path_capacity,
                  size_t *out_path_length) {
    bool seen[TW_HEIGHT][TW_WIDTH] = {{false}};
    int parent[TW_HEIGHT][TW_WIDTH];
    tw_cell_t queue[TW_WIDTH * TW_HEIGHT];
    size_t head = 0u;
    size_t tail = 0u;
    const size_t cell_count = TW_WIDTH * TW_HEIGHT;

    if (out_path_length) *out_path_length = 0u;
    if (!state || !valid_player(board) || !in_bounds(start_x, start_y)) return false;
    if (state->players[board].blocked[start_y][start_x]) return false;

    for (unsigned y = 0; y < TW_HEIGHT; ++y) {
        for (unsigned x = 0; x < TW_WIDTH; ++x) parent[y][x] = -1;
    }

    queue[tail++] = (tw_cell_t){(uint8_t)start_x, (uint8_t)start_y};
    seen[start_y][start_x] = true;

    while (head < tail) {
        tw_cell_t current = queue[head++];
        if (current.x == TW_EXIT.x && current.y == TW_EXIT.y) break;

        for (unsigned d = 0; d < 4u; ++d) {
            int nx = (int)current.x + TW_DX[d];
            int ny = (int)current.y + TW_DY[d];
            if (nx < 0 || ny < 0 || nx >= TW_WIDTH || ny >= TW_HEIGHT) continue;
            if (seen[ny][nx] || state->players[board].blocked[ny][nx]) continue;
            seen[ny][nx] = true;
            parent[ny][nx] = (int)cell_index(current.x, current.y);
            queue[tail++] = (tw_cell_t){(uint8_t)nx, (uint8_t)ny};
        }
    }

    if (!seen[TW_EXIT.y][TW_EXIT.x]) return false;

    tw_cell_t reverse[TW_WIDTH * TW_HEIGHT];
    size_t reverse_len = 0u;
    int cursor = (int)cell_index(TW_EXIT.x, TW_EXIT.y);
    const int start_index = (int)cell_index(start_x, start_y);

    while (true) {
        unsigned x = (unsigned)cursor % TW_WIDTH;
        unsigned y = (unsigned)cursor / TW_WIDTH;
        if (reverse_len >= cell_count) return false;
        reverse[reverse_len++] = (tw_cell_t){(uint8_t)x, (uint8_t)y};
        if (cursor == start_index) break;
        cursor = parent[y][x];
        if (cursor < 0) return false;
    }

    if (out_path_length) *out_path_length = reverse_len;
    if (out_path) {
        if (path_capacity < reverse_len) return false;
        for (size_t i = 0; i < reverse_len; ++i) {
            out_path[i] = reverse[reverse_len - 1u - i];
        }
    }
    return true;
}

static int path_distance_to_exit(const tw_state_t *state, unsigned board,
                                 unsigned x, unsigned y) {
    size_t length = 0u;
    if (!tw_find_path(state, board, x, y, NULL, 0u, &length)) return INT_MAX;
    return (int)length - 1;
}

static bool creep_on_cell(const tw_state_t *state, unsigned board,
                          unsigned x, unsigned y) {
    for (size_t i = 0; i < TW_MAX_CREEPS; ++i) {
        const tw_creep_t *creep = &state->creeps[i];
        if (creep->active && creep->board == board && creep->x == x && creep->y == y) {
            return true;
        }
    }
    return false;
}

static bool all_paths_survive(const tw_state_t *state, unsigned board) {
    if (!tw_find_path(state, board, TW_ENTRY.x, TW_ENTRY.y, NULL, 0u, NULL)) return false;
    for (size_t i = 0; i < TW_MAX_CREEPS; ++i) {
        const tw_creep_t *creep = &state->creeps[i];
        if (creep->active && creep->board == board &&
            !tw_find_path(state, board, creep->x, creep->y, NULL, 0u, NULL)) {
            return false;
        }
    }
    return true;
}

int tw_winner(const tw_state_t *state) {
    if (!state) return TW_NO_WINNER;
    bool p0_dead = state->players[0].lives <= 0;
    bool p1_dead = state->players[1].lives <= 0;
    if (p0_dead && p1_dead) return TW_DRAW;
    if (p0_dead) return 1;
    if (p1_dead) return 0;
    return TW_NO_WINNER;
}

static tw_result_t mutable_state_gate(const tw_state_t *state) {
    if (!state) return TW_ERR_FAULTED;
    if (state->faulted) return TW_ERR_FAULTED;
    if (tw_winner(state) != TW_NO_WINNER) return TW_ERR_GAME_OVER;
    return TW_OK;
}

tw_result_t tw_place_tower(tw_state_t *state, unsigned player,
                           tw_tower_kind_t kind, unsigned x, unsigned y) {
    tw_result_t gate = mutable_state_gate(state);
    if (gate != TW_OK) return gate;
    if (!valid_player(player)) return TW_ERR_PLAYER;
    if (!valid_tower_kind(kind)) return TW_ERR_KIND;
    if (!in_bounds(x, y)) return TW_ERR_BOUNDS;
    if (is_endpoint(x, y)) return TW_ERR_ENDPOINT;

    tw_player_t *p = &state->players[player];
    if (p->blocked[y][x]) return TW_ERR_OCCUPIED;
    if (creep_on_cell(state, player, x, y)) return TW_ERR_CREEP_OCCUPIED;
    if (p->gold < TW_TOWER_DEFS[kind].cost) return TW_ERR_GOLD;

    size_t slot = TW_MAX_TOWERS;
    for (size_t i = 0; i < TW_MAX_TOWERS; ++i) {
        if (!p->towers[i].active) {
            slot = i;
            break;
        }
    }
    if (slot == TW_MAX_TOWERS) return TW_ERR_CAPACITY;

    p->blocked[y][x] = true;
    if (!all_paths_survive(state, player)) {
        p->blocked[y][x] = false;
        return TW_ERR_BLOCKS_PATH;
    }

    p->gold -= TW_TOWER_DEFS[kind].cost;
    p->towers[slot] = (tw_tower_t){
        .active = true,
        .id = state->next_tower_id++,
        .x = (uint8_t)x,
        .y = (uint8_t)y,
        .kind = kind,
        .cooldown_remaining = 0u,
    };
    return TW_OK;
}

tw_result_t tw_send_creep(tw_state_t *state, unsigned player,
                          tw_creep_kind_t kind) {
    tw_result_t gate = mutable_state_gate(state);
    if (gate != TW_OK) return gate;
    if (!valid_player(player)) return TW_ERR_PLAYER;
    if (!valid_creep_kind(kind)) return TW_ERR_KIND;

    tw_player_t *sender = &state->players[player];
    const tw_creep_def_t *def = &TW_CREEP_DEFS[kind];
    if (sender->gold < def->cost) return TW_ERR_GOLD;

    size_t slot = TW_MAX_CREEPS;
    for (size_t i = 0; i < TW_MAX_CREEPS; ++i) {
        if (!state->creeps[i].active) {
            slot = i;
            break;
        }
    }
    if (slot == TW_MAX_CREEPS) return TW_ERR_CAPACITY;

    unsigned board = 1u - player;
    if (!tw_find_path(state, board, TW_ENTRY.x, TW_ENTRY.y, NULL, 0u, NULL)) {
        state->faulted = true;
        return TW_ERR_FAULTED;
    }

    sender->gold -= def->cost;
    sender->income += def->income_delta;
    state->creeps[slot] = (tw_creep_t){
        .active = true,
        .id = state->next_creep_id++,
        .owner = (uint8_t)player,
        .board = (uint8_t)board,
        .x = TW_ENTRY.x,
        .y = TW_ENTRY.y,
        .kind = kind,
        .hp = def->hp,
        .move_cooldown = 0u,
    };
    return TW_OK;
}

static unsigned manhattan(unsigned ax, unsigned ay, unsigned bx, unsigned by) {
    unsigned dx = ax > bx ? ax - bx : bx - ax;
    unsigned dy = ay > by ? ay - by : by - ay;
    return dx + dy;
}

static tw_creep_t *choose_target(tw_state_t *state, unsigned board,
                                 const tw_tower_t *tower) {
    tw_creep_t *best = NULL;
    int best_distance = INT_MAX;
    uint32_t best_id = UINT32_MAX;
    const unsigned range = TW_TOWER_DEFS[tower->kind].range;

    for (size_t i = 0; i < TW_MAX_CREEPS; ++i) {
        tw_creep_t *creep = &state->creeps[i];
        if (!creep->active || creep->board != board) continue;
        if (manhattan(tower->x, tower->y, creep->x, creep->y) > range) continue;
        int distance = path_distance_to_exit(state, board, creep->x, creep->y);
        if (distance == INT_MAX) {
            state->faulted = true;
            continue;
        }
        if (!best || distance < best_distance ||
            (distance == best_distance && creep->id < best_id)) {
            best = creep;
            best_distance = distance;
            best_id = creep->id;
        }
    }
    return best;
}

static void towers_attack(tw_state_t *state) {
    for (unsigned board = 0; board < TW_PLAYERS; ++board) {
        tw_player_t *defender = &state->players[board];
        for (size_t i = 0; i < TW_MAX_TOWERS; ++i) {
            tw_tower_t *tower = &defender->towers[i];
            if (!tower->active) continue;
            if (tower->cooldown_remaining > 0u) {
                --tower->cooldown_remaining;
                continue;
            }
            tw_creep_t *target = choose_target(state, board, tower);
            if (!target) continue;
            const tw_tower_def_t *def = &TW_TOWER_DEFS[tower->kind];
            target->hp -= def->damage;
            tower->cooldown_remaining = (uint16_t)(def->cooldown - 1u);
            if (target->hp <= 0) {
                defender->gold += TW_CREEP_DEFS[target->kind].bounty;
                target->active = false;
            }
        }
    }
}

static void leak_creep(tw_state_t *state, tw_creep_t *creep) {
    tw_player_t *defender = &state->players[creep->board];
    if (defender->lives > 0) --defender->lives;
    creep->active = false;
}

static void move_creeps(tw_state_t *state) {
    tw_cell_t path[TW_WIDTH * TW_HEIGHT];
    for (size_t i = 0; i < TW_MAX_CREEPS; ++i) {
        tw_creep_t *creep = &state->creeps[i];
        if (!creep->active) continue;
        if (creep->move_cooldown > 0u) {
            --creep->move_cooldown;
            continue;
        }

        size_t length = 0u;
        if (!tw_find_path(state, creep->board, creep->x, creep->y,
                          path, TW_WIDTH * TW_HEIGHT, &length) || length == 0u) {
            state->faulted = true;
            return;
        }
        if (length == 1u) {
            leak_creep(state, creep);
            continue;
        }

        creep->x = path[1].x;
        creep->y = path[1].y;
        creep->move_cooldown = (uint16_t)(TW_CREEP_DEFS[creep->kind].move_period - 1u);
        if (creep->x == TW_EXIT.x && creep->y == TW_EXIT.y) leak_creep(state, creep);
    }
}

void tw_tick(tw_state_t *state) {
    if (!state || state->faulted || tw_winner(state) != TW_NO_WINNER) return;
    ++state->tick;
    if (state->tick % TW_INCOME_PERIOD == 0u) {
        for (unsigned p = 0; p < TW_PLAYERS; ++p) state->players[p].gold += state->players[p].income;
    }
    towers_attack(state);
    if (!state->faulted) move_creeps(state);
}

tw_result_t tw_apply_action(tw_state_t *state, const tw_action_t *action) {
    if (!action) return TW_ERR_FAULTED;
    switch (action->type) {
        case TW_ACTION_PLACE_TOWER:
            return tw_place_tower(state, action->player,
                                  (tw_tower_kind_t)action->kind,
                                  action->x, action->y);
        case TW_ACTION_SEND_CREEP:
            return tw_send_creep(state, action->player,
                                 (tw_creep_kind_t)action->kind);
        case TW_ACTION_TICK: {
            tw_result_t gate = mutable_state_gate(state);
            if (gate != TW_OK) return gate;
            tw_tick(state);
            return state->faulted ? TW_ERR_FAULTED : TW_OK;
        }
        default:
            return TW_ERR_KIND;
    }
}

bool tw_validate_state(const tw_state_t *state) {
    if (!state || state->faulted) return false;
    for (unsigned board = 0; board < TW_PLAYERS; ++board) {
        const tw_player_t *p = &state->players[board];
        if (p->gold < 0 || p->income < 0 || p->lives < 0) return false;
        if (p->blocked[TW_ENTRY.y][TW_ENTRY.x] || p->blocked[TW_EXIT.y][TW_EXIT.x]) return false;
        if (!tw_find_path(state, board, TW_ENTRY.x, TW_ENTRY.y, NULL, 0u, NULL)) return false;

        unsigned active_towers = 0u;
        unsigned blocked_cells = 0u;
        bool tower_cell[TW_HEIGHT][TW_WIDTH] = {{false}};
        for (size_t i = 0; i < TW_MAX_TOWERS; ++i) {
            const tw_tower_t *tower = &p->towers[i];
            if (!tower->active) continue;
            ++active_towers;
            if (!valid_tower_kind(tower->kind) || tower->id == 0u ||
                !in_bounds(tower->x, tower->y) || is_endpoint(tower->x, tower->y)) return false;
            if (!p->blocked[tower->y][tower->x] || tower_cell[tower->y][tower->x]) return false;
            tower_cell[tower->y][tower->x] = true;
        }
        for (unsigned y = 0; y < TW_HEIGHT; ++y) {
            for (unsigned x = 0; x < TW_WIDTH; ++x) {
                if (p->blocked[y][x]) {
                    ++blocked_cells;
                    if (!tower_cell[y][x]) return false;
                }
            }
        }
        if (active_towers != blocked_cells) return false;
    }

    for (size_t i = 0; i < TW_MAX_CREEPS; ++i) {
        const tw_creep_t *creep = &state->creeps[i];
        if (!creep->active) continue;
        if (creep->id == 0u || !valid_player(creep->owner) || !valid_player(creep->board) ||
            creep->board == creep->owner || !valid_creep_kind(creep->kind) ||
            !in_bounds(creep->x, creep->y) || creep->hp <= 0 ||
            state->players[creep->board].blocked[creep->y][creep->x] ||
            (creep->x == TW_EXIT.x && creep->y == TW_EXIT.y) ||
            !tw_find_path(state, creep->board, creep->x, creep->y, NULL, 0u, NULL)) {
            return false;
        }
    }
    return true;
}

static void hash_byte(uint64_t *hash, uint8_t value) {
    *hash ^= value;
    *hash *= UINT64_C(1099511628211);
}
static void hash_u64(uint64_t *hash, uint64_t value) {
    for (unsigned i = 0; i < 8u; ++i) hash_byte(hash, (uint8_t)(value >> (i * 8u)));
}

uint64_t tw_state_hash(const tw_state_t *state) {
    uint64_t hash = UINT64_C(1469598103934665603);
    if (!state) return 0u;
    hash_u64(&hash, state->tick);
    hash_u64(&hash, state->next_tower_id);
    hash_u64(&hash, state->next_creep_id);
    hash_u64(&hash, state->faulted ? 1u : 0u);

    for (unsigned p = 0; p < TW_PLAYERS; ++p) {
        const tw_player_t *player = &state->players[p];
        hash_u64(&hash, (uint64_t)(uint32_t)player->gold);
        hash_u64(&hash, (uint64_t)(uint32_t)player->income);
        hash_u64(&hash, (uint64_t)(uint32_t)player->lives);
        for (unsigned y = 0; y < TW_HEIGHT; ++y) {
            for (unsigned x = 0; x < TW_WIDTH; ++x) hash_u64(&hash, player->blocked[y][x] ? 1u : 0u);
        }
        for (size_t i = 0; i < TW_MAX_TOWERS; ++i) {
            const tw_tower_t *tower = &player->towers[i];
            hash_u64(&hash, tower->active ? 1u : 0u);
            if (!tower->active) continue;
            hash_u64(&hash, tower->id);
            hash_u64(&hash, tower->x);
            hash_u64(&hash, tower->y);
            hash_u64(&hash, (uint64_t)tower->kind);
            hash_u64(&hash, tower->cooldown_remaining);
        }
    }
    for (size_t i = 0; i < TW_MAX_CREEPS; ++i) {
        const tw_creep_t *creep = &state->creeps[i];
        hash_u64(&hash, creep->active ? 1u : 0u);
        if (!creep->active) continue;
        hash_u64(&hash, creep->id);
        hash_u64(&hash, creep->owner);
        hash_u64(&hash, creep->board);
        hash_u64(&hash, creep->x);
        hash_u64(&hash, creep->y);
        hash_u64(&hash, (uint64_t)creep->kind);
        hash_u64(&hash, (uint64_t)(uint32_t)creep->hp);
        hash_u64(&hash, creep->move_cooldown);
    }
    return hash;
}
