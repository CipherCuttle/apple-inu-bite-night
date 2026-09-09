#include "tw_hero_combat.h"

#include <assert.h>
#include <stdio.h>

static tw_session_t make_session(void) {
    tw_session_t session;
    assert(tw_session_init(&session,
                           9,
                           7,
                           (tw_cell_t){0, 3},
                           (tw_cell_t){8, 3},
                           500,
                           TW_DEFAULT_SEED));
    return session;
}

static void send_scout_to_player_zero(tw_session_t *session) {
    const tw_action_t send = {
        .actor = 1,
        .kind = TW_ACTION_SEND,
        .data.send = {.creep = TW_CREEP_SCOUT},
    };
    tw_apply_result_t match_result = TW_APPLY_INVALID_MATCH;
    assert(tw_session_apply_action(session, &send, &match_result) == TW_SESSION_OK);
    assert(match_result == TW_APPLY_OK);
    assert(tw_session_step(session, 1) == TW_SESSION_OK);
    assert(session->match.active_creep_count == 1);
    assert(session->match.active_creeps[0].target == 0);
    assert(session->match.active_creeps[0].hit_points == 45);
}

int main(void) {
    tw_session_t session = make_session();
    send_scout_to_player_zero(&session);

    const uint32_t creep_id = session.match.active_creeps[0].id;
    const uint16_t events_before_invalid = session.event_count;
    const uint64_t state_before_invalid = tw_session_state_hash(&session);
    const uint64_t log_before_invalid = tw_session_log_hash(&session);

    hlw_hero_attack_outcome_t outcome;
    assert(tw_session_hero_attack(&session, 1, creep_id, &outcome) ==
           HLW_HERO_ATTACK_INVALID_TARGET);
    assert(session.event_count == events_before_invalid);
    assert(tw_session_state_hash(&session) == state_before_invalid);
    assert(tw_session_log_hash(&session) == log_before_invalid);

    assert(tw_session_hero_attack(&session, 0, creep_id, &outcome) == HLW_HERO_ATTACK_OK);
    assert(!outcome.killed);
    assert(outcome.remaining_hit_points == 20);
    assert(outcome.reward_gold == 0);
    assert(session.match.active_creep_count == 1);
    assert(session.match.active_creeps[0].hit_points == 20);
    assert(session.match.players[0].gold == 500);
    assert(session.hero_ready_tick[0] == 5);

    const uint16_t events_before_cooldown = session.event_count;
    const uint64_t state_before_cooldown = tw_session_state_hash(&session);
    const uint64_t log_before_cooldown = tw_session_log_hash(&session);
    assert(tw_session_hero_attack(&session, 0, creep_id, &outcome) == HLW_HERO_ATTACK_COOLDOWN);
    assert(session.event_count == events_before_cooldown);
    assert(tw_session_state_hash(&session) == state_before_cooldown);
    assert(tw_session_log_hash(&session) == log_before_cooldown);

    assert(tw_session_step(&session, HLW_HERO_BASIC_CADENCE_TICKS) == TW_SESSION_OK);
    assert(session.match.tick == 5);
    assert(tw_session_hero_attack(&session, 0, creep_id, &outcome) == HLW_HERO_ATTACK_OK);
    assert(outcome.killed);
    assert(outcome.remaining_hit_points == 0);
    assert(outcome.reward_gold == HLW_HERO_KILL_GOLD_REWARD);
    assert(session.match.active_creep_count == 0);
    assert(session.match.players[0].gold == 500 + HLW_HERO_KILL_GOLD_REWARD);
    assert(session.match.players[0].lives == TW_STARTING_LIVES);

    const uint32_t gold_after_kill = session.match.players[0].gold;
    assert(tw_session_hero_attack(&session, 0, creep_id, &outcome) ==
           HLW_HERO_ATTACK_INVALID_TARGET);
    assert(session.match.players[0].gold == gold_after_kill);

    assert(tw_session_step(&session, 80) == TW_SESSION_OK);
    assert(session.match.active_creep_count == 0);
    assert(session.match.players[0].lives == TW_STARTING_LIVES);

    tw_session_t replayed;
    assert(tw_session_replay(&session, &replayed) == TW_SESSION_OK);
    assert(tw_session_state_hash(&replayed) == tw_session_state_hash(&session));
    assert(tw_session_log_hash(&replayed) == tw_session_log_hash(&session));
    assert(replayed.match.players[0].lives == TW_STARTING_LIVES);
    assert(replayed.match.active_creep_count == 0);

    puts("HERO_LINE_WARS_H3_CORE_COMBAT=PASS");
    return 0;
}
