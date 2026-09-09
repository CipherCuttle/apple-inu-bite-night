#include "tw_replay.h"
#include "tw_hero_combat.h"

#include <emscripten/emscripten.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#define TW_BROWSER_WIDTH 9
#define TW_BROWSER_HEIGHT 7
#define TW_BROWSER_STARTING_GOLD 500
#define TW_BROWSER_JSON_CAPACITY 32768
#define TW_BROWSER_VISIBLE_CREEPS 64

#ifdef HLW_NATIVE_V0
/* Presentation-only OpenRealm bridge. These functions may mirror session state
 * into native edicts, but they do not own movement, HP, rewards, leaks or any
 * other simulation decision. tw_session remains the single authority. */
extern int HLW_OpenRealmPresentationReset(void);
extern int HLW_OpenRealmPresentationBegin(void);
extern int HLW_OpenRealmPresentationSyncCreep(uint32_t id,
                                              uint8_t target,
                                              uint8_t kind,
                                              uint8_t x,
                                              uint8_t y,
                                              uint16_t progress_milli,
                                              uint32_t hit_points);
extern int HLW_OpenRealmPresentationEnd(void);
#endif

#ifdef HLW_HERO_V0
/* Native hero position is authoritative in OpenRealm. Human and bot both enter
 * through the same actor-indexed command boundary; JS receives only wrappers
 * and read-only inspection, never the raw native mutation function. */
extern int HLW_OpenRealmHeroReset(void);
extern int HLW_OpenRealmHeroCommandMove(uint8_t actor, int x, int y);
extern int HLW_OpenRealmHeroStep(uint32_t ticks);
extern uint32_t HLW_OpenRealmHeroEntityNumber(uint8_t actor);
extern int HLW_OpenRealmHeroX(uint8_t actor);
extern int HLW_OpenRealmHeroY(uint8_t actor);
extern uint32_t HLW_OpenRealmHeroAcquireTarget(uint8_t actor, float range);
#endif

static tw_session_t browser_session;
static bool browser_initialized;
static tw_session_result_t browser_last_session_result = TW_SESSION_MATCH_REJECTED;
static tw_apply_result_t browser_last_match_result = TW_APPLY_INVALID_MATCH;
static hlw_hero_attack_result_t browser_last_hero_attack_result = HLW_HERO_ATTACK_INVALID_SESSION;
static bool browser_replay_ok;
static bool browser_native_sync_ok = true;
static bool browser_hero_ok = true;
static char browser_json[TW_BROWSER_JSON_CAPACITY];

static size_t appendf(size_t used, const char *format, ...) {
    if (used >= sizeof(browser_json)) return used;
    va_list args;
    va_start(args, format);
    const int written = vsnprintf(browser_json + used, sizeof(browser_json) - used, format, args);
    va_end(args);
    if (written < 0) return sizeof(browser_json);
    const size_t amount = (size_t)written;
    if (amount >= sizeof(browser_json) - used) return sizeof(browser_json);
    return used + amount;
}

static uint16_t path_length_for(uint8_t player) {
    if (!browser_initialized || player >= TW_PLAYER_COUNT) return 0;
    tw_path_t path;
    if (!tw_grid_find_path(&browser_session.match.players[player].grid, &path)) return 0;
    return path.length;
}

static size_t append_path(size_t used, uint8_t player) {
    tw_path_t path;
    const tw_grid_t *grid = &browser_session.match.players[player].grid;
    if (!tw_grid_find_path(grid, &path)) return appendf(used, "[]");

    used = appendf(used, "[");
    for (uint16_t i = 0; i < path.length; ++i) {
        used = appendf(used, "%s[%u,%u]", i ? "," : "",
                       (unsigned)path.cells[i].x, (unsigned)path.cells[i].y);
    }
    return appendf(used, "]");
}

static bool fail_native_presentation(void) {
#ifdef HLW_NATIVE_V0
    /* A partial mirror is worse than no mirror: clear every presentation edict
     * and fail closed until a fresh browser reset rebuilds from authority. */
    (void)HLW_OpenRealmPresentationReset();
#endif
    return false;
}

static bool sync_native_presentation(void) {
#ifdef HLW_NATIVE_V0
    if (HLW_OpenRealmPresentationBegin() != 1) return fail_native_presentation();
    for (uint16_t i = 0; i < browser_session.match.active_creep_count; ++i) {
        const tw_creep_t *creep = &browser_session.match.active_creeps[i];
        if (HLW_OpenRealmPresentationSyncCreep(creep->id,
                                              creep->target,
                                              (uint8_t)creep->kind,
                                              creep->cell.x,
                                              creep->cell.y,
                                              creep->progress_milli,
                                              creep->hit_points) != 1) {
            return fail_native_presentation();
        }
    }
    if (HLW_OpenRealmPresentationEnd() != 1) return fail_native_presentation();
    return true;
#else
    return true;
#endif
}

