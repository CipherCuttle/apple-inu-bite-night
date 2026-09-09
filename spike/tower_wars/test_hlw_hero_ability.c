#include "tw_hero_ability.h"
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

static uint32_t send_swarm_to_player_zero(tw_session_t *session) {
    const tw_action_t send = {
        .actor = 1,
        .kind = TW_ACTION_SEND,
        .data.send = {.creep = TW_CREEP_SWARM},
    };
    tw_apply_result_t match_result = TW_APPLY_INVALID_MATCH;
    assert(tw_session_apply_action(session, &send, &match_result) == TW_SESSION_OK);
    assert(match_result == TW_APPLY_OK);
    assert(tw_session_step(session, 1) == TW_SESSION_OK);
    assert(session->match.active_creep_count == 1);
    assert(session->match.active_creeps[0].target == 0);
    assert(session->match.active_creeps[0].hit_points == 70);
    return session->match.active_creeps[0].id;
}

static void assert_unchanged(const tw_session_t *session,
                             uint16_t events,
                             uint64_t state_hash,
                             uint64_t log_hash) {
    assert(session->event_count == events);
    assert(tw_session_state_hash(session) == state_hash);
    assert(tw_session_log_hash(session) == log_hash);
}

int main(void) {
    tw_session_t session = make_session();
    const uint32_t creep_id = send_swarm_to_player_zero(&session);
    hlw_hero_ability_outcome_t outcome;

    const uint16_t wrong_events = session.event_count;
    const uint64_t wrong_state = tw_session_state_hash(&session);
    const uint64_t wrong_log = tw_session_log_hash(&session);
    assert(tw_session_hero_ability(&session, 1, creep_id, &outcome) ==
           HLW_HERO_ABILITY_INVALID_TARGET);
    assert_unchanged(&session, wrong_events, wrong_state, wrong_log);

    assert(tw_session_hero_ability(&session, 0, creep_id, &outcome) ==
           HLW_HERO_ABILITY_OK);
    assert(!outcome.killed);
    assert(outcome.remaining_hit_points == 10);
    assert(outcome.gold_cost == HLW_HERO_ABILITY_GOLD_COST);
    assert(outcome.reward_gold == 0);
    assert(session.match.active_creep_count == 1);
    assert(session.match.active_creeps[0].hit_points == 10);
    assert(session.match.players[0].gold == 485);
    assert(session.hero_ability_ready_tick[0] == 13);

    const uint16_t cooldown_events = session.event_count;
    const uint64_t cooldown_state = tw_session_state_hash(&session);
    const uint64_t cooldown_log = tw_session_log_hash(&session);
    assert(tw_session_hero_ability(&session, 0, creep_id, &outcome) ==
           HLW_HERO_ABILITY_COOLDOWN);
    assert_unchanged(&session, cooldown_events, cooldown_state, cooldown_log);

    assert(tw_session_step(&session, HLW_HERO_ABILITY_COOLDOWN_TICKS) == TW_SESSION_OK);
    assert(session.match.tick == 13);
    assert(tw_session_hero_ability(&session, 0, creep_id, &outcome) ==
           HLW_HERO_ABILITY_OK);
    assert(outcome.killed);
    assert(outcome.remaining_hit_points == 0);
    assert(outcome.gold_cost == HLW_HERO_ABILITY_GOLD_COST);
    assert(outcome.reward_gold == HLW_HERO_KILL_GOLD_REWARD);
    assert(session.match.active_creep_count == 0);
    assert(session.match.players[0].gold == 490);
    assert(session.match.players[0].lives == TW_STARTING_LIVES);
    assert(session.hero_ability_ready_tick[0] == 25);

    const uint32_t gold_after_kill = session.match.players[0].gold;
    const uint16_t post_kill_events = session.event_count;
    const uint64_t post_kill_state = tw_session_state_hash(&session);
    const uint64_t post_kill_log = tw_session_log_hash(&session);
    assert(tw_session_hero_ability(&session, 0, creep_id, &outcome) ==
           HLW_HERO_ABILITY_COOLDOWN);
    assert(session.match.players[0].gold == gold_after_kill);
    assert_unchanged(&session, post_kill_events, post_kill_state, post_kill_log);

    assert(tw_session_step(&session, HLW_HERO_ABILITY_COOLDOWN_TICKS) == TW_SESSION_OK);
    const uint32_t gold_before_retired_retry = session.match.players[0].gold;
    const uint16_t retired_events = session.event_count;
    const uint64_t retired_state = tw_session_state_hash(&session);
    const uint64_t retired_log = tw_session_log_hash(&session);
    assert(tw_session_hero_ability(&session, 0, creep_id, &outcome) ==
           HLW_HERO_ABILITY_INVALID_TARGET);
    assert(session.match.players[0].gold == gold_before_retired_retry);
    assert_unchanged(&session, retired_events, retired_state, retired_log);

    assert(tw_session_step(&session, 80) == TW_SESSION_OK);
    assert(session.match.active_creep_count == 0);
    assert(session.match.players[0].lives == TW_STARTING_LIVES);

    tw_session_t replayed;
    assert(tw_session_replay(&session, &replayed) == TW_SESSION_OK);
    assert(tw_session_state_hash(&replayed) == tw_session_state_hash(&session));
    assert(tw_session_log_hash(&replayed) == tw_session_log_hash(&session));
    assert(replayed.match.active_creep_count == 0);
    assert(replayed.match.players[0].lives == TW_STARTING_LIVES);

    tw_session_t poor = make_session();
    const uint32_t poor_creep = send_swarm_to_player_zero(&poor);
    poor.match.players[0].gold = HLW_HERO_ABILITY_GOLD_COST - 1;
    const uint16_t poor_events = poor.event_count;
    const uint64_t poor_state = tw_session_state_hash(&poor);
    const uint64_t poor_log = tw_session_log_hash(&poor);
    assert(tw_session_hero_ability(&poor, 0, poor_creep, &outcome) ==
           HLW_HERO_ABILITY_INSUFFICIENT_GOLD);
    assert_unchanged(&poor, poor_events, poor_state, poor_log);

    puts("HERO_LINE_WARS_H4_CORE_ABILITY=PASS");
    return 0;
}
