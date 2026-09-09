#ifndef TW_HERO_COMBAT_H
#define TW_HERO_COMBAT_H

#include "tw_replay.h"

#include <stdbool.h>
#include <stdint.h>

#define HLW_HERO_BASIC_DAMAGE 25u
#define HLW_HERO_BASIC_CADENCE_TICKS 4u
#define HLW_HERO_KILL_GOLD_REWARD 20u
#define HLW_HERO_BASIC_RANGE_WORLD 96u

/* H5 frozen V0 progression: one deterministic level transition, no skill tree. */
#define HLW_HERO_START_LEVEL 1u
#define HLW_HERO_MAX_LEVEL 2u
#define HLW_HERO_KILL_XP_REWARD 50u
#define HLW_HERO_LEVEL_2_XP 100u
#define HLW_HERO_LEVEL_2_BASIC_DAMAGE 30u

typedef enum {
    HLW_HERO_KILL_RESOLVE_OK = 0,
    HLW_HERO_KILL_RESOLVE_INVALID_SESSION,
    HLW_HERO_KILL_RESOLVE_INVALID_ACTOR,
    HLW_HERO_KILL_RESOLVE_INVALID_TARGET,
    HLW_HERO_KILL_RESOLVE_GOLD_OVERFLOW,
    HLW_HERO_KILL_RESOLVE_XP_OVERFLOW,
} hlw_hero_kill_resolve_result_t;

typedef struct {
    uint32_t reward_gold;
    uint32_t reward_xp;
    bool leveled;
    uint8_t hero_level;
    uint32_t hero_basic_damage;
} hlw_hero_kill_outcome_t;

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
    HLW_HERO_ATTACK_PROGRESSION_OVERFLOW,
} hlw_hero_attack_result_t;

typedef struct {
    bool killed;
    uint32_t remaining_hit_points;
    uint32_t reward_gold;
    uint32_t reward_xp;
    bool leveled;
    uint8_t hero_level;
    uint32_t hero_basic_damage;
} hlw_hero_attack_outcome_t;

/*
 * Shared deterministic hero-kill resolution used by basic attack and Phase Lance.
 * It retires one incoming creep exactly once, grants combat gold + XP exactly once,
 * applies the single H5 level transition, and never handles tower/leak retirement.
 * Callers use a candidate session so any failure remains non-mutating.
 */
hlw_hero_kill_resolve_result_t tw_session_resolve_hero_kill(
    tw_session_t *session,
    uint8_t actor,
    uint32_t creep_id,
    hlw_hero_kill_outcome_t *outcome_out);

/*
 * Apply one already target-validated hero basic attack through the same
 * deterministic session/event boundary as build/send/step.
 *
 * Target legality that depends on native hero position is established by the
 * OpenRealm command boundary. This function remains authoritative for cadence,
 * creep HP, kill retirement, combat reward/progression, and independently rejects
 * any creep that is not incoming to the attacking seat.
 */
hlw_hero_attack_result_t tw_session_hero_attack(
    tw_session_t *session,
    uint8_t actor,
    uint32_t creep_id,
    hlw_hero_attack_outcome_t *outcome_out);

#endif
