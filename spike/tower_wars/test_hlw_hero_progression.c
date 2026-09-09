#include "tw_hero_ability.h"
#include "tw_hero_combat.h"

#include <assert.h>
#include <limits.h>
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
    assert(session.hero_xp[0] == 0);
    assert(session.hero_xp[1] == 0);
    assert(session.hero_level[0] == HLW_HERO_START_LEVEL);
    assert(session.hero_level[1] == HLW_HERO_START_LEVEL);
    assert(session.hero_basic_damage[0] == HLW_HERO_BASIC_DAMAGE);
    assert(session.hero_basic_damage[1] == HLW_HERO_BASIC_DAMAGE);
    return session;
}

static uint32_t send_scout_to_player_zero(tw_session_t *session) {
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
    return session->match.active_creeps[0].id;
}

static void assert_replay_equal(const tw_session_t *session) {
    tw_session_t replayed;
    assert(tw_session_replay(session, &replayed) == TW_SESSION_OK);
    assert(tw_session_state_hash(&replayed) == tw_session_state_hash(session));
    assert(tw_session_log_hash(&replayed) == tw_session_log_hash(session));
    assert(replayed.hero_xp[0] == session->hero_xp[0]);
    assert(replayed.hero_level[0] == session->hero_level[0]);
    assert(replayed.hero_basic_damage[0] == session->hero_basic_damage[0]);
}

