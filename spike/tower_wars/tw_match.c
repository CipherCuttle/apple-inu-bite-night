#include "tw_match.h"

#include <limits.h>
#include <string.h>

static const tw_tower_def_t tower_defs[TW_TOWER_COUNT] = {
    [TW_TOWER_NEEDLE] = {
        .kind = TW_TOWER_NEEDLE,
        .cost = 50,
        .damage = 10,
        .range_cells = 3,
        .cadence_ticks = 10,
    },
    [TW_TOWER_PULSE] = {
        .kind = TW_TOWER_PULSE,
        .cost = 75,
        .damage = 7,
        .range_cells = 2,
        .cadence_ticks = 5,
    },
    [TW_TOWER_ANVIL] = {
        .kind = TW_TOWER_ANVIL,
        .cost = 100,
        .damage = 24,
        .range_cells = 2,
        .cadence_ticks = 18,
    },
};

static const tw_creep_def_t creep_defs[TW_CREEP_COUNT] = {
    [TW_CREEP_SCOUT] = {
        .kind = TW_CREEP_SCOUT,
        .cost = 40,
        .income_gain = 4,
        .hit_points = 45,
        .speed_milli_cells_per_tick = 250,
        .leak_damage = 1,
    },
    [TW_CREEP_SWARM] = {
        .kind = TW_CREEP_SWARM,
        .cost = 60,
        .income_gain = 6,
        .hit_points = 70,
        .speed_milli_cells_per_tick = 300,
        .leak_damage = 1,
    },
    [TW_CREEP_BRUTE] = {
        .kind = TW_CREEP_BRUTE,
        .cost = 90,
        .income_gain = 9,
        .hit_points = 150,
        .speed_milli_cells_per_tick = 180,
        .leak_damage = 2,
    },
    [TW_CREEP_SIEGE] = {
        .kind = TW_CREEP_SIEGE,
        .cost = 130,
        .income_gain = 13,
        .hit_points = 300,
        .speed_milli_cells_per_tick = 120,
        .leak_damage = 3,
    },
};

static bool valid_actor(uint8_t actor) {
    return actor < TW_PLAYER_COUNT;
}

static bool valid_tower(tw_tower_kind_t kind) {
    return (int)kind >= 0 && kind < TW_TOWER_COUNT;
}

static bool valid_creep(tw_creep_kind_t kind) {
    return (int)kind >= 0 && kind < TW_CREEP_COUNT;
}

const tw_tower_def_t *tw_tower_def(tw_tower_kind_t kind) {
    if (!valid_tower(kind)) return NULL;
    return &tower_defs[kind];
}

const tw_creep_def_t *tw_creep_def(tw_creep_kind_t kind) {
    if (!valid_creep(kind)) return NULL;
    return &creep_defs[kind];
}

bool tw_match_init(tw_match_t *match,
                   uint8_t width,
                   uint8_t height,
                   tw_cell_t entrance,
                   tw_cell_t exit,
                   uint32_t starting_gold) {
    if (!match) return false;
    memset(match, 0, sizeof(*match));

    for (uint8_t player = 0; player < TW_PLAYER_COUNT; ++player) {
        if (!tw_grid_init(&match->players[player].grid, width, height, entrance, exit)) {
            memset(match, 0, sizeof(*match));
            return false;
        }
        match->players[player].gold = starting_gold;
        match->players[player].income = TW_STARTING_INCOME;
        match->players[player].lives = TW_STARTING_LIVES;
    }
    match->next_tower_id = 1;
    match->next_creep_id = 1;
    return true;
}

static bool candidate_preserves_active_creep_routes(const tw_match_t *match,
                                                     uint8_t target,
                                                     const tw_grid_t *candidate_grid) {
    for (uint16_t i = 0; i < match->active_creep_count; ++i) {
        const tw_creep_t *creep = &match->active_creeps[i];
        if (creep->target != target) continue;
        tw_path_t path;
        if (!tw_grid_find_path_between(candidate_grid, creep->cell, candidate_grid->exit, &path)) {
            return false;
        }
    }
    return true;
}

