#include "tw_match.h"

#include <assert.h>
#include <limits.h>
#include <stdio.h>

static tw_action_t send_action(uint8_t actor, tw_creep_kind_t creep) {
    return (tw_action_t){
        .actor = actor,
        .kind = TW_ACTION_SEND,
        .data.send = {.creep = creep},
    };
}

static void exactly_four_send_archetypes(void) {
    assert(TW_CREEP_COUNT == 4);
    assert(tw_creep_def(TW_CREEP_SCOUT));
    assert(tw_creep_def(TW_CREEP_SWARM));
    assert(tw_creep_def(TW_CREEP_BRUTE));
    assert(tw_creep_def(TW_CREEP_SIEGE));
    assert(!tw_creep_def((tw_creep_kind_t)TW_CREEP_COUNT));
    assert(!tw_creep_def((tw_creep_kind_t)99));
}

static void valid_send_debits_queues_and_increases_income_once(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}, 300));

    const tw_creep_def_t *def = tw_creep_def(TW_CREEP_SWARM);
    assert(def);
    const tw_action_t action = send_action(0, TW_CREEP_SWARM);

    assert(match.players[0].income == TW_STARTING_INCOME);
    assert(tw_match_apply_action(&match, &action) == TW_APPLY_OK);

    assert(match.players[0].gold == 300 - def->cost);
    assert(match.players[0].income == TW_STARTING_INCOME + def->income_gain);
    assert(match.players[1].gold == 300);
    assert(match.players[1].income == TW_STARTING_INCOME);

    assert(match.pending_send_count == 1);
    assert(match.pending_sends[0].id == 1);
    assert(match.pending_sends[0].sender == 0);
    assert(match.pending_sends[0].target == 1);
    assert(match.pending_sends[0].kind == TW_CREEP_SWARM);
    assert(match.next_creep_id == 2);
}

static void either_seat_uses_the_same_send_boundary(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}, 300));

    const tw_creep_def_t *def = tw_creep_def(TW_CREEP_BRUTE);
    assert(def);
    const tw_action_t action = send_action(1, TW_CREEP_BRUTE);
    assert(tw_match_apply_action(&match, &action) == TW_APPLY_OK);

    assert(match.pending_send_count == 1);
    assert(match.pending_sends[0].sender == 1);
    assert(match.pending_sends[0].target == 0);
    assert(match.players[1].gold == 300 - def->cost);
    assert(match.players[1].income == TW_STARTING_INCOME + def->income_gain);
    assert(match.players[0].gold == 300);
}

static void periodic_income_uses_post_send_income_deterministically(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}, 300));
    const tw_creep_def_t *def = tw_creep_def(TW_CREEP_SCOUT);
    assert(def);
    assert(tw_match_apply_action(&match, &(tw_action_t){
        .actor = 0,
        .kind = TW_ACTION_SEND,
        .data.send = {.creep = TW_CREEP_SCOUT},
    }) == TW_APPLY_OK);

    const uint32_t sender_after_send = 300 - def->cost;
    assert(tw_match_advance_income(&match, TW_INCOME_PERIOD_TICKS - 1));
    assert(match.players[0].gold == sender_after_send);
    assert(match.players[1].gold == 300);

    assert(tw_match_advance_income(&match, 1));
    assert(match.players[0].gold == sender_after_send + TW_STARTING_INCOME + def->income_gain);
    assert(match.players[1].gold == 300 + TW_STARTING_INCOME);

    tw_match_t replay = match;
    assert(tw_match_advance_income(&match, TW_INCOME_PERIOD_TICKS * 2));
    assert(tw_match_advance_income(&replay, TW_INCOME_PERIOD_TICKS * 2));
    assert(tw_match_hash(&match) == tw_match_hash(&replay));
}

static void invalid_sends_are_fail_closed_and_non_mutating(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 6, 4, (tw_cell_t){0, 1}, (tw_cell_t){5, 1}, 39));

    const uint64_t initial = tw_match_hash(&match);
    assert(tw_match_apply_action(&match, &(tw_action_t){
        .actor = 0,
        .kind = TW_ACTION_SEND,
        .data.send = {.creep = TW_CREEP_SCOUT},
    }) == TW_APPLY_INSUFFICIENT_GOLD);
    assert(tw_match_hash(&match) == initial);

    assert(tw_match_apply_action(&match, &(tw_action_t){
        .actor = 0,
        .kind = TW_ACTION_SEND,
        .data.send = {.creep = (tw_creep_kind_t)99},
    }) == TW_APPLY_INVALID_CREEP);
    assert(tw_match_hash(&match) == initial);
}

static void queue_and_economy_overflow_fail_atomically(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 6, 4, (tw_cell_t){0, 1}, (tw_cell_t){5, 1}, 1000));
    tw_action_t action = send_action(0, TW_CREEP_SCOUT);

    match.pending_send_count = TW_MAX_PENDING_SENDS;
    uint64_t before = tw_match_hash(&match);
    assert(tw_match_apply_action(&match, &action) == TW_APPLY_SEND_CAPACITY);
    assert(tw_match_hash(&match) == before);

    match.pending_send_count = 0;
    match.players[0].income = UINT32_MAX - 1;
    before = tw_match_hash(&match);
    assert(tw_match_apply_action(&match, &action) == TW_APPLY_ECONOMY_OVERFLOW);
    assert(tw_match_hash(&match) == before);

    match.players[0].income = TW_STARTING_INCOME;
    match.players[0].gold = UINT32_MAX;
    before = tw_match_hash(&match);
    assert(!tw_match_advance_income(&match, TW_INCOME_PERIOD_TICKS));
    assert(tw_match_hash(&match) == before);
}

int main(void) {
    exactly_four_send_archetypes();
    valid_send_debits_queues_and_increases_income_once();
    either_seat_uses_the_same_send_boundary();
    periodic_income_uses_post_send_income_deterministically();
    invalid_sends_are_fail_closed_and_non_mutating();
    queue_and_economy_overflow_fail_atomically();
    puts("TOWER_WARS_G3_AUTHORITATIVE_SEND_INCOME=PASS");
    return 0;
}
