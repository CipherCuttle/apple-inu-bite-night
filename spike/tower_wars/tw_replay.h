#ifndef TW_REPLAY_H
#define TW_REPLAY_H

#include "tw_match.h"

#include <stdbool.h>
#include <stdint.h>

#define TW_MAX_LOG_EVENTS 512
#define TW_DEFAULT_SEED UINT64_C(0x54574f5257415253)

typedef struct {
    uint64_t seed;
    uint32_t starting_gold;
    uint8_t width;
    uint8_t height;
    tw_cell_t entrance;
    tw_cell_t exit;
} tw_session_origin_t;

typedef enum {
    TW_EVENT_ACTION = 1,
    TW_EVENT_STEP = 2,
} tw_event_kind_t;

typedef struct {
    tw_event_kind_t kind;
    union {
        tw_action_t action;
        uint32_t ticks;
    } data;
} tw_event_t;

typedef struct {
    tw_session_origin_t origin;
    tw_match_t match;
    uint16_t event_count;
    tw_event_t events[TW_MAX_LOG_EVENTS];
} tw_session_t;

typedef enum {
    TW_SESSION_OK = 0,
    TW_SESSION_MATCH_REJECTED,
    TW_SESSION_LOG_CAPACITY,
    TW_SESSION_REPLAY_DIVERGED,
} tw_session_result_t;

bool tw_session_init(tw_session_t *session,
                     uint8_t width,
                     uint8_t height,
                     tw_cell_t entrance,
                     tw_cell_t exit,
                     uint32_t starting_gold,
                     uint64_t seed);

tw_session_result_t tw_session_apply_action(tw_session_t *session,
                                            const tw_action_t *action,
                                            tw_apply_result_t *match_result_out);

tw_session_result_t tw_session_step(tw_session_t *session, uint32_t ticks);

/* Rebuild from recorded origin + ordered events and verify final state/log hashes. */
tw_session_result_t tw_session_replay(const tw_session_t *recorded,
                                      tw_session_t *replayed_out);

/* State hash is context-bound to origin/seed but deliberately excludes the log. */
uint64_t tw_session_state_hash(const tw_session_t *session);
uint64_t tw_session_log_hash(const tw_session_t *session);

#endif