static tw_apply_result_t apply_build(tw_match_t *match, const tw_action_t *action) {
    if (!valid_tower(action->data.build.tower)) return TW_APPLY_INVALID_TOWER;

    tw_player_state_t *player = &match->players[action->actor];
    const tw_tower_def_t *def = tw_tower_def(action->data.build.tower);
    if (!def) return TW_APPLY_INVALID_TOWER;
    if (player->gold < def->cost) return TW_APPLY_INSUFFICIENT_GOLD;
    if (player->tower_count >= TW_MAX_TOWERS_PER_PLAYER) return TW_APPLY_TOWER_CAPACITY;

    /* Validate on a complete copy first. No authoritative field changes until
     * placement, entrance routing, active-creep routing, funds and capacity
     * have all passed. */
    tw_grid_t candidate_grid = player->grid;
    if (!tw_grid_try_place(&candidate_grid, action->data.build.cell, NULL)) {
        return TW_APPLY_ILLEGAL_PLACEMENT;
    }
    if (!candidate_preserves_active_creep_routes(match, action->actor, &candidate_grid)) {
        return TW_APPLY_ILLEGAL_PLACEMENT;
    }

    const uint16_t slot = player->tower_count;
    const uint32_t tower_id = match->next_tower_id;

    player->grid = candidate_grid;
    player->gold -= def->cost;
    player->towers[slot] = (tw_tower_t){
        .id = tower_id,
        .owner = action->actor,
        .kind = action->data.build.tower,
        .cell = action->data.build.cell,
    };
    player->tower_count = (uint16_t)(slot + 1);
    match->next_tower_id = tower_id + 1;
    return TW_APPLY_OK;
}

static tw_apply_result_t apply_send(tw_match_t *match, const tw_action_t *action) {
    if (!valid_creep(action->data.send.creep)) return TW_APPLY_INVALID_CREEP;

    tw_player_state_t *sender = &match->players[action->actor];
    const tw_creep_def_t *def = tw_creep_def(action->data.send.creep);
    if (!def) return TW_APPLY_INVALID_CREEP;
    if (sender->gold < def->cost) return TW_APPLY_INSUFFICIENT_GOLD;
    if ((uint32_t)match->pending_send_count + match->active_creep_count >= TW_MAX_CREEPS) {
        return TW_APPLY_SEND_CAPACITY;
    }
    if (sender->income > UINT32_MAX - def->income_gain) return TW_APPLY_ECONOMY_OVERFLOW;

    const uint16_t slot = match->pending_send_count;
    const uint32_t creep_id = match->next_creep_id;
    const uint8_t target = (uint8_t)(action->actor ^ 1u);

    sender->gold -= def->cost;
    sender->income += def->income_gain;
    match->pending_sends[slot] = (tw_pending_send_t){
        .id = creep_id,
        .sender = action->actor,
        .target = target,
        .kind = action->data.send.creep,
    };
    match->pending_send_count = (uint16_t)(slot + 1);
    match->next_creep_id = creep_id + 1;
    return TW_APPLY_OK;
}

tw_apply_result_t tw_match_apply_action(tw_match_t *match, const tw_action_t *action) {
    if (!match) return TW_APPLY_INVALID_MATCH;
    if (!action) return TW_APPLY_INVALID_ACTION;
    if (!valid_actor(action->actor)) return TW_APPLY_INVALID_ACTOR;

    switch (action->kind) {
        case TW_ACTION_BUILD:
            return apply_build(match, action);
        case TW_ACTION_SEND:
            return apply_send(match, action);
        default:
            return TW_APPLY_INVALID_ACTION;
    }
}

static bool spawn_pending_sends(tw_match_t *match) {
    if ((uint32_t)match->active_creep_count + match->pending_send_count > TW_MAX_CREEPS) {
        return false;
    }

    /* Preflight every queued send before changing either queue/count. */
    for (uint16_t i = 0; i < match->pending_send_count; ++i) {
        const tw_pending_send_t *send = &match->pending_sends[i];
        if (!valid_actor(send->sender) || !valid_actor(send->target) || !valid_creep(send->kind)) {
            return false;
        }
        tw_path_t path;
        if (!tw_grid_find_path(&match->players[send->target].grid, &path)) return false;
    }

    const uint16_t base = match->active_creep_count;
    for (uint16_t i = 0; i < match->pending_send_count; ++i) {
        const tw_pending_send_t *send = &match->pending_sends[i];
        const tw_creep_def_t *def = tw_creep_def(send->kind);
        if (!def) return false;
        match->active_creeps[base + i] = (tw_creep_t){
            .id = send->id,
            .sender = send->sender,
            .target = send->target,
            .kind = send->kind,
            .hit_points = def->hit_points,
            .cell = match->players[send->target].grid.entrance,
            .progress_milli = 0,
        };
    }
    match->active_creep_count = (uint16_t)(base + match->pending_send_count);
    match->pending_send_count = 0;
    return true;
}

