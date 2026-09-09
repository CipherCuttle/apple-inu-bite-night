#include "tw_hero_ability.h"
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

hlw_hero_ability_result_t tw_session_hero_ability(
    tw_session_t *session,
    uint8_t actor,
    uint32_t creep_id,
    hlw_hero_ability_outcome_t *outcome_out) {
    if (outcome_out) memset(outcome_out, 0, sizeof(*outcome_out));
    if (!session) return HLW_HERO_ABILITY_INVALID_SESSION;
    if (actor >= TW_PLAYER_COUNT) return HLW_HERO_ABILITY_INVALID_ACTOR;
    if (session->match.terminal) return HLW_HERO_ABILITY_MATCH_TERMINAL;
    if (session->event_count >= TW_MAX_LOG_EVENTS) return HLW_HERO_ABILITY_LOG_CAPACITY;
    if (session->match.tick < session->hero_ability_ready_tick[actor]) {
        return HLW_HERO_ABILITY_COOLDOWN;
    }
    if (session->match.tick > UINT64_MAX - HLW_HERO_ABILITY_COOLDOWN_TICKS) {
        return HLW_HERO_ABILITY_TICK_OVERFLOW;
    }
    if (session->match.players[actor].gold < HLW_HERO_ABILITY_GOLD_COST) {
        return HLW_HERO_ABILITY_INSUFFICIENT_GOLD;
    }

    const int found = find_creep_index(&session->match, creep_id);
    if (found < 0) return HLW_HERO_ABILITY_INVALID_TARGET;
    const tw_creep_t *current = &session->match.active_creeps[found];
    if (current->target != actor || current->hit_points == 0) {
        return HLW_HERO_ABILITY_INVALID_TARGET;
    }

    const bool killing = HLW_HERO_ABILITY_DAMAGE >= current->hit_points;
    const uint32_t gold_after_cost =
        session->match.players[actor].gold - HLW_HERO_ABILITY_GOLD_COST;

    tw_session_t candidate = *session;
    tw_creep_t *creep = &candidate.match.active_creeps[found];
    hlw_hero_ability_outcome_t outcome = {
        .gold_cost = HLW_HERO_ABILITY_GOLD_COST,
        .hero_level = candidate.hero_level[actor],
        .hero_basic_damage = candidate.hero_basic_damage[actor],
    };

    candidate.match.players[actor].gold = gold_after_cost;
    if (killing) {
        hlw_hero_kill_outcome_t kill_outcome;
        const hlw_hero_kill_resolve_result_t kill_result = tw_session_resolve_hero_kill(
            &candidate, actor, creep_id, HLW_HERO_ABILITY_DAMAGE, &kill_outcome);
        if (kill_result == HLW_HERO_KILL_RESOLVE_GOLD_OVERFLOW) {
            return HLW_HERO_ABILITY_ECONOMY_OVERFLOW;
        }
        if (kill_result == HLW_HERO_KILL_RESOLVE_XP_OVERFLOW) {
            return HLW_HERO_ABILITY_PROGRESSION_OVERFLOW;
        }
        if (kill_result != HLW_HERO_KILL_RESOLVE_OK) {
            return HLW_HERO_ABILITY_INVALID_TARGET;
        }
        outcome.killed = true;
        outcome.reward_gold = kill_outcome.reward_gold;
        outcome.reward_xp = kill_outcome.reward_xp;
        outcome.leveled = kill_outcome.leveled;
        outcome.hero_level = kill_outcome.hero_level;
        outcome.hero_basic_damage = kill_outcome.hero_basic_damage;
    } else {
        creep->hit_points -= HLW_HERO_ABILITY_DAMAGE;
        outcome.remaining_hit_points = creep->hit_points;
    }

    candidate.hero_ability_ready_tick[actor] =
        candidate.match.tick + HLW_HERO_ABILITY_COOLDOWN_TICKS;
    candidate.events[candidate.event_count++] = (tw_event_t){
        .kind = TW_EVENT_HERO_ABILITY,
        .data.hero_ability = {
            .actor = actor,
            .creep_id = creep_id,
        },
    };

    *session = candidate;
    if (outcome_out) *outcome_out = outcome;
    return HLW_HERO_ABILITY_OK;
}
