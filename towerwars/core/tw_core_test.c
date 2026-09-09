#include "tw_core.h"

#include <stdio.h>
#include <stdlib.h>

#define CHECK(expr) do { if (!(expr)) { fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #expr); exit(1); } } while (0)

static unsigned active_creeps(const tw_state_t *state) {
    unsigned count = 0u;
    for (size_t i = 0; i < TW_MAX_CREEPS; ++i) if (state->creeps[i].active) ++count;
    return count;
}

static void test_initial_path(void) {
    tw_state_t s;
    tw_init(&s);
    tw_cell_t path[TW_WIDTH * TW_HEIGHT];
    size_t length = 0u;
    CHECK(tw_find_path(&s, 0u, 0u, 3u, path, TW_WIDTH * TW_HEIGHT, &length));
    CHECK(length == TW_WIDTH);
    CHECK(path[0].x == 0u && path[0].y == 3u);
    CHECK(path[length - 1u].x == 11u && path[length - 1u].y == 3u);
    CHECK(tw_validate_state(&s));
}

static void test_fail_closed_wall(void) {
    tw_state_t s;
    tw_init(&s);
    for (unsigned y = 0; y < TW_HEIGHT; ++y) {
        if (y == 4u) continue;
        CHECK(tw_place_tower(&s, 0u, TW_TOWER_BASIC, 5u, y) == TW_OK);
        s.players[0].gold += 20;
    }
    int before_gold = s.players[0].gold;
    uint64_t before_hash = tw_state_hash(&s);
    CHECK(tw_place_tower(&s, 0u, TW_TOWER_BASIC, 5u, 4u) == TW_ERR_BLOCKS_PATH);
    CHECK(s.players[0].gold == before_gold);
    CHECK(!s.players[0].blocked[4][5]);
    CHECK(tw_state_hash(&s) == before_hash);
    CHECK(tw_validate_state(&s));
}

static void test_send_economy(void) {
    tw_state_t s;
    tw_init(&s);
    CHECK(tw_send_creep(&s, 0u, TW_CREEP_GRUNT) == TW_OK);
    CHECK(s.players[0].gold == TW_START_GOLD - 18);
    CHECK(s.players[0].income == TW_START_INCOME + 2);
    CHECK(active_creeps(&s) == 1u);
    CHECK(tw_validate_state(&s));
}

static void test_creep_leaks(void) {
    tw_state_t s;
    tw_init(&s);
    CHECK(tw_send_creep(&s, 0u, TW_CREEP_RUNNER) == TW_OK);
    for (unsigned i = 0; i < 20u && active_creeps(&s); ++i) tw_tick(&s);
    CHECK(active_creeps(&s) == 0u);
    CHECK(s.players[1].lives == TW_START_LIVES - 1);
    CHECK(tw_validate_state(&s));
}

static void test_tower_kills_for_bounty(void) {
    tw_state_t s;
    tw_init(&s);
    CHECK(tw_place_tower(&s, 1u, TW_TOWER_CANNON, 1u, 2u) == TW_OK);
    int defender_gold = s.players[1].gold;
    CHECK(tw_send_creep(&s, 0u, TW_CREEP_SWARM) == TW_OK);
    for (unsigned i = 0; i < 8u && active_creeps(&s); ++i) tw_tick(&s);
    CHECK(active_creeps(&s) == 0u);
    CHECK(s.players[1].lives == TW_START_LIVES);
    CHECK(s.players[1].gold == defender_gold + 1);
    CHECK(tw_validate_state(&s));
}

static void test_income_cadence(void) {
    tw_state_t s;
    tw_init(&s);
    int initial = s.players[0].gold;
    for (unsigned i = 0; i < TW_INCOME_PERIOD - 1u; ++i) tw_tick(&s);
    CHECK(s.players[0].gold == initial);
    tw_tick(&s);
    CHECK(s.players[0].gold == initial + TW_START_INCOME);
    CHECK(tw_validate_state(&s));
}

static void test_winner_and_terminal_freeze(void) {
    tw_state_t s;
    tw_init(&s);
    s.players[1].lives = 1;
    CHECK(tw_validate_state(&s));
    CHECK(tw_send_creep(&s, 0u, TW_CREEP_RUNNER) == TW_OK);
    for (unsigned i = 0; i < 20u && tw_winner(&s) == TW_NO_WINNER; ++i) tw_tick(&s);
    CHECK(tw_winner(&s) == 0);
    uint64_t terminal_hash = tw_state_hash(&s);
    tw_tick(&s);
    CHECK(tw_state_hash(&s) == terminal_hash);
    CHECK(tw_send_creep(&s, 0u, TW_CREEP_SWARM) == TW_ERR_GAME_OVER);
    CHECK(tw_place_tower(&s, 0u, TW_TOWER_BASIC, 2u, 2u) == TW_ERR_GAME_OVER);
    CHECK(tw_validate_state(&s));
}

