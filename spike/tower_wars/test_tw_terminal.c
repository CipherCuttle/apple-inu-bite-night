#include "tw_match.h"

#include <assert.h>
#include <stdio.h>

static tw_action_t build_action(uint8_t actor, tw_tower_kind_t tower, uint8_t x, uint8_t y) {
    return (tw_action_t){
        .actor = actor,
        .kind = TW_ACTION_BUILD,
        .data.build = {.tower = tower, .cell = {x, y}},
    };
}

static tw_action_t send_action(uint8_t actor, tw_creep_kind_t creep) {
    return (tw_action_t){
        .actor = actor,
        .kind = TW_ACTION_SEND,
        .data.send = {.creep = creep},
    };
}

static void enqueue_scouts(tw_match_t *match, uint8_t actor, unsigned count) {
    tw_action_t send = send_action(actor, TW_CREEP_SCOUT);
    for (unsigned i = 0; i < count; ++i) {
        assert(tw_match_apply_action(match, &send) == TW_APPLY_OK);
    }
}

static void zero_lives_sets_exactly_one_terminal_result(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 5000));
    assert(!match.terminal);
    assert(match.winner == TW_NO_PLAYER);
    assert(match.loser == TW_NO_PLAYER);

    enqueue_scouts(&match, 0, TW_STARTING_LIVES);
    tw_match_t replay = match;

    /* Four route edges at 250 milli-cells/tick = sixteen ticks to leak. */
    assert(tw_match_step(&match, 16));
    assert(tw_match_step(&replay, 16));

    assert(match.terminal);
    assert(match.winner == 0);
    assert(match.loser == 1);
    assert(match.players[1].lives == 0);
    assert(match.players[0].lives == TW_STARTING_LIVES);
    assert(match.active_creep_count == 0);
    assert(match.pending_send_count == 0);
    assert(tw_match_hash(&match) == tw_match_hash(&replay));
}

static void terminal_state_rejects_actions_and_freezes_ticks(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 5000));
    enqueue_scouts(&match, 0, TW_STARTING_LIVES);
    assert(tw_match_step(&match, 16));
    assert(match.terminal);

    const uint64_t terminal_hash = tw_match_hash(&match);
    const uint64_t terminal_tick = match.tick;

    tw_action_t build = build_action(0, TW_TOWER_NEEDLE, 2, 0);
    tw_action_t send = send_action(0, TW_CREEP_SCOUT);
    assert(tw_match_apply_action(&match, &build) == TW_APPLY_MATCH_TERMINAL);
    assert(tw_match_apply_action(&match, &send) == TW_APPLY_MATCH_TERMINAL);
    assert(tw_match_hash(&match) == terminal_hash);

    tw_action_t bot_action;
    assert(!tw_bot_choose_build(&match, 1, &bot_action));
    assert(tw_match_hash(&match) == terminal_hash);

    assert(tw_match_step(&match, 1000));
    assert(match.tick == terminal_tick);
    assert(match.winner == 0);
    assert(match.loser == 1);
    assert(tw_match_hash(&match) == terminal_hash);
}

static void same_tick_terminal_race_uses_stable_queue_order(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 10000));

    /* Both sides can mathematically reach zero on tick 16. Queue order is
     * authoritative and stable, so actor 0's first batch resolves first. */
    enqueue_scouts(&match, 0, TW_STARTING_LIVES);
    enqueue_scouts(&match, 1, TW_STARTING_LIVES);
    tw_match_t replay = match;

    assert(tw_match_step(&match, 16));
    assert(tw_match_step(&replay, 16));

    assert(match.terminal);
    assert(match.winner == 0);
    assert(match.loser == 1);
    assert(match.players[1].lives == 0);
    assert(match.players[0].lives == TW_STARTING_LIVES);

    /* The opposing batch remains frozen; no second loser is allowed. */
    assert(match.active_creep_count == TW_STARTING_LIVES);
    for (uint16_t i = 0; i < match.active_creep_count; ++i) {
        assert(match.active_creeps[i].sender == 1);
        assert(match.active_creeps[i].target == 0);
    }
    assert(tw_match_hash(&match) == tw_match_hash(&replay));
}

int main(void) {
    zero_lives_sets_exactly_one_terminal_result();
    terminal_state_rejects_actions_and_freezes_ticks();
    same_tick_terminal_race_uses_stable_queue_order();
    puts("TOWER_WARS_G6_MATCH_TERMINATION=PASS");
    return 0;
}
