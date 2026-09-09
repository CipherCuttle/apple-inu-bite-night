#include "tw_match.h"

#include <assert.h>
#include <stdio.h>

static tw_action_t send_action(uint8_t actor, tw_creep_kind_t creep) {
    return (tw_action_t){
        .actor = actor,
        .kind = TW_ACTION_SEND,
        .data.send = {.creep = creep},
    };
}

static tw_action_t build_action(uint8_t actor, tw_tower_kind_t tower, uint8_t x, uint8_t y) {
    return (tw_action_t){
        .actor = actor,
        .kind = TW_ACTION_BUILD,
        .data.build = {.tower = tower, .cell = {x, y}},
    };
}

static void send_spawns_moves_and_leaks_once(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 500));
    tw_action_t send = send_action(0, TW_CREEP_SCOUT);
    assert(tw_match_apply_action(&match, &send) == TW_APPLY_OK);
    assert(match.pending_send_count == 1);
    assert(match.active_creep_count == 0);
    assert(match.players[1].lives == TW_STARTING_LIVES);

    assert(tw_match_step(&match, 1));
    assert(match.pending_send_count == 0);
    assert(match.active_creep_count == 1);
    assert(match.active_creeps[0].id == 1);
    assert(match.active_creeps[0].sender == 0);
    assert(match.active_creeps[0].target == 1);
    assert(match.active_creeps[0].kind == TW_CREEP_SCOUT);
    assert(match.active_creeps[0].hit_points == tw_creep_def(TW_CREEP_SCOUT)->hit_points);
    assert(match.active_creeps[0].cell.x == 0 && match.active_creeps[0].cell.y == 1);
    assert(match.active_creeps[0].progress_milli == 250);

    assert(tw_match_step(&match, 3));
    assert(match.active_creep_count == 1);
    assert(match.active_creeps[0].cell.x == 1 && match.active_creeps[0].cell.y == 1);
    assert(match.active_creeps[0].progress_milli == 0);
    assert(match.players[1].lives == TW_STARTING_LIVES);

    /* Four edges at 250 milli-cells/tick = exactly sixteen ticks total. */
    assert(tw_match_step(&match, 12));
    assert(match.active_creep_count == 0);
    assert(match.players[1].lives == TW_STARTING_LIVES - 1);

    const uint16_t lives_after_leak = match.players[1].lives;
    assert(tw_match_step(&match, 20));
    assert(match.active_creep_count == 0);
    assert(match.players[1].lives == lives_after_leak);
}

static void current_grid_reroutes_creep_deterministically(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 500));

    tw_action_t tower = build_action(1, TW_TOWER_NEEDLE, 2, 1);
    assert(tw_match_apply_action(&match, &tower) == TW_APPLY_OK);
    tw_action_t send = send_action(0, TW_CREEP_SCOUT);
    assert(tw_match_apply_action(&match, &send) == TW_APPLY_OK);

    tw_match_t replay = match;
    assert(tw_match_step(&match, 4));
    assert(tw_match_step(&replay, 4));
    assert(tw_match_hash(&match) == tw_match_hash(&replay));

    assert(match.active_creep_count == 1);
    /* North is the first equal-cost detour under the frozen N,E,S,W tie-break. */
    assert(match.active_creeps[0].cell.x == 0);
    assert(match.active_creeps[0].cell.y == 0);

    assert(tw_match_step(&match, 20));
    assert(tw_match_step(&replay, 20));
    assert(tw_match_hash(&match) == tw_match_hash(&replay));
    assert(match.active_creep_count == 0);
    assert(match.players[1].lives == TW_STARTING_LIVES - 1);
}

static void build_cannot_strand_an_active_creep(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 500));

    tw_action_t send = send_action(0, TW_CREEP_SCOUT);
    assert(tw_match_apply_action(&match, &send) == TW_APPLY_OK);
    assert(tw_match_step(&match, 4));
    assert(match.active_creep_count == 1);
    assert(match.active_creeps[0].cell.x == 1 && match.active_creeps[0].cell.y == 1);

    /* Entrance->exit would still have a north/south detour if (1,1) were
     * blocked, but the creep currently standing there would be stranded. */
    tw_action_t trap = build_action(1, TW_TOWER_NEEDLE, 1, 1);
    const uint64_t before = tw_match_hash(&match);
    assert(tw_match_apply_action(&match, &trap) == TW_APPLY_ILLEGAL_PLACEMENT);
    assert(tw_match_hash(&match) == before);
    assert(match.players[1].grid.blocked[1 * match.players[1].grid.width + 1] == 0);
}

static void leak_damage_is_declared_and_applied_once(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 3, 3, (tw_cell_t){0, 1}, (tw_cell_t){2, 1}, 500));
    const tw_creep_def_t *def = tw_creep_def(TW_CREEP_BRUTE);
    assert(def && def->leak_damage == 2);

    tw_action_t send = send_action(0, TW_CREEP_BRUTE);
    assert(tw_match_apply_action(&match, &send) == TW_APPLY_OK);

    /* Two edges = 2000 milli-cells; 12 ticks at 180 reaches 2160. */
    assert(tw_match_step(&match, 12));
    assert(match.active_creep_count == 0);
    assert(match.players[1].lives == TW_STARTING_LIVES - def->leak_damage);
    const uint16_t after = match.players[1].lives;
    assert(tw_match_step(&match, 12));
    assert(match.players[1].lives == after);
}

int main(void) {
    send_spawns_moves_and_leaks_once();
    current_grid_reroutes_creep_deterministically();
    build_cannot_strand_an_active_creep();
    leak_damage_is_declared_and_applied_once();
    puts("TOWER_WARS_G4_CREEP_ROUTE_LEAK=PASS");
    return 0;
}
