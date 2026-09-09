#!/usr/bin/env python3
from pathlib import Path

path = Path("spike/tower_wars/tw_browser.c")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    text = text.replace(old, new, 1)


replace_once(
'''extern uint32_t HLW_OpenRealmHeroAcquireTarget(uint8_t actor, float range);
#endif
''',
'''extern uint32_t HLW_OpenRealmHeroAcquireTarget(uint8_t actor, float range);
extern uint64_t HLW_OpenRealmNativeSemanticHash(void);
extern uint32_t HLW_OpenRealmNativePresentationCount(void);
#endif
''',
"native hash extern",
)

replace_once(
'''static bool browser_hero_ok = true;
static char browser_json[TW_BROWSER_JSON_CAPACITY];
''',
'''static bool browser_hero_ok = true;
static char browser_json[TW_BROWSER_JSON_CAPACITY];

#define HLW_BROWSER_COMMAND_MAX 512

typedef enum {
    HLW_BROWSER_COMMAND_BUILD = 1,
    HLW_BROWSER_COMMAND_SEND = 2,
    HLW_BROWSER_COMMAND_STEP = 3,
    HLW_BROWSER_COMMAND_MOVE = 4,
    HLW_BROWSER_COMMAND_ATTACK = 5,
    HLW_BROWSER_COMMAND_ABILITY = 6,
} hlw_browser_command_kind_t;

typedef struct {
    hlw_browser_command_kind_t kind;
    int32_t a;
    int32_t b;
    int32_t c;
    int32_t d;
} hlw_browser_command_t;

static hlw_browser_command_t browser_commands[HLW_BROWSER_COMMAND_MAX];
static uint16_t browser_command_count;
static bool browser_journal_replaying;
static char browser_replay_json[512];

static bool hlw_command_preflight(void) {
    return browser_journal_replaying || browser_command_count < HLW_BROWSER_COMMAND_MAX;
}

static void hlw_command_record(hlw_browser_command_kind_t kind,
                               int32_t a,
                               int32_t b,
                               int32_t c,
                               int32_t d) {
    if (browser_journal_replaying) return;
    if (browser_command_count >= HLW_BROWSER_COMMAND_MAX) return;
    browser_commands[browser_command_count++] = (hlw_browser_command_t){
        .kind = kind, .a = a, .b = b, .c = c, .d = d,
    };
}

static uint64_t hlw_command_hash_byte(uint64_t hash, uint8_t byte) {
    hash ^= byte;
    return hash * UINT64_C(1099511628211);
}

static uint64_t hlw_command_hash_u32(uint64_t hash, uint32_t value) {
    for (unsigned shift = 0; shift < 32; shift += 8) {
        hash = hlw_command_hash_byte(hash, (uint8_t)(value >> shift));
    }
    return hash;
}

static uint64_t hlw_command_log_hash(void) {
    uint64_t hash = UINT64_C(1469598103934665603);
    hash = hlw_command_hash_u32(hash, browser_command_count);
    for (uint16_t i = 0; i < browser_command_count; ++i) {
        const hlw_browser_command_t *command = &browser_commands[i];
        hash = hlw_command_hash_u32(hash, (uint32_t)command->kind);
        hash = hlw_command_hash_u32(hash, (uint32_t)command->a);
        hash = hlw_command_hash_u32(hash, (uint32_t)command->b);
        hash = hlw_command_hash_u32(hash, (uint32_t)command->c);
        hash = hlw_command_hash_u32(hash, (uint32_t)command->d);
    }
    return hash;
}
''',
"command journal globals",
)

replace_once(
'''    const bool ready = browser_initialized && browser_native_sync_ok && browser_hero_ok;
    if (browser_initialized) {
''',
'''    const bool ready = browser_initialized && browser_native_sync_ok && browser_hero_ok;
    if (ready && !browser_journal_replaying) {
        browser_command_count = 0;
        memset(browser_commands, 0, sizeof(browser_commands));
    }
    if (browser_initialized) {
''',
"reset journal",
)