static void remove_active_creep(tw_match_t *match, uint16_t index) {
    if (index >= match->active_creep_count) return;
    const uint16_t remaining = (uint16_t)(match->active_creep_count - index - 1);
    if (remaining) {
        memmove(&match->active_creeps[index],
                &match->active_creeps[index + 1],
                (size_t)remaining * sizeof(match->active_creeps[0]));
    }
    match->active_creep_count--;
    memset(&match->active_creeps[match->active_creep_count], 0, sizeof(match->active_creeps[0]));
}

static bool leak_creep(tw_match_t *match, uint16_t index) {
    if (index >= match->active_creep_count) return false;
    const tw_creep_t *creep = &match->active_creeps[index];
    if (!valid_actor(creep->target) || !valid_creep(creep->kind)) return false;
    const tw_creep_def_t *def = tw_creep_def(creep->kind);
    if (!def) return false;

    tw_player_state_t *target = &match->players[creep->target];
    if (def->leak_damage >= target->lives) target->lives = 0;
    else target->lives = (uint16_t)(target->lives - def->leak_damage);
    remove_active_creep(match, index);
    return true;
}

static bool pay_income_if_due(tw_match_t *match) {
    if (match->tick % TW_INCOME_PERIOD_TICKS != 0) return true;

    for (uint8_t p = 0; p < TW_PLAYER_COUNT; ++p) {
        if (match->players[p].gold > UINT32_MAX - match->players[p].income) return false;
    }
    for (uint8_t p = 0; p < TW_PLAYER_COUNT; ++p) {
        match->players[p].gold += match->players[p].income;
    }
    return true;
}

static bool move_creeps_one_tick(tw_match_t *match) {
    uint16_t i = 0;
    while (i < match->active_creep_count) {
        tw_creep_t *creep = &match->active_creeps[i];
        if (!valid_actor(creep->target) || !valid_creep(creep->kind)) return false;
        const tw_creep_def_t *def = tw_creep_def(creep->kind);
        if (!def) return false;

        creep->progress_milli = (uint16_t)(creep->progress_milli + def->speed_milli_cells_per_tick);
        bool removed = false;
        while (creep->progress_milli >= 1000) {
            const tw_grid_t *grid = &match->players[creep->target].grid;
            tw_path_t path;
            if (!tw_grid_find_path_between(grid, creep->cell, grid->exit, &path) || path.length == 0) {
                return false;
            }

            if (path.length == 1) {
                if (!leak_creep(match, i)) return false;
                removed = true;
                break;
            }

            creep->cell = path.cells[1];
            creep->progress_milli = (uint16_t)(creep->progress_milli - 1000);
            if (creep->cell.x == grid->exit.x && creep->cell.y == grid->exit.y) {
                if (!leak_creep(match, i)) return false;
                removed = true;
                break;
            }
        }
        if (!removed) ++i;
    }
    return true;
}

static bool step_in_place(tw_match_t *match, uint32_t ticks) {
    for (uint32_t n = 0; n < ticks; ++n) {
        if (!spawn_pending_sends(match)) return false;
        if (match->tick == UINT64_MAX) return false;
        match->tick++;
        if (!pay_income_if_due(match)) return false;
        if (!move_creeps_one_tick(match)) return false;
    }
    return true;
}

bool tw_match_step(tw_match_t *match, uint32_t ticks) {
    if (!match) return false;

    /* Whole-call transactional stepping: malformed state or economy overflow
     * cannot leave a partially advanced authoritative simulation behind. */
    tw_match_t candidate = *match;
    if (!step_in_place(&candidate, ticks)) return false;
    *match = candidate;
    return true;
}

bool tw_match_advance_income(tw_match_t *match, uint32_t ticks) {
    return tw_match_step(match, ticks);
}

