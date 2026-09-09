#include "tw_match.h"

#include <assert.h>
#include <stdio.h>

static tw_action_t build_action(uint8_t actor, tw_tower_kind_t tower, uint8_t x, uint8_t y) {
    return (tw_action_t){
        .actor = actor,
        .kind = TW_ACTION_BUILD,
        .data.build = {
            .tower = tower,
            .cell = {x, y},
        },
    };
}

static void exactly_three_tower_archetypes(void) {
    assert(TW_TOWER_COUNT == 3);
    assert(tw_tower_def(TW_TOWER_NEEDLE));
    assert(tw_tower_def(TW_TOWER_PULSE));
    assert(tw_tower_def(TW_TOWER_ANVIL));
    assert(!tw_tower_def((tw_tower_kind_t)TW_TOWER_COUNT));
    assert(!tw_tower_def((tw_tower_kind_t)99));
}

static void successful_build_debits_once_and_creates_tower(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}, 300));

    const uint64_t opponent_grid_before = tw_grid_hash(&match.players[1].grid);
    const tw_action_t action = build_action(0, TW_TOWER_PULSE, 3, 2);
    const uint32_t cost = tw_tower_def(TW_TOWER_PULSE)->cost;

    assert(tw_match_apply_action(&match, &action) == TW_APPLY_OK);
    assert(match.players[0].gold == 300 - cost);
    assert(match.players[0].tower_count == 1);
    assert(match.players[0].towers[0].id == 1);
    assert(match.players[0].towers[0].owner == 0);
    assert(match.players[0].towers[0].kind == TW_TOWER_PULSE);
    assert(match.players[0].towers[0].cell.x == 3);
    assert(match.players[0].towers[0].cell.y == 2);
    assert(match.players[0].grid.blocked[2 * match.players[0].grid.width + 3] == 1);
    assert(match.next_tower_id == 2);

    /* Actor 0 cannot mutate actor 1's build field through a build action. */
    assert(tw_grid_hash(&match.players[1].grid) == opponent_grid_before);
    assert(match.players[1].gold == 300);
    assert(match.players[1].tower_count == 0);

    /* Replaying the identical build is invalid and cannot debit twice. */
    const uint64_t before_duplicate = tw_match_build_hash(&match);
    assert(tw_match_apply_action(&match, &action) == TW_APPLY_ILLEGAL_PLACEMENT);
    assert(tw_match_build_hash(&match) == before_duplicate);
    assert(match.players[0].gold == 300 - cost);
    assert(match.players[0].tower_count == 1);
    assert(match.next_tower_id == 2);
}

static void route_blocking_build_is_atomic_and_fail_closed(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 2000));

    assert(tw_match_apply_action(&match, &(tw_action_t){
        .actor = 0,
        .kind = TW_ACTION_BUILD,
        .data.build = {.tower = TW_TOWER_NEEDLE, .cell = {2, 0}},
    }) == TW_APPLY_OK);
    assert(tw_match_apply_action(&match, &(tw_action_t){
        .actor = 0,
        .kind = TW_ACTION_BUILD,
        .data.build = {.tower = TW_TOWER_NEEDLE, .cell = {2, 2}},
    }) == TW_APPLY_OK);

    const uint64_t before = tw_match_build_hash(&match);
    const uint32_t gold_before = match.players[0].gold;
    const uint16_t towers_before = match.players[0].tower_count;
    const uint32_t next_id_before = match.next_tower_id;

    const tw_action_t seal = build_action(0, TW_TOWER_ANVIL, 2, 1);
    assert(tw_match_apply_action(&match, &seal) == TW_APPLY_ILLEGAL_PLACEMENT);
    assert(tw_match_build_hash(&match) == before);
    assert(match.players[0].gold == gold_before);
    assert(match.players[0].tower_count == towers_before);
    assert(match.next_tower_id == next_id_before);
    assert(match.players[0].grid.blocked[1 * match.players[0].grid.width + 2] == 0);
}

static void insufficient_gold_and_invalid_actions_do_not_mutate(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 6, 4, (tw_cell_t){0, 1}, (tw_cell_t){5, 1}, 49));
    const uint64_t initial = tw_match_build_hash(&match);

    tw_action_t action = build_action(0, TW_TOWER_NEEDLE, 2, 2);
    assert(tw_match_apply_action(&match, &action) == TW_APPLY_INSUFFICIENT_GOLD);
    assert(tw_match_build_hash(&match) == initial);

    action.actor = 2;
    assert(tw_match_apply_action(&match, &action) == TW_APPLY_INVALID_ACTOR);
    assert(tw_match_build_hash(&match) == initial);

    action.actor = 0;
    action.data.build.tower = (tw_tower_kind_t)99;
    assert(tw_match_apply_action(&match, &action) == TW_APPLY_INVALID_TOWER);
    assert(tw_match_build_hash(&match) == initial);

    assert(tw_match_apply_action(&match, NULL) == TW_APPLY_INVALID_ACTION);
    assert(tw_match_build_hash(&match) == initial);
}

static void bot_plans_purely_then_uses_same_action_boundary(void) {
    tw_match_t match;
    tw_action_t bot_action;
    assert(tw_match_init(&match, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}, 300));

    const uint64_t before_plan = tw_match_build_hash(&match);
    assert(tw_bot_choose_build(&match, 1, &bot_action));
    assert(tw_match_build_hash(&match) == before_plan);
    assert(bot_action.actor == 1);
    assert(bot_action.kind == TW_ACTION_BUILD);
    assert(bot_action.data.build.tower == TW_TOWER_NEEDLE);

    const uint32_t cost = tw_tower_def(bot_action.data.build.tower)->cost;
    assert(tw_match_apply_action(&match, &bot_action) == TW_APPLY_OK);
    assert(match.players[1].gold == 300 - cost);
    assert(match.players[1].tower_count == 1);
    assert(match.players[1].towers[0].owner == 1);
    assert(match.players[0].gold == 300);
    assert(match.players[0].tower_count == 0);
}

int main(void) {
    exactly_three_tower_archetypes();
    successful_build_debits_once_and_creates_tower();
    route_blocking_build_is_atomic_and_fail_closed();
    insufficient_gold_and_invalid_actions_do_not_mutate();
    bot_plans_purely_then_uses_same_action_boundary();
    puts("TOWER_WARS_G2_AUTHORITATIVE_BUILD=PASS");
    return 0;
}