replace_once(
'''int TW_BrowserBuild(int actor, int tower, int x, int y) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
''',
'''int TW_BrowserBuild(int actor, int tower, int x, int y) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
    if (!hlw_command_preflight()) return 0;
''',
"build preflight",
)
replace_once(
'''    const bool ok = browser_last_session_result == TW_SESSION_OK &&
                    browser_last_match_result == TW_APPLY_OK;
    fprintf(stderr,
            "TOWER_WARS_BROWSER_BUILD=%s actor=%d tower=%d cell=%d,%d path=%u events=%u\\n",
''',
'''    const bool ok = browser_last_session_result == TW_SESSION_OK &&
                    browser_last_match_result == TW_APPLY_OK;
    if (ok) hlw_command_record(HLW_BROWSER_COMMAND_BUILD, actor, tower, x, y);
    fprintf(stderr,
            "TOWER_WARS_BROWSER_BUILD=%s actor=%d tower=%d cell=%d,%d path=%u events=%u\\n",
''',
"build record",
)

replace_once(
'''int TW_BrowserSend(int actor, int creep) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
''',
'''int TW_BrowserSend(int actor, int creep) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
    if (!hlw_command_preflight()) return 0;
''',
"send preflight",
)
replace_once(
'''    const bool ok = browser_last_session_result == TW_SESSION_OK &&
                    browser_last_match_result == TW_APPLY_OK;
    fprintf(stderr,
            "TOWER_WARS_BROWSER_SEND=%s actor=%d creep=%d pending=%u events=%u\\n",
''',
'''    const bool ok = browser_last_session_result == TW_SESSION_OK &&
                    browser_last_match_result == TW_APPLY_OK;
    if (ok) hlw_command_record(HLW_BROWSER_COMMAND_SEND, actor, creep, 0, 0);
    fprintf(stderr,
            "TOWER_WARS_BROWSER_SEND=%s actor=%d creep=%d pending=%u events=%u\\n",
''',
"send record",
)

replace_once(
'''int TW_BrowserStep(int ticks) {
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
                "TOWER_WARS_BROWSER_STEP=%s ticks=%d now=%llu active=%u lives=%u,%u events=%u native=%s hero=%s\\n",
                browser_native_sync_ok && browser_hero_ok ? "PASS" : "FAIL",
                ticks,
''',
'''int TW_BrowserStep(int ticks) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok || ticks < 0) return 0;
    const uint64_t tick_before = browser_session.match.tick;
    const uint16_t events_before = browser_session.event_count;
    if (ticks > 0 && !browser_session.match.terminal && !hlw_command_preflight()) return 0;
    browser_last_session_result = tw_session_step(&browser_session, (uint32_t)ticks);
    const bool session_ok = browser_last_session_result == TW_SESSION_OK;
    const uint64_t advanced64 = browser_session.match.tick - tick_before;
    const uint32_t authoritative_ticks = (uint32_t)advanced64;
    if (session_ok && browser_session.event_count != events_before) {
        hlw_command_record(HLW_BROWSER_COMMAND_STEP, ticks, 0, 0, 0);
    }
    if (session_ok) {
        browser_native_sync_ok = sync_native_presentation();
#ifdef HLW_HERO_V0
        if (browser_native_sync_ok && authoritative_ticks > 0) {
            browser_hero_ok = HLW_OpenRealmHeroStep(authoritative_ticks) == 1;
        }
#endif
        fprintf(stderr,
                "TOWER_WARS_BROWSER_STEP=%s ticks=%d advanced=%u now=%llu active=%u lives=%u,%u events=%u native=%s hero=%s\\n",
                browser_native_sync_ok && browser_hero_ok ? "PASS" : "FAIL",
                ticks,
                (unsigned)authoritative_ticks,
''',
"step authoritative ticks",
)

replace_once(
'''int HLW_BrowserHeroMove(int actor, int x, int y) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
    if (actor < 0 || actor >= TW_PLAYER_COUNT) return 0;
    return HLW_OpenRealmHeroCommandMove((uint8_t)actor, x, y) == 1 ? 1 : 0;
}
''',
'''int HLW_BrowserHeroMove(int actor, int x, int y) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok) return 0;
    if (browser_session.match.terminal || actor < 0 || actor >= TW_PLAYER_COUNT) return 0;
    if (!hlw_command_preflight()) return 0;
    const int ok = HLW_OpenRealmHeroCommandMove((uint8_t)actor, x, y) == 1 ? 1 : 0;
    if (ok) hlw_command_record(HLW_BROWSER_COMMAND_MOVE, actor, x, y, 0);
    return ok;
}
''',
"move journal",
)