EMSCRIPTEN_KEEPALIVE
int TW_BrowserReset(void) {
    browser_last_match_result = TW_APPLY_INVALID_MATCH;
    browser_last_hero_attack_result = HLW_HERO_ATTACK_INVALID_SESSION;
    browser_replay_ok = false;
    browser_native_sync_ok = true;
    browser_hero_ok = true;
    browser_initialized = tw_session_init(&browser_session,
                                          TW_BROWSER_WIDTH,
                                          TW_BROWSER_HEIGHT,
                                          (tw_cell_t){0, 3},
                                          (tw_cell_t){8, 3},
                                          TW_BROWSER_STARTING_GOLD,
                                          TW_DEFAULT_SEED);
    browser_last_session_result = browser_initialized ? TW_SESSION_OK : TW_SESSION_MATCH_REJECTED;
#ifdef HLW_NATIVE_V0
    if (browser_initialized) {
        browser_native_sync_ok = HLW_OpenRealmPresentationReset() == 1 &&
                                 sync_native_presentation();
    }
#endif
#ifdef HLW_HERO_V0
    if (browser_initialized && browser_native_sync_ok) {
        browser_hero_ok = HLW_OpenRealmHeroReset() == 1;
    }
#endif
    const bool ready = browser_initialized && browser_native_sync_ok && browser_hero_ok;
    if (browser_initialized) {
        fprintf(stderr,
                "TOWER_WARS_BROWSER_RESET=%s seed=%llu gold=%u path0=%u path1=%u native=%s hero=%s\n",
                ready ? "PASS" : "FAIL",
                (unsigned long long)browser_session.origin.seed,
                (unsigned)TW_BROWSER_STARTING_GOLD,
                (unsigned)path_length_for(0),
                (unsigned)path_length_for(1),
                browser_native_sync_ok ? "PASS" : "FAIL",
                browser_hero_ok ? "PASS" : "FAIL");
    }
    return ready ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int TW_BrowserBuild(int actor, int tower, int x, int y) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
    const tw_action_t action = {
        .actor = (uint8_t)actor,
        .kind = TW_ACTION_BUILD,
        .data.build = {
            .tower = (tw_tower_kind_t)tower,
            .cell = {(uint8_t)x, (uint8_t)y},
        },
    };
    browser_last_session_result = tw_session_apply_action(
        &browser_session, &action, &browser_last_match_result);
    const bool ok = browser_last_session_result == TW_SESSION_OK &&
                    browser_last_match_result == TW_APPLY_OK;
    fprintf(stderr,
            "TOWER_WARS_BROWSER_BUILD=%s actor=%d tower=%d cell=%d,%d path=%u events=%u\n",
            ok ? "PASS" : "REJECT", actor, tower, x, y,
            actor >= 0 && actor < TW_PLAYER_COUNT ? (unsigned)path_length_for((uint8_t)actor) : 0,
            (unsigned)browser_session.event_count);
    return ok ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int TW_BrowserSend(int actor, int creep) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
    const tw_action_t action = {
        .actor = (uint8_t)actor,
        .kind = TW_ACTION_SEND,
        .data.send = {.creep = (tw_creep_kind_t)creep},
    };
    browser_last_session_result = tw_session_apply_action(
        &browser_session, &action, &browser_last_match_result);
    const bool ok = browser_last_session_result == TW_SESSION_OK &&
                    browser_last_match_result == TW_APPLY_OK;
    fprintf(stderr,
            "TOWER_WARS_BROWSER_SEND=%s actor=%d creep=%d pending=%u events=%u\n",
            ok ? "PASS" : "REJECT", actor, creep,
            (unsigned)browser_session.match.pending_send_count,
            (unsigned)browser_session.event_count);
    return ok ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int TW_BrowserStep(int ticks) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok || ticks < 0) return 0;
    browser_last_session_result = tw_session_step(&browser_session, (uint32_t)ticks);
    const bool session_ok = browser_last_session_result == TW_SESSION_OK;
    if (session_ok) {
        browser_native_sync_ok = sync_native_presentation();
#ifdef HLW_HERO_V0
        if (browser_native_sync_ok) {
            browser_hero_ok = HLW_OpenRealmHeroStep((uint32_t)ticks) == 1;
        }
#endif
        fprintf(stderr,
                "TOWER_WARS_BROWSER_STEP=%s ticks=%d now=%llu active=%u lives=%u,%u events=%u native=%s hero=%s\n",
                browser_native_sync_ok && browser_hero_ok ? "PASS" : "FAIL",
                ticks,
                (unsigned long long)browser_session.match.tick,
                (unsigned)browser_session.match.active_creep_count,
                (unsigned)browser_session.match.players[0].lives,
                (unsigned)browser_session.match.players[1].lives,
                (unsigned)browser_session.event_count,
                browser_native_sync_ok ? "PASS" : "FAIL",
                browser_hero_ok ? "PASS" : "FAIL");
    }
    return session_ok && browser_native_sync_ok && browser_hero_ok ? 1 : 0;
}

