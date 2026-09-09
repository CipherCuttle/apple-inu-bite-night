#include "tw_match.h"

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

static void each_tower_archetype_acquires_and_damages(void) {
    for (tw_tower_kind_t kind = TW_TOWER_NEEDLE; kind < TW_TOWER_COUNT; kind++) {
        tw_match_t match;
        assert(tw_match_init(&match, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}, 1000));

        tw_action_t tower = build_action(1, kind, 1, 1);
        tw_action_t send = send_action(0, TW_CREEP_SIEGE);
        assert(tw_match_apply_action(&match, &tower) == TW_APPLY_OK);
        assert(tw_match_apply_action(&match, &send) == TW_APPLY_OK);
        assert(tw_match_step(&match, 1));

        const tw_tower_def_t *tower_def = tw_tower_def(kind);
        const tw_creep_def_t *creep_def = tw_creep_def(TW_CREEP_SIEGE);
        assert(tower_def && creep_def);
        assert(match.active_creep_count == 1);
        assert(match.active_creeps[0].hit_points == creep_def->hit_points - tower_def->damage);
        assert(match.players[1].towers[0].cooldown_ticks == tower_def->cadence_ticks - 1);
    }
}

static void cadence_is_integer_and_deterministic(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}, 1000));
    tw_action_t tower = build_action(1, TW_TOWER_PULSE, 1, 1);
    tw_action_t send = send_action(0, TW_CREEP_SIEGE);
    assert(tw_match_apply_action(&match, &tower) == TW_APPLY_OK);
    assert(tw_match_apply_action(&match, &send) == TW_APPLY_OK);

    const tw_tower_def_t *tower_def = tw_tower_def(TW_TOWER_PULSE);
    const tw_creep_def_t *creep_def = tw_creep_def(TW_CREEP_SIEGE);
    assert(tower_def && tower_def->cadence_ticks == 5);
    assert(creep_def);

    assert(tw_match_step(&match, 1));
    assert(match.active_creeps[0].hit_points == creep_def->hit_points - tower_def->damage);

    assert(tw_match_step(&match, 4));
    assert(match.active_creeps[0].hit_points == creep_def->hit_points - tower_def->damage);
    assert(match.players[1].towers[0].cooldown_ticks == 0);

    assert(tw_match_step(&match, 1));
    assert(match.active_creeps[0].hit_points == creep_def->hit_points - 2 * tower_def->damage);
}

static void equal_progress_targets_lowest_creep_id(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}, 1000));
    tw_action_t tower = build_action(1, TW_TOWER_NEEDLE, 1, 1);
    tw_action_t first = send_action(0, TW_CREEP_SIEGE);
    tw_action_t second = send_action(0, TW_CREEP_SIEGE);
    assert(tw_match_apply_action(&match, &tower) == TW_APPLY_OK);
    assert(tw_match_apply_action(&match, &first) == TW_APPLY_OK);
    assert(tw_match_apply_action(&match, &second) == TW_APPLY_OK);
    assert(tw_match_step(&match, 1));

    const uint32_t full_hp = tw_creep_def(TW_CREEP_SIEGE)->hit_points;
    const uint32_t damage = tw_tower_def(TW_TOWER_NEEDLE)->damage;
    assert(match.active_creep_count == 2);
    assert(match.active_creeps[0].id == 1);
    assert(match.active_creeps[1].id == 2);
    assert(match.active_creeps[0].hit_points == full_hp - damage);
    assert(match.active_creeps[1].hit_points == full_hp);
}

static void lethal_damage_retires_creep_before_movement_or_leak(void) {
    tw_match_t match;
    assert(tw_match_init(&match, 5, 3, (tw_cell_t){0, 1}, (tw_cell_t){4, 1}, 1000));
    tw_action_t first_tower = build_action(1, TW_TOWER_ANVIL, 0, 0);
    tw_action_t second_tower = build_action(1, TW_TOWER_ANVIL, 1, 0);
    tw_action_t send = send_action(0, TW_CREEP_SCOUT);

    assert(tw_match_apply_action(&match, &first_tower) == TW_APPLY_OK);
    assert(tw_match_apply_action(&match, &second_tower) == TW_APPLY_OK);
    assert(tw_match_apply_action(&match, &send) == TW_APPLY_OK);
    assert(tw_match_step(&match, 1));

    assert(match.active_creep_count == 0);
    assert(match.pending_send_count == 0);
    assert(match.players[1].lives == TW_STARTING_LIVES);

    const uint16_t lives_after_kill = match.players[1].lives;
    assert(tw_match_step(&match, 40));
    assert(match.active_creep_count == 0);
    assert(match.players[1].lives == lives_after_kill);
}

static void combat_replay_hash_is_stable(void) {
    tw_match_t a;
    assert(tw_match_init(&a, 7, 5, (tw_cell_t){0, 2}, (tw_cell_t){6, 2}, 1000));
    tw_action_t tower = build_action(1, TW_TOWER_PULSE, 1, 1);
    tw_action_t send = send_action(0, TW_CREEP_BRUTE);
    assert(tw_match_apply_action(&a, &tower) == TW_APPLY_OK);
    assert(tw_match_apply_action(&a, &send) == TW_APPLY_OK);

    tw_match_t b = a;
    assert(tw_match_step(&a, 15));
    assert(tw_match_step(&b, 15));
    assert(tw_match_hash(&a) == tw_match_hash(&b));
}

int main(void) {
    each_tower_archetype_acquires_and_damages();
    cadence_is_integer_and_deterministic();
    equal_progress_targets_lowest_creep_id();
    lethal_damage_retires_creep_before_movement_or_leak();
    combat_replay_hash_is_stable();
    puts("TOWER_WARS_G5_TOWER_COMBAT=PASS");
    return 0;
}