replace_once(
'''    if (actor < 0 || actor >= TW_PLAYER_COUNT) {
        browser_last_hero_attack_result = HLW_HERO_ATTACK_INVALID_ACTOR;
        return 0;
    }

    const uint32_t creep_id = HLW_OpenRealmHeroAcquireTarget(
''',
'''    if (actor < 0 || actor >= TW_PLAYER_COUNT) {
        browser_last_hero_attack_result = HLW_HERO_ATTACK_INVALID_ACTOR;
        return 0;
    }
    if (browser_session.match.terminal || !hlw_command_preflight()) return 0;

    const uint32_t creep_id = HLW_OpenRealmHeroAcquireTarget(
''',
"attack preflight",
)
replace_once(
'''    browser_native_sync_ok = sync_native_presentation();
    if (!browser_native_sync_ok) {
        fprintf(stderr,
                "HLW_BROWSER_HERO_ATTACK=FAIL actor=%d creep=%u reason=native-sync\\n",
''',
'''    hlw_command_record(HLW_BROWSER_COMMAND_ATTACK, actor, 0, 0, 0);
    browser_native_sync_ok = sync_native_presentation();
    if (!browser_native_sync_ok) {
        fprintf(stderr,
                "HLW_BROWSER_HERO_ATTACK=FAIL actor=%d creep=%u reason=native-sync\\n",
''',
"attack record",
)

replace_once(
'''    if (actor < 0 || actor >= TW_PLAYER_COUNT) {
        browser_last_hero_ability_result = HLW_HERO_ABILITY_INVALID_ACTOR;
        return 0;
    }

    const uint32_t creep_id = HLW_OpenRealmHeroAcquireTarget(
''',
'''    if (actor < 0 || actor >= TW_PLAYER_COUNT) {
        browser_last_hero_ability_result = HLW_HERO_ABILITY_INVALID_ACTOR;
        return 0;
    }
    if (browser_session.match.terminal || !hlw_command_preflight()) return 0;

    const uint32_t creep_id = HLW_OpenRealmHeroAcquireTarget(
''',
"ability preflight",
)
replace_once(
'''    browser_native_sync_ok = sync_native_presentation();
    if (!browser_native_sync_ok) {
        fprintf(stderr,
                "HLW_BROWSER_HERO_ABILITY=FAIL actor=%d ability=PHASE_LANCE creep=%u reason=native-sync\\n",
''',
'''    hlw_command_record(HLW_BROWSER_COMMAND_ABILITY, actor, 0, 0, 0);
    browser_native_sync_ok = sync_native_presentation();
    if (!browser_native_sync_ok) {
        fprintf(stderr,
                "HLW_BROWSER_HERO_ABILITY=FAIL actor=%d ability=PHASE_LANCE creep=%u reason=native-sync\\n",
''',
"ability record",
)