bool tw_bot_choose_build(const tw_match_t *match, uint8_t actor, tw_action_t *action_out) {
    if (!match || !action_out || !valid_actor(actor)) return false;

    const tw_player_state_t *player = &match->players[actor];
    const tw_tower_def_t *def = tw_tower_def(TW_TOWER_NEEDLE);
    if (!def || player->gold < def->cost || player->tower_count >= TW_MAX_TOWERS_PER_PLAYER) {
        return false;
    }

    /* Frozen V0 planner order: row-major cells, cheapest archetype first.
     * It only proves legality on copies. Mutation still belongs exclusively to
     * tw_match_apply_action(). */
    for (uint8_t y = 0; y < player->grid.height; ++y) {
        for (uint8_t x = 0; x < player->grid.width; ++x) {
            tw_match_t candidate_match = *match;
            tw_action_t candidate_action = {
                .actor = actor,
                .kind = TW_ACTION_BUILD,
                .data.build = {
                    .tower = TW_TOWER_NEEDLE,
                    .cell = {x, y},
                },
            };
            if (tw_match_apply_action(&candidate_match, &candidate_action) != TW_APPLY_OK) continue;
            *action_out = candidate_action;
            return true;
        }
    }
    return false;
}

static uint64_t hash_byte(uint64_t hash, uint8_t byte) {
    hash ^= byte;
    return hash * UINT64_C(1099511628211);
}

static uint64_t hash_u32(uint64_t hash, uint32_t value) {
    for (unsigned shift = 0; shift < 32; shift += 8) {
        hash = hash_byte(hash, (uint8_t)(value >> shift));
    }
    return hash;
}

static uint64_t hash_u64(uint64_t hash, uint64_t value) {
    for (unsigned shift = 0; shift < 64; shift += 8) {
        hash = hash_byte(hash, (uint8_t)(value >> shift));
    }
    return hash;
}

uint64_t tw_match_hash(const tw_match_t *match) {
    if (!match) return 0;

    uint64_t hash = UINT64_C(1469598103934665603);
    hash = hash_u32(hash, match->next_tower_id);
    hash = hash_u32(hash, match->next_creep_id);
    hash = hash_u64(hash, match->tick);
    hash = hash_u32(hash, match->pending_send_count);
    hash = hash_u32(hash, match->active_creep_count);

    for (uint8_t p = 0; p < TW_PLAYER_COUNT; ++p) {
        const tw_player_state_t *player = &match->players[p];
        hash = hash_u32(hash, player->gold);
        hash = hash_u32(hash, player->income);
        hash = hash_u32(hash, player->lives);
        hash = hash_u64(hash, tw_grid_hash(&player->grid));
        hash = hash_u32(hash, player->tower_count);
        for (uint16_t i = 0; i < player->tower_count; ++i) {
            const tw_tower_t *tower = &player->towers[i];
            hash = hash_u32(hash, tower->id);
            hash = hash_byte(hash, tower->owner);
            hash = hash_u32(hash, (uint32_t)tower->kind);
            hash = hash_byte(hash, tower->cell.x);
            hash = hash_byte(hash, tower->cell.y);
        }
    }

    for (uint16_t i = 0; i < match->pending_send_count; ++i) {
        const tw_pending_send_t *send = &match->pending_sends[i];
        hash = hash_u32(hash, send->id);
        hash = hash_byte(hash, send->sender);
        hash = hash_byte(hash, send->target);
        hash = hash_u32(hash, (uint32_t)send->kind);
    }

    for (uint16_t i = 0; i < match->active_creep_count; ++i) {
        const tw_creep_t *creep = &match->active_creeps[i];
        hash = hash_u32(hash, creep->id);
        hash = hash_byte(hash, creep->sender);
        hash = hash_byte(hash, creep->target);
        hash = hash_u32(hash, (uint32_t)creep->kind);
        hash = hash_u32(hash, creep->hit_points);
        hash = hash_byte(hash, creep->cell.x);
        hash = hash_byte(hash, creep->cell.y);
        hash = hash_u32(hash, creep->progress_milli);
    }
    return hash;
}

uint64_t tw_match_build_hash(const tw_match_t *match) {
    return tw_match_hash(match);
}
