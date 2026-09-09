#ifndef TW_HERO_ABILITY_H
#define TW_HERO_ABILITY_H

#include "tw_replay.h"

#include <stdbool.h>
#include <stdint.h>

#define HLW_HERO_ABILITY_DAMAGE 60u
#define HLW_HERO_ABILITY_COOLDOWN_TICKS 12u
#define HLW_HERO_ABILITY_GOLD_COST 15u
#define HLW_HERO_ABILITY_RANGE_WORLD 128u

typedef enum {
    HLW_HERO_ABILITY_OK = 0,
    HLW_HERO_ABILITY_INVALID_SESSION,
    HLW_HERO_ABILITY_INVALID_ACTOR,
    HLW_HERO_ABILITY_MATCH_TERMINAL,
    HLW_HERO_ABILITY_COOLDOWN,
    HLW_HERO_ABILITY_INVALID_TARGET,
    HLW_HERO_ABILITY_INSUFFICIENT_GOLD,
    HLW_HERO_ABILITY_ECONOMY_OVERFLOW,
    HLW_HERO_ABILITY_LOG_CAPACITY,
    HLW_HERO_ABILITY_TICK_OVERFLOW,
    HLW_HERO_ABILITY_PROGRESSION_OVERFLOW,
} hlw_hero_ability_result_t;

typedef struct {
    bool killed;
    uint32_t remaining_hit_points;
    uint32_t reward_gold;
    uint32_t reward_xp;
    uint32_t gold_cost;
    bool leveled;
    uint8_t hero_level;
    uint32_t hero_basic_damage;
} hlw_hero_ability_outcome_t;

/*
 * PHASE LANCE — the single active V0 hero ability.
 *
 * Native OpenRealm position establishes range/target legality. This session
 * function owns cost, cooldown, deterministic damage, kill retirement, combat
 * reward/progression and replay logging. It independently rejects any creep not
 * incoming to the casting seat.
 */
hlw_hero_ability_result_t tw_session_hero_ability(
    tw_session_t *session,
    uint8_t actor,
    uint32_t creep_id,
    hlw_hero_ability_outcome_t *outcome_out);

#endif