#ifdef HLW_HERO_V0
EMSCRIPTEN_KEEPALIVE
int HLW_BrowserHeroMove(int actor, int x, int y) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
    if (actor < 0 || actor >= TW_PLAYER_COUNT) return 0;
    return HLW_OpenRealmHeroCommandMove((uint8_t)actor, x, y) == 1 ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int HLW_BrowserHeroAttack(int actor) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
    if (actor < 0 || actor >= TW_PLAYER_COUNT) {
        browser_last_hero_attack_result = HLW_HERO_ATTACK_INVALID_ACTOR;
        return 0;
    }

    const uint32_t creep_id = HLW_OpenRealmHeroAcquireTarget(
        (uint8_t)actor, (float)HLW_HERO_BASIC_RANGE_WORLD);
    if (!creep_id) {
        browser_last_hero_attack_result = HLW_HERO_ATTACK_INVALID_TARGET;
        fprintf(stderr, "HLW_BROWSER_HERO_ATTACK=REJECT actor=%d reason=no-legal-target\n", actor);
        return 0;
    }

    hlw_hero_attack_outcome_t outcome;
    browser_last_hero_attack_result = tw_session_hero_attack(
        &browser_session, (uint8_t)actor, creep_id, &outcome);
    if (browser_last_hero_attack_result != HLW_HERO_ATTACK_OK) {
        fprintf(stderr,
                "HLW_BROWSER_HERO_ATTACK=REJECT actor=%d creep=%u result=%u tick=%llu ready=%llu\n",
                actor,
                (unsigned)creep_id,
                (unsigned)browser_last_hero_attack_result,
                (unsigned long long)browser_session.match.tick,
                (unsigned long long)browser_session.hero_ready_tick[actor]);
        return 0;
    }

    browser_native_sync_ok = sync_native_presentation();
    if (!browser_native_sync_ok) {
        fprintf(stderr,
                "HLW_BROWSER_HERO_ATTACK=FAIL actor=%d creep=%u reason=native-sync\n",
                actor, (unsigned)creep_id);
        return 0;
    }

    fprintf(stderr,
            "HLW_BROWSER_HERO_ATTACK=PASS actor=%d creep=%u killed=%u hp=%u reward=%u gold=%u ready=%llu events=%u\n",
            actor,
            (unsigned)creep_id,
            outcome.killed ? 1u : 0u,
            (unsigned)outcome.remaining_hit_points,
            (unsigned)outcome.reward_gold,
            (unsigned)browser_session.match.players[actor].gold,
            (unsigned long long)browser_session.hero_ready_tick[actor],
            (unsigned)browser_session.event_count);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int HLW_BrowserHeroEntity(int actor) {
    if (actor < 0 || actor >= TW_PLAYER_COUNT) return 0;
    return (int)HLW_OpenRealmHeroEntityNumber((uint8_t)actor);
}

EMSCRIPTEN_KEEPALIVE
int HLW_BrowserHeroX(int actor) {
    if (actor < 0 || actor >= TW_PLAYER_COUNT) return 0;
    return HLW_OpenRealmHeroX((uint8_t)actor);
}

EMSCRIPTEN_KEEPALIVE
int HLW_BrowserHeroY(int actor) {
    if (actor < 0 || actor >= TW_PLAYER_COUNT) return 0;
    return HLW_OpenRealmHeroY((uint8_t)actor);
}
#endif

