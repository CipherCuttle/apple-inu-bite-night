#ifndef TW_HERO_COMBAT_H
#define TW_HERO_COMBAT_H

#include "tw_replay.h"

#include <stdbool.h>
#include <stdint.h>

#define HLW_HERO_BASIC_DAMAGE 25u
#define HLW_HERO_BASIC_CADENCE_TICKS 4u
#define HLW_HERO_KILL_GOLD_REWARD 20u
#define HLW_HERO_BASIC_RANGE_WORLD 96u

typedef enum {
    HLW_HERO_ATTACK_OK = 0,
    HLW_HERO_ATTACK_INVALID_SESSION,
    HLW_HERO_ATTACK_INVALID_ACTOR,
    HLW_HERO_ATTACK_MATCH_TERMINAL,
    HLW_HERO_ATTACK_COOLDOWN,
    HLW_HERO_ATTACK_INVALID_TARGET,
    HLW_HERO_ATTACK_ECONOMY_OVERFLOW,
    HLW_HERO_ATTACK_LOG_CAPACITY,
    HLW_HERO_ATTACK_TICK_OVERFLOW,
} hlw_hero_attack_result_t;

typedef struct {
    bool killed;
    uint32_t remaining_hit_points;
    uint32_t reward_gold;
} hlw_hero_attack_outcome_t;

/*
 * Apply one already target-validated hero basic attack through the same
 * deterministic session/event boundary as build/send/step.
 *
 * Target legality that depends on native hero position is established by the
 * OpenRealm command boundary. This function remains authoritative for cadence,
 * creep HP, kill retirement and combat reward, and independently rejects any
 * creep that is not incoming to the attacking seat.
 */
hlw_hero_attack_result_t tw_session_hero_attack(
    tw_session_t *session,
    uint8_t actor,
    uint32_t creep_id,
    hlw_hero_attack_outcome_t *outcome_out);

#endif