static void test_simultaneous_leak_draw(void) {
    tw_state_t s;
    tw_init(&s);
    s.players[0].lives = 1;
    s.players[1].lives = 1;
    CHECK(tw_send_creep(&s, 0u, TW_CREEP_RUNNER) == TW_OK);
    CHECK(tw_send_creep(&s, 1u, TW_CREEP_RUNNER) == TW_OK);
    for (unsigned i = 0; i < 20u && tw_winner(&s) == TW_NO_WINNER; ++i) tw_tick(&s);
    CHECK(tw_winner(&s) == TW_DRAW);
    CHECK(tw_validate_state(&s));
}

static void replay(tw_state_t *s, bool perturb) {
    static const tw_action_t actions[] = {
        {TW_ACTION_PLACE_TOWER, 0u, 3u, 2u, TW_TOWER_BASIC},
        {TW_ACTION_PLACE_TOWER, 1u, 2u, 4u, TW_TOWER_RAPID},
        {TW_ACTION_SEND_CREEP, 0u, 0u, 0u, TW_CREEP_GRUNT},
        {TW_ACTION_SEND_CREEP, 1u, 0u, 0u, TW_CREEP_RUNNER},
    };
    tw_init(s);
    for (size_t i = 0; i < sizeof(actions) / sizeof(actions[0]); ++i) {
        tw_action_t a = actions[i];
        if (perturb && i == 0u) a.y = 1u;
        CHECK(tw_apply_action(s, &a) == TW_OK);
    }
    for (unsigned i = 0; i < 17u; ++i) {
        const tw_action_t tick = {TW_ACTION_TICK, 0u, 0u, 0u, 0u};
        CHECK(tw_apply_action(s, &tick) == TW_OK);
    }
    CHECK(tw_validate_state(s));
}

static void test_replay_hash(void) {
    tw_state_t a, b, c;
    replay(&a, false);
    replay(&b, false);
    replay(&c, true);
    CHECK(tw_state_hash(&a) == tw_state_hash(&b));
    CHECK(tw_state_hash(&a) != tw_state_hash(&c));
}

static void test_live_creep_reroutes_after_build(void) {
    tw_state_t s;
    tw_init(&s);
    CHECK(tw_send_creep(&s, 1u, TW_CREEP_RUNNER) == TW_OK);
    for (unsigned i = 0; i < 3u; ++i) tw_tick(&s);

    tw_creep_t *creep = NULL;
    for (size_t i = 0; i < TW_MAX_CREEPS; ++i) {
        if (s.creeps[i].active) { creep = &s.creeps[i]; break; }
    }
    CHECK(creep != NULL);
    CHECK(creep->x == 3u && creep->y == 3u);
    CHECK(tw_place_tower(&s, 0u, TW_TOWER_BASIC, 4u, 3u) == TW_OK);
    tw_tick(&s);
    CHECK(creep->x == 3u && creep->y == 2u);
    CHECK(tw_validate_state(&s));
}

static void test_active_creep_cannot_be_stranded(void) {
    tw_state_t s;
    tw_init(&s);
    CHECK(tw_send_creep(&s, 1u, TW_CREEP_TANK) == TW_OK);
    tw_tick(&s);
    for (unsigned y = 0; y < TW_HEIGHT; ++y) {
        if (y == 4u) continue;
        CHECK(tw_place_tower(&s, 0u, TW_TOWER_BASIC, 6u, y) == TW_OK);
        s.players[0].gold += 20;
    }
    CHECK(tw_place_tower(&s, 0u, TW_TOWER_BASIC, 6u, 4u) == TW_ERR_BLOCKS_PATH);
    CHECK(tw_validate_state(&s));
}

int main(void) {
    test_initial_path();
    test_fail_closed_wall();
    test_send_economy();
    test_creep_leaks();
    test_tower_kills_for_bounty();
    test_income_cadence();
    test_winner_and_terminal_freeze();
    test_simultaneous_leak_draw();
    test_replay_hash();
    test_live_creep_reroutes_after_build();
    test_active_creep_cannot_be_stranded();
    puts("TOWER_WARS_CORE_TESTS=PASS");
    return 0;
}
