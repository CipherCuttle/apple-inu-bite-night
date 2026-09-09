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

    const bool killing = HLW_HERO_BASIC_DAMAGE >= current->hit_points;
    if (killing &&
        session->match.players[actor].gold > UINT32_MAX - HLW_HERO_KILL_GOLD_REWARD) {
        return HLW_HERO_ATTACK_ECONOMY_OVERFLOW;
    }

    tw_session_t candidate = *session;
    tw_creep_t *creep = &candidate.match.active_creeps[found];
    hlw_hero_attack_outcome_t outcome = {0};

    if (killing) {
        candidate.match.players[actor].gold += HLW_HERO_KILL_GOLD_REWARD;
        outcome.killed = true;
        outcome.reward_gold = HLW_HERO_KILL_GOLD_REWARD;
        remove_active_creep(&candidate.match, (uint16_t)found);
    } else {
        creep->hit_points -= HLW_HERO_BASIC_DAMAGE;
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
