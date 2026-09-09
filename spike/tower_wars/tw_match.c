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
    }
    match->next_tower_id = 1;
    match->next_creep_id = 1;
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
     * placement, route preservation, funds and capacity have all passed. */
    tw_grid_t candidate_grid = player->grid;
    if (!tw_grid_try_place(&candidate_grid, action->data.build.cell, NULL)) {
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
    if (match->pending_send_count >= TW_MAX_PENDING_SENDS) return TW_APPLY_SEND_CAPACITY;
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

bool tw_match_advance_income(tw_match_t *match, uint32_t ticks) {
    if (!match) return false;
    if (UINT64_MAX - match->tick < ticks) return false;

    const uint64_t old_period = match->tick / TW_INCOME_PERIOD_TICKS;
    const uint64_t new_tick = match->tick + ticks;
    const uint64_t new_period = new_tick / TW_INCOME_PERIOD_TICKS;
    const uint64_t periods = new_period - old_period;
    uint64_t payouts[TW_PLAYER_COUNT] = {0};

    for (uint8_t p = 0; p < TW_PLAYER_COUNT; ++p) {
        payouts[p] = (uint64_t)match->players[p].income * periods;
        if (payouts[p] > UINT32_MAX - match->players[p].gold) return false;
    }

    match->tick = new_tick;
    for (uint8_t p = 0; p < TW_PLAYER_COUNT; ++p) {
        match->players[p].gold += (uint32_t)payouts[p];
    }
    return true;
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
            tw_grid_t candidate = player->grid;
            const tw_cell_t cell = {x, y};
            if (!tw_grid_try_place(&candidate, cell, NULL)) continue;

            *action_out = (tw_action_t){
                .actor = actor,
                .kind = TW_ACTION_BUILD,
                .data.build = {
                    .tower = TW_TOWER_NEEDLE,
                    .cell = cell,
                },
            };
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

    for (uint8_t p = 0; p < TW_PLAYER_COUNT; ++p) {
        const tw_player_state_t *player = &match->players[p];
        hash = hash_u32(hash, player->gold);
        hash = hash_u32(hash, player->income);
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
    return hash;
}

uint64_t tw_match_build_hash(const tw_match_t *match) {
    return tw_match_hash(match);
}