replay_anchor = '''EMSCRIPTEN_KEEPALIVE
int TW_BrowserReplayVerify(void) {
'''
replay_insert = '''static int hlw_replay_one_command(const hlw_browser_command_t *command) {
    if (!command) return 0;
    switch (command->kind) {
        case HLW_BROWSER_COMMAND_BUILD:
            return TW_BrowserBuild(command->a, command->b, command->c, command->d);
        case HLW_BROWSER_COMMAND_SEND:
            return TW_BrowserSend(command->a, command->b);
        case HLW_BROWSER_COMMAND_STEP:
            return TW_BrowserStep(command->a);
        case HLW_BROWSER_COMMAND_MOVE:
            return HLW_BrowserHeroMove(command->a, command->b, command->c);
        case HLW_BROWSER_COMMAND_ATTACK:
            return HLW_BrowserHeroAttack(command->a);
        case HLW_BROWSER_COMMAND_ABILITY:
            return HLW_BrowserHeroAbility(command->a);
        default:
            return 0;
    }
}

EMSCRIPTEN_KEEPALIVE
int HLW_BrowserCommandCount(void) {
    return (int)browser_command_count;
}

EMSCRIPTEN_KEEPALIVE
int HLW_BrowserNativeReplayVerify(void) {
    if (!browser_initialized || !browser_native_sync_ok || !browser_hero_ok || browser_journal_replaying) return 0;

    hlw_browser_command_t saved[HLW_BROWSER_COMMAND_MAX];
    const uint16_t saved_count = browser_command_count;
    memcpy(saved, browser_commands, (size_t)saved_count * sizeof(saved[0]));

    const uint64_t expected_state = tw_session_state_hash(&browser_session);
    const uint64_t expected_session_log = tw_session_log_hash(&browser_session);
    const uint64_t expected_command_log = hlw_command_log_hash();
    const uint64_t expected_native = HLW_OpenRealmNativeSemanticHash();
    const uint32_t expected_native_creeps = HLW_OpenRealmNativePresentationCount();

    browser_journal_replaying = true;
    bool replay_ok = TW_BrowserReset() == 1;
    for (uint16_t i = 0; replay_ok && i < saved_count; ++i) {
        replay_ok = hlw_replay_one_command(&saved[i]) == 1;
    }
    browser_journal_replaying = false;

    const uint64_t actual_state = tw_session_state_hash(&browser_session);
    const uint64_t actual_session_log = tw_session_log_hash(&browser_session);
    const uint64_t actual_command_log = hlw_command_log_hash();
    const uint64_t actual_native = HLW_OpenRealmNativeSemanticHash();
    const uint32_t actual_native_creeps = HLW_OpenRealmNativePresentationCount();

    replay_ok = replay_ok &&
                browser_command_count == saved_count &&
                actual_state == expected_state &&
                actual_session_log == expected_session_log &&
                actual_command_log == expected_command_log &&
                actual_native == expected_native &&
                actual_native_creeps == expected_native_creeps;

    browser_replay_ok = replay_ok;
    if (!replay_ok) {
        /* A divergent destructive replay is not a usable product state. Freeze
         * every mutation ingress until the caller performs a fresh reset. */
        browser_native_sync_ok = false;
        browser_hero_ok = false;
    }

    fprintf(stderr,
            "HLW_H7_NATIVE_REPLAY=%s commands=%u state=%016llx/%016llx sessionLog=%016llx/%016llx commandLog=%016llx/%016llx native=%016llx/%016llx creeps=%u/%u\\n",
            replay_ok ? "PASS" : "FAIL",
            (unsigned)saved_count,
            (unsigned long long)expected_state,
            (unsigned long long)actual_state,
            (unsigned long long)expected_session_log,
            (unsigned long long)actual_session_log,
            (unsigned long long)expected_command_log,
            (unsigned long long)actual_command_log,
            (unsigned long long)expected_native,
            (unsigned long long)actual_native,
            (unsigned)expected_native_creeps,
            (unsigned)actual_native_creeps);
    return replay_ok ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
const char *HLW_BrowserReplaySnapshot(void) {
    const uint64_t native_hash = HLW_OpenRealmNativeSemanticHash();
    snprintf(browser_replay_json, sizeof(browser_replay_json),
             "{\\\"commandCount\\\":%u,\\\"commandHash\\\":\\\"%016llx\\\","
             "\\\"nativeHash\\\":\\\"%016llx\\\",\\\"nativeCreepCount\\\":%u,"
             "\\\"hero0\\\":[%d,%d],\\\"hero1\\\":[%d,%d],"
             "\\\"stateHash\\\":\\\"%016llx\\\",\\\"sessionLogHash\\\":\\\"%016llx\\\"}",
             (unsigned)browser_command_count,
             (unsigned long long)hlw_command_log_hash(),
             (unsigned long long)native_hash,
             (unsigned)HLW_OpenRealmNativePresentationCount(),
             HLW_OpenRealmHeroX(0), HLW_OpenRealmHeroY(0),
             HLW_OpenRealmHeroX(1), HLW_OpenRealmHeroY(1),
             (unsigned long long)tw_session_state_hash(&browser_session),
             (unsigned long long)tw_session_log_hash(&browser_session));
    browser_replay_json[sizeof(browser_replay_json) - 1] = '\\0';
    return browser_replay_json;
}

EMSCRIPTEN_KEEPALIVE
int TW_BrowserReplayVerify(void) {
'''
replace_once(replay_anchor, replay_insert, "H7 replay functions")

path.write_text(text)
print("Hero Line Wars H7 ordered command journal applied")
