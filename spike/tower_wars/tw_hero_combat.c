#include "tw_hero_combat.h"

#include <limits.h>
#include <string.h>

static int find_creep_index(const tw_match_t *match, uint32_t creep_id) {
    if (!match || creep_id == 0) return -1;
    for (uint16_t i = 0; i < match->active_creep_count; ++i) {
        if (match->active_creeps[i].id == creep_id) return (int)i;
    }
    return -1;
}

static void remove_active_creep(tw_match_t *match, uint16_t index) {
    if (!match || index >= match->active_creep_count) return;
    const uint16_t remaining = (uint16_t)(match->active_creep_count - index - 1);
    if (remaining) {
        memmove(&match->active_creeps[index],
                &match->active_creeps[index + 1],
                (size_t)remaining * sizeof(match->active_creeps[0]));
    }
    match->active_creep_count--;
    memset(&match->active_creeps[match->active_creep_count], 0, sizeof(match->active_creeps[0]));
}

hlw_hero_kill_resolve_result_t tw_session_resolve_hero_kill(
    tw_session_t *session,
    uint8_t actor,
    uint32_t creep_id,
    uint32_t lethal_damage,
    hlw_hero_kill_outcome_t *outcome_out) {
    if (outcome_out) memset(outcome_out, 0, sizeof(*outcome_out));
    if (!session) return HLW_HERO_KILL_RESOLVE_INVALID_SESSION;
    if (actor >= TW_PLAYER_COUNT) return HLW_HERO_KILL_RESOLVE_INVALID_ACTOR;

    const int found = find_creep_index(&session->match, creep_id);
    if (found < 0) return HLW_HERO_KILL_RESOLVE_INVALID_TARGET;
    const tw_creep_t *current = &session->match.active_creeps[found];
    if (current->target != actor || current->hit_points == 0 || lethal_damage < current->hit_points) {
        return HLW_HERO_KILL_RESOLVE_INVALID_TARGET;
    }
    if (session->match.players[actor].gold > UINT32_MAX - HLW_HERO_KILL_GOLD_REWARD) {
        return HLW_HERO_KILL_RESOLVE_GOLD_OVERFLOW;
    }
    if (session->hero_xp[actor] > UINT32_MAX - HLW_HERO_KILL_XP_REWARD) {
        return HLW_HERO_KILL_RESOLVE_XP_OVERFLOW;
    }

    const uint32_t old_xp = session->hero_xp[actor];
    const uint32_t new_xp = old_xp + HLW_HERO_KILL_XP_REWARD;
    bool leveled = false;

    session->match.players[actor].gold += HLW_HERO_KILL_GOLD_REWARD;
    session->hero_xp[actor] = new_xp;
    if (session->hero_level[actor] == HLW_HERO_START_LEVEL &&
        old_xp < HLW_HERO_LEVEL_2_XP && new_xp >= HLW_HERO_LEVEL_2_XP) {
        session->hero_level[actor] = HLW_HERO_MAX_LEVEL;
        session->hero_basic_damage[actor] = HLW_HERO_LEVEL_2_BASIC_DAMAGE;
        leveled = true;
    }

    remove_active_creep(&session->match, (uint16_t)found);

    if (outcome_out) {
        *outcome_out = (hlw_hero_kill_outcome_t){
            .reward_gold = HLW_HERO_KILL_GOLD_REWARD,
            .reward_xp = HLW_HERO_KILL_XP_REWARD,
            .leveled = leveled,
            .hero_level = session->hero_level[actor],
            .hero_basic_damage = session->hero_basic_damage[actor],
        };
    }
    return HLW_HERO_KILL_RESOLVE_OK;
}

hlw_hero_attack_result_t tw_session_hero_attack(
    tw_session_t *session,
    uint8_t actor,
    uint32_t creep_id,
    hlw_hero_attack_outcome_t *outcome_out) {
    if (outcome_out) memset(outcome_out, 0, sizeof(*outcome_out));
    if (!session) return HLW_HERO_ATTACK_INVALID_SESSION;
    if (actor >= TW_PLAYER_COUNT) return HLW_HERO_ATTACK_INVALID_ACTOR;
    if (session->match.terminal) return HLW_HERO_ATTACK_MATCH_TERMINAL;
    if (session->event_count >= TW_MAX_LOG_EVENTS) return HLW_HERO_ATTACK_LOG_CAPACITY;
    if (session->match.tick < session->hero_ready_tick[actor]) return HLW_HERO_ATTACK_COOLDOWN;
    if (session->match.tick > UINT64_MAX - HLW_HERO_BASIC_CADENCE_TICKS) {
        return HLW_HERO_ATTACK_TICK_OVERFLOW;
    }

    const int found = find_creep_index(&session->match, creep_id);
    if (found < 0) return HLW_HERO_ATTACK_INVALID_TARGET;
    const tw_creep_t *current = &session->match.active_creeps[found];
    if (current->target != actor || current->hit_points == 0) {
        return HLW_HERO_ATTACK_INVALID_TARGET;
    }

    const uint32_t damage = session->hero_basic_damage[actor];
    if (damage == 0) return HLW_HERO_ATTACK_INVALID_SESSION;
    const bool killing = damage >= current->hit_points;

    tw_session_t candidate = *session;
    tw_creep_t *creep = &candidate.match.active_creeps[found];
    hlw_hero_attack_outcome_t outcome = {
        .hero_level = candidate.hero_level[actor],
        .hero_basic_damage = candidate.hero_basic_damage[actor],
    };

    if (killing) {
        hlw_hero_kill_outcome_t kill_outcome;
        const hlw_hero_kill_resolve_result_t kill_result = tw_session_resolve_hero_kill(
            &candidate, actor, creep_id, damage, &kill_outcome);
        if (kill_result == HLW_HERO_KILL_RESOLVE_GOLD_OVERFLOW) {
            return HLW_HERO_ATTACK_ECONOMY_OVERFLOW;
        }
        if (kill_result == HLW_HERO_KILL_RESOLVE_XP_OVERFLOW) {
            return HLW_HERO_ATTACK_PROGRESSION_OVERFLOW;
        }
        if (kill_result != HLW_HERO_KILL_RESOLVE_OK) {
            return HLW_HERO_ATTACK_INVALID_TARGET;
        }
        outcome.killed = true;
        outcome.reward_gold = kill_outcome.reward_gold;
        outcome.reward_xp = kill_outcome.reward_xp;
        outcome.leveled = kill_outcome.leveled;
        outcome.hero_level = kill_outcome.hero_level;
        outcome.hero_basic_damage = kill_outcome.hero_basic_damage;
    } else {
        creep->hit_points -= damage;
        outcome.remaining_hit_points = creep->hit_points;
    }

    candidate.hero_ready_tick[actor] =
        candidate.match.tick + HLW_HERO_BASIC_CADENCE_TICKS;
    candidate.events[candidate.event_count++] = (tw_event_t){
        .kind = TW_EVENT_HERO_ATTACK,
        .data.hero_attack = {
            .actor = actor,
            .creep_id = creep_id,
        },
    };

    *session = candidate;
    if (outcome_out) *outcome_out = outcome;
    return HLW_HERO_ATTACK_OK;
}
