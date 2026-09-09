#include "tw_replay.h"

#include <string.h>

static uint64_t hash_byte(uint64_t hash, uint8_t byte) {
    hash ^= byte;
    return hash * UINT64_C(1099511628211);
}

static uint64_t hash_u32(uint64_t hash, uint32_t value) {
    for (unsigned shift = 0; shift < 32; shift += 8) {
        hash = hash_byte(hash, (uint8_t)(value >> shift));
    }
    return hash;
}

static uint64_t hash_u64(uint64_t hash, uint64_t value) {
    for (unsigned shift = 0; shift < 64; shift += 8) {
        hash = hash_byte(hash, (uint8_t)(value >> shift));
    }
    return hash;
}

bool tw_session_init(tw_session_t *session,
                     uint8_t width,
                     uint8_t height,
                     tw_cell_t entrance,
                     tw_cell_t exit,
                     uint32_t starting_gold,
                     uint64_t seed) {
    if (!session) return false;
    memset(session, 0, sizeof(*session));

    session->origin = (tw_session_origin_t){
        .seed = seed,
        .starting_gold = starting_gold,
        .width = width,
        .height = height,
        .entrance = entrance,
        .exit = exit,
    };

    if (!tw_match_init(&session->match, width, height, entrance, exit, starting_gold)) {
        memset(session, 0, sizeof(*session));
        return false;
    }
    return true;
}

tw_session_result_t tw_session_apply_action(tw_session_t *session,
                                            const tw_action_t *action,
                                            tw_apply_result_t *match_result_out) {
    if (match_result_out) *match_result_out = TW_APPLY_INVALID_MATCH;
    if (!session) return TW_SESSION_MATCH_REJECTED;
    if (session->event_count >= TW_MAX_LOG_EVENTS) return TW_SESSION_LOG_CAPACITY;

    tw_session_t candidate = *session;
    const tw_apply_result_t result = tw_match_apply_action(&candidate.match, action);
    if (match_result_out) *match_result_out = result;
    if (result != TW_APPLY_OK) return TW_SESSION_MATCH_REJECTED;

    candidate.events[candidate.event_count++] = (tw_event_t){
        .kind = TW_EVENT_ACTION,
        .data.action = *action,
    };
    *session = candidate;
    return TW_SESSION_OK;
}

tw_session_result_t tw_session_step(tw_session_t *session, uint32_t ticks) {
    if (!session) return TW_SESSION_MATCH_REJECTED;

    /* Zero-length and post-terminal steps are explicitly safe no-ops, not
     * authoritative gameplay mutations, so they do not consume log capacity. */
    if (ticks == 0 || session->match.terminal) {
        if (!tw_match_step(&session->match, ticks)) return TW_SESSION_MATCH_REJECTED;
        return TW_SESSION_OK;
    }
    if (session->event_count >= TW_MAX_LOG_EVENTS) return TW_SESSION_LOG_CAPACITY;

    tw_session_t candidate = *session;
    if (!tw_match_step(&candidate.match, ticks)) return TW_SESSION_MATCH_REJECTED;
    candidate.events[candidate.event_count++] = (tw_event_t){
        .kind = TW_EVENT_STEP,
        .data.ticks = ticks,
    };
    *session = candidate;
    return TW_SESSION_OK;
}

uint64_t tw_session_state_hash(const tw_session_t *session) {
    if (!session) return 0;

    uint64_t hash = UINT64_C(1469598103934665603);
    hash = hash_u64(hash, session->origin.seed);
    hash = hash_u32(hash, session->origin.starting_gold);
    hash = hash_byte(hash, session->origin.width);
    hash = hash_byte(hash, session->origin.height);
    hash = hash_byte(hash, session->origin.entrance.x);
    hash = hash_byte(hash, session->origin.entrance.y);
    hash = hash_byte(hash, session->origin.exit.x);
    hash = hash_byte(hash, session->origin.exit.y);
    hash = hash_u64(hash, tw_match_hash(&session->match));
    return hash;
}

uint64_t tw_session_log_hash(const tw_session_t *session) {
    if (!session) return 0;

    uint64_t hash = UINT64_C(1469598103934665603);
    hash = hash_u32(hash, session->event_count);

    for (uint16_t i = 0; i < session->event_count; ++i) {
        const tw_event_t *event = &session->events[i];
        hash = hash_u32(hash, (uint32_t)event->kind);
        switch (event->kind) {
            case TW_EVENT_ACTION: {
                const tw_action_t *action = &event->data.action;
                hash = hash_byte(hash, action->actor);
                hash = hash_u32(hash, (uint32_t)action->kind);
                if (action->kind == TW_ACTION_BUILD) {
                    hash = hash_u32(hash, (uint32_t)action->data.build.tower);
                    hash = hash_byte(hash, action->data.build.cell.x);
                    hash = hash_byte(hash, action->data.build.cell.y);
                } else if (action->kind == TW_ACTION_SEND) {
                    hash = hash_u32(hash, (uint32_t)action->data.send.creep);
                }
                break;
            }
            case TW_EVENT_STEP:
                hash = hash_u32(hash, event->data.ticks);
                break;
            default:
                /* Unknown event kinds still produce a deterministic digest;
                 * replay will reject them rather than interpreting payload. */
                break;
        }
    }
    return hash;
}

tw_session_result_t tw_session_replay(const tw_session_t *recorded,
                                      tw_session_t *replayed_out) {
    if (!recorded || !replayed_out || recorded->event_count > TW_MAX_LOG_EVENTS) {
        return TW_SESSION_REPLAY_DIVERGED;
    }

    tw_session_t replayed;
    if (!tw_session_init(&replayed,
                         recorded->origin.width,
                         recorded->origin.height,
                         recorded->origin.entrance,
                         recorded->origin.exit,
                         recorded->origin.starting_gold,
                         recorded->origin.seed)) {
        return TW_SESSION_REPLAY_DIVERGED;
    }

    for (uint16_t i = 0; i < recorded->event_count; ++i) {
        const tw_event_t *event = &recorded->events[i];
        tw_session_result_t result;
        switch (event->kind) {
            case TW_EVENT_ACTION: {
                tw_apply_result_t match_result = TW_APPLY_INVALID_MATCH;
                result = tw_session_apply_action(&replayed, &event->data.action, &match_result);
                if (result != TW_SESSION_OK || match_result != TW_APPLY_OK) {
                    return TW_SESSION_REPLAY_DIVERGED;
                }
                break;
            }
            case TW_EVENT_STEP:
                result = tw_session_step(&replayed, event->data.ticks);
                if (result != TW_SESSION_OK) return TW_SESSION_REPLAY_DIVERGED;
                break;
            default:
                return TW_SESSION_REPLAY_DIVERGED;
        }
    }

    if (replayed.event_count != recorded->event_count ||
        tw_session_log_hash(&replayed) != tw_session_log_hash(recorded) ||
        tw_session_state_hash(&replayed) != tw_session_state_hash(recorded)) {
        return TW_SESSION_REPLAY_DIVERGED;
    }

    *replayed_out = replayed;
    return TW_SESSION_OK;
}