int main(void) {
    tw_session_t session = make_session();

    /* The shared kill resolver must not become a raw retirement primitive. */
    const uint32_t first_creep = send_scout_to_player_zero(&session);
    const uint64_t nonlethal_state = tw_session_state_hash(&session);
    const uint64_t nonlethal_log = tw_session_log_hash(&session);
    const uint16_t nonlethal_events = session.event_count;
    hlw_hero_kill_outcome_t kill_outcome;
    assert(tw_session_resolve_hero_kill(
               &session, 0, first_creep, 44, &kill_outcome) ==
           HLW_HERO_KILL_RESOLVE_INVALID_TARGET);
    assert(tw_session_state_hash(&session) == nonlethal_state);
    assert(tw_session_log_hash(&session) == nonlethal_log);
    assert(session.event_count == nonlethal_events);
    assert(session.match.active_creep_count == 1);
    assert(session.match.active_creeps[0].hit_points == 45);

    /* First hero kill: reward once, XP 50, still level 1 / 25 damage. */
    hlw_hero_attack_outcome_t attack;
    assert(tw_session_hero_attack(&session, 0, first_creep, &attack) == HLW_HERO_ATTACK_OK);
    assert(!attack.killed);
    assert(attack.remaining_hit_points == 20);
    assert(attack.reward_xp == 0);
    assert(attack.hero_level == HLW_HERO_START_LEVEL);
    assert(attack.hero_basic_damage == HLW_HERO_BASIC_DAMAGE);
    assert(tw_session_step(&session, HLW_HERO_BASIC_CADENCE_TICKS) == TW_SESSION_OK);
    assert(tw_session_hero_attack(&session, 0, first_creep, &attack) == HLW_HERO_ATTACK_OK);
    assert(attack.killed);
    assert(attack.reward_gold == HLW_HERO_KILL_GOLD_REWARD);
    assert(attack.reward_xp == HLW_HERO_KILL_XP_REWARD);
    assert(!attack.leveled);
    assert(session.hero_xp[0] == 50);
    assert(session.hero_level[0] == 1);
    assert(session.hero_basic_damage[0] == 25);
    assert(session.match.players[0].gold == 520);
    assert(session.match.active_creep_count == 0);

    const uint32_t xp_after_first_kill = session.hero_xp[0];
    const uint32_t gold_after_first_kill = session.match.players[0].gold;
    const uint64_t state_after_first_kill = tw_session_state_hash(&session);
    const uint64_t log_after_first_kill = tw_session_log_hash(&session);
    assert(tw_session_hero_attack(&session, 0, first_creep, &attack) == HLW_HERO_ATTACK_COOLDOWN);
    assert(session.hero_xp[0] == xp_after_first_kill);
    assert(session.match.players[0].gold == gold_after_first_kill);
    assert(tw_session_state_hash(&session) == state_after_first_kill);
    assert(tw_session_log_hash(&session) == log_after_first_kill);

    assert(tw_session_step(&session, HLW_HERO_BASIC_CADENCE_TICKS) == TW_SESSION_OK);
    const uint64_t retired_state = tw_session_state_hash(&session);
    const uint64_t retired_log = tw_session_log_hash(&session);
    assert(tw_session_hero_attack(&session, 0, first_creep, &attack) ==
           HLW_HERO_ATTACK_INVALID_TARGET);
    assert(session.hero_xp[0] == xp_after_first_kill);
    assert(session.match.players[0].gold == gold_after_first_kill);
    assert(tw_session_state_hash(&session) == retired_state);
    assert(tw_session_log_hash(&session) == retired_log);

    /* Second hero kill uses Phase Lance and crosses the one frozen threshold. */
    const uint32_t second_creep = send_scout_to_player_zero(&session);
    hlw_hero_ability_outcome_t ability;
    assert(tw_session_hero_ability(&session, 0, second_creep, &ability) == HLW_HERO_ABILITY_OK);
    assert(ability.killed);
    assert(ability.reward_gold == HLW_HERO_KILL_GOLD_REWARD);
    assert(ability.reward_xp == HLW_HERO_KILL_XP_REWARD);
    assert(ability.leveled);
    assert(ability.hero_level == HLW_HERO_MAX_LEVEL);
    assert(ability.hero_basic_damage == HLW_HERO_LEVEL_2_BASIC_DAMAGE);
    assert(session.hero_xp[0] == HLW_HERO_LEVEL_2_XP);
    assert(session.hero_level[0] == HLW_HERO_MAX_LEVEL);
    assert(session.hero_basic_damage[0] == HLW_HERO_LEVEL_2_BASIC_DAMAGE);
    assert(session.match.players[0].gold == 525);
    assert(session.match.active_creep_count == 0);

    /* The progression fields are state-hash material, not presentation-only metadata. */
    tw_session_t altered = session;
    altered.hero_xp[0]++;
    assert(tw_session_state_hash(&altered) != tw_session_state_hash(&session));
    altered = session;
    altered.hero_level[0] = HLW_HERO_START_LEVEL;
    assert(tw_session_state_hash(&altered) != tw_session_state_hash(&session));
    altered = session;
    altered.hero_basic_damage[0] = HLW_HERO_BASIC_DAMAGE;
    assert(tw_session_state_hash(&altered) != tw_session_state_hash(&session));

    /* Level-2 damage is actually authoritative combat state: Scout 45 -> 15. */
    const uint32_t third_creep = send_scout_to_player_zero(&session);
    assert(session.match.tick >= session.hero_ready_tick[0]);
    assert(tw_session_hero_attack(&session, 0, third_creep, &attack) == HLW_HERO_ATTACK_OK);
    assert(!attack.killed);
    assert(attack.remaining_hit_points == 15);
    assert(attack.hero_level == HLW_HERO_MAX_LEVEL);
    assert(attack.hero_basic_damage == HLW_HERO_LEVEL_2_BASIC_DAMAGE);
    assert(tw_session_step(&session, HLW_HERO_BASIC_CADENCE_TICKS) == TW_SESSION_OK);
    assert(tw_session_hero_attack(&session, 0, third_creep, &attack) == HLW_HERO_ATTACK_OK);
    assert(attack.killed);
    assert(attack.reward_xp == HLW_HERO_KILL_XP_REWARD);
    assert(!attack.leveled);
    assert(session.hero_xp[0] == 150);
    assert(session.hero_level[0] == HLW_HERO_MAX_LEVEL);
    assert(session.hero_basic_damage[0] == HLW_HERO_LEVEL_2_BASIC_DAMAGE);

    assert_replay_equal(&session);

    /* Progression overflow must fail closed with no reward, retirement or log event. */
    tw_session_t overflow = make_session();
    const uint32_t overflow_creep = send_scout_to_player_zero(&overflow);
    overflow.match.active_creeps[0].hit_points = 20;
    overflow.hero_xp[0] = UINT32_MAX - HLW_HERO_KILL_XP_REWARD + 1u;
    const uint64_t overflow_state = tw_session_state_hash(&overflow);
    const uint64_t overflow_log = tw_session_log_hash(&overflow);
    const uint16_t overflow_events = overflow.event_count;
    const uint32_t overflow_gold = overflow.match.players[0].gold;
    assert(tw_session_hero_attack(&overflow, 0, overflow_creep, &attack) ==
           HLW_HERO_ATTACK_PROGRESSION_OVERFLOW);
    assert(tw_session_state_hash(&overflow) == overflow_state);
    assert(tw_session_log_hash(&overflow) == overflow_log);
    assert(overflow.event_count == overflow_events);
    assert(overflow.match.players[0].gold == overflow_gold);
    assert(overflow.match.active_creep_count == 1);
    assert(overflow.match.active_creeps[0].hit_points == 20);

    puts("HERO_LINE_WARS_H5_HERO_XP_LEVEL=PASS");
    return 0;
}
