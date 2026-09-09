#include "tw_replay.h"

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

static void require_action(tw_session_t *session, const tw_action_t *action) {
    tw_apply_result_t match_result = TW_APPLY_INVALID_MATCH;
    assert(tw_session_apply_action(session, action, &match_result) == TW_SESSION_OK);
    assert(match_result == TW_APPLY_OK);
}

static tw_session_t make_terminal_recording(uint64_t seed) {
    tw_session_t session;
    assert(tw_session_init(&session, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 5000, seed));

    tw_action_t build = build_action(0, TW_TOWER_PULSE, 2, 0);
    require_action(&session, &build);

    tw_action_t send = send_action(0, TW_CREEP_SCOUT);
    for (unsigned i = 0; i < TW_STARTING_LIVES; ++i) {
        require_action(&session, &send);
    }

    assert(tw_session_step(&session, 16) == TW_SESSION_OK);
    assert(session.match.terminal);
    assert(session.match.winner == 0);
    assert(session.match.loser == 1);
    return session;
}

static void replay_reproduces_log_state_hash_and_terminal_result(void) {
    tw_session_t recorded = make_terminal_recording(UINT64_C(0x123456789abcdef0));
    tw_session_t replayed;

    assert(recorded.event_count == 22);
    assert(recorded.events[0].kind == TW_EVENT_ACTION);
    assert(recorded.events[21].kind == TW_EVENT_STEP);
    assert(recorded.events[21].data.ticks == 16);

    const uint64_t state_hash = tw_session_state_hash(&recorded);
    const uint64_t log_hash = tw_session_log_hash(&recorded);
    assert(state_hash != 0);
    assert(log_hash != 0);

    assert(tw_session_replay(&recorded, &replayed) == TW_SESSION_OK);
    assert(replayed.event_count == recorded.event_count);
    assert(tw_session_log_hash(&replayed) == log_hash);
    assert(tw_session_state_hash(&replayed) == state_hash);
    assert(replayed.match.terminal == recorded.match.terminal);
    assert(replayed.match.winner == recorded.match.winner);
    assert(replayed.match.loser == recorded.match.loser);
}

static void rejected_actions_are_not_authoritative_log_events(void) {
    tw_session_t session;
    assert(tw_session_init(&session, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 500, TW_DEFAULT_SEED));

    tw_action_t invalid = build_action(0, TW_TOWER_NEEDLE, 0, 1);
    const uint64_t state_before = tw_session_state_hash(&session);
    const uint64_t log_before = tw_session_log_hash(&session);
    tw_apply_result_t match_result = TW_APPLY_OK;

    assert(tw_session_apply_action(&session, &invalid, &match_result) == TW_SESSION_MATCH_REJECTED);
    assert(match_result == TW_APPLY_ILLEGAL_PLACEMENT);
    assert(session.event_count == 0);
    assert(tw_session_state_hash(&session) == state_before);
    assert(tw_session_log_hash(&session) == log_before);
}

static void tampered_ordered_log_fails_replay_verification(void) {
    tw_session_t recorded = make_terminal_recording(UINT64_C(0x0ddc0ffee));
    tw_session_t tampered = recorded;
    tw_session_t replayed;

    assert(tampered.events[0].kind == TW_EVENT_ACTION);
    assert(tampered.events[0].data.action.kind == TW_ACTION_BUILD);
    tampered.events[0].data.action.data.build.cell = (tw_cell_t){1, 0};

    assert(tw_session_log_hash(&tampered) != tw_session_log_hash(&recorded));
    assert(tw_session_replay(&tampered, &replayed) == TW_SESSION_REPLAY_DIVERGED);
}

static void seed_is_part_of_replay_state_identity(void) {
    tw_session_t recorded = make_terminal_recording(UINT64_C(111));
    tw_session_t other_seed = recorded;
    tw_session_t replayed;

    other_seed.origin.seed = UINT64_C(222);
    assert(tw_session_log_hash(&other_seed) == tw_session_log_hash(&recorded));
    assert(tw_session_state_hash(&other_seed) != tw_session_state_hash(&recorded));

    /* The same ordered events are internally reproducible under the changed
     * origin too, but they intentionally produce a different context-bound
     * state identity because the seed is different. */
    assert(tw_session_replay(&other_seed, &replayed) == TW_SESSION_OK);
    assert(tw_session_state_hash(&replayed) == tw_session_state_hash(&other_seed));
    assert(tw_session_state_hash(&replayed) != tw_session_state_hash(&recorded));
}

static void terminal_and_capacity_boundaries_do_not_append_phantom_events(void) {
    tw_session_t terminal = make_terminal_recording(UINT64_C(333));
    const uint16_t terminal_events = terminal.event_count;
    const uint64_t terminal_state_hash = tw_session_state_hash(&terminal);
    const uint64_t terminal_log_hash = tw_session_log_hash(&terminal);

    tw_action_t send = send_action(0, TW_CREEP_SCOUT);
    tw_apply_result_t match_result = TW_APPLY_OK;
    assert(tw_session_apply_action(&terminal, &send, &match_result) == TW_SESSION_MATCH_REJECTED);
    assert(match_result == TW_APPLY_MATCH_TERMINAL);
    assert(tw_session_step(&terminal, 1000) == TW_SESSION_OK);
    assert(terminal.event_count == terminal_events);
    assert(tw_session_state_hash(&terminal) == terminal_state_hash);
    assert(tw_session_log_hash(&terminal) == terminal_log_hash);

    tw_session_t full;
    assert(tw_session_init(&full, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 500, TW_DEFAULT_SEED));
    full.event_count = TW_MAX_LOG_EVENTS;
    const uint64_t match_before = tw_match_hash(&full.match);
    assert(tw_session_apply_action(&full, &send, &match_result) == TW_SESSION_LOG_CAPACITY);
    assert(tw_match_hash(&full.match) == match_before);
}

int main(void) {
    replay_reproduces_log_state_hash_and_terminal_result();
    rejected_actions_are_not_authoritative_log_events();
    tampered_ordered_log_fails_replay_verification();
    seed_is_part_of_replay_state_identity();
    terminal_and_capacity_boundaries_do_not_append_phantom_events();
    puts("TOWER_WARS_G7_REPLAY_HASH=PASS");
    return 0;
}