EMSCRIPTEN_KEEPALIVE
int TW_BrowserReplayVerify(void) {
    if (!browser_initialized) return 0;
    tw_session_t replayed;
    browser_last_session_result = tw_session_replay(&browser_session, &replayed);
    browser_replay_ok = browser_last_session_result == TW_SESSION_OK &&
                        tw_session_state_hash(&replayed) == tw_session_state_hash(&browser_session) &&
                        tw_session_log_hash(&replayed) == tw_session_log_hash(&browser_session);
    fprintf(stderr,
            "TOWER_WARS_BROWSER_REPLAY=%s events=%u state=%016llx log=%016llx\n",
            browser_replay_ok ? "PASS" : "FAIL",
            (unsigned)browser_session.event_count,
            (unsigned long long)tw_session_state_hash(&browser_session),
            (unsigned long long)tw_session_log_hash(&browser_session));
    return browser_replay_ok ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
const char *TW_BrowserSnapshot(void) {
    if (!browser_initialized) return "{\"initialized\":false}";

    size_t used = 0;
    const tw_match_t *match = &browser_session.match;
    used = appendf(used,
                   "{\"initialized\":true,\"tick\":%llu,\"eventCount\":%u,"
                   "\"pendingCount\":%u,\"activeCount\":%u,\"terminal\":%s,"
                   "\"winner\":%u,\"loser\":%u,\"lastSessionResult\":%u,"
                   "\"lastMatchResult\":%u,\"lastHeroAttackResult\":%u,"
                   "\"replayOk\":%s,\"nativeSyncOk\":%s,\"heroOk\":%s,"
                   "\"heroReady\":[%llu,%llu],"
                   "\"stateHash\":\"%016llx\",\"logHash\":\"%016llx\",",
                   (unsigned long long)match->tick,
                   (unsigned)browser_session.event_count,
                   (unsigned)match->pending_send_count,
                   (unsigned)match->active_creep_count,
                   match->terminal ? "true" : "false",
                   (unsigned)match->winner,
                   (unsigned)match->loser,
                   (unsigned)browser_last_session_result,
                   (unsigned)browser_last_match_result,
                   (unsigned)browser_last_hero_attack_result,
                   browser_replay_ok ? "true" : "false",
                   browser_native_sync_ok ? "true" : "false",
                   browser_hero_ok ? "true" : "false",
                   (unsigned long long)browser_session.hero_ready_tick[0],
                   (unsigned long long)browser_session.hero_ready_tick[1],
                   (unsigned long long)tw_session_state_hash(&browser_session),
                   (unsigned long long)tw_session_log_hash(&browser_session));

    used = appendf(used, "\"players\":[");
    for (uint8_t p = 0; p < TW_PLAYER_COUNT; ++p) {
        const tw_player_state_t *player = &match->players[p];
        used = appendf(used,
                       "%s{\"gold\":%u,\"income\":%u,\"lives\":%u,"
                       "\"towerCount\":%u,\"pathLength\":%u,\"path\":",
                       p ? "," : "",
                       (unsigned)player->gold,
                       (unsigned)player->income,
                       (unsigned)player->lives,
                       (unsigned)player->tower_count,
                       (unsigned)path_length_for(p));
        used = append_path(used, p);
        used = appendf(used, ",\"towers\":[");
        for (uint16_t i = 0; i < player->tower_count; ++i) {
            const tw_tower_t *tower = &player->towers[i];
            used = appendf(used,
                           "%s{\"id\":%u,\"kind\":%u,\"x\":%u,\"y\":%u,\"cooldown\":%u}",
                           i ? "," : "",
                           (unsigned)tower->id,
                           (unsigned)tower->kind,
                           (unsigned)tower->cell.x,
                           (unsigned)tower->cell.y,
                           (unsigned)tower->cooldown_ticks);
        }
        used = appendf(used, "]}");
    }

    used = appendf(used, "],\"creeps\":[");
    const uint16_t visible = match->active_creep_count < TW_BROWSER_VISIBLE_CREEPS
                                 ? match->active_creep_count
                                 : TW_BROWSER_VISIBLE_CREEPS;
    for (uint16_t i = 0; i < visible; ++i) {
        const tw_creep_t *creep = &match->active_creeps[i];
        used = appendf(used,
                       "%s{\"id\":%u,\"sender\":%u,\"target\":%u,\"kind\":%u,"
                       "\"hp\":%u,\"x\":%u,\"y\":%u,\"progress\":%u}",
                       i ? "," : "",
                       (unsigned)creep->id,
                       (unsigned)creep->sender,
                       (unsigned)creep->target,
                       (unsigned)creep->kind,
                       (unsigned)creep->hit_points,
                       (unsigned)creep->cell.x,
                       (unsigned)creep->cell.y,
                       (unsigned)creep->progress_milli);
    }
    appendf(used, "]}");
    browser_json[sizeof(browser_json) - 1] = '\0';
    return browser_json;
}
