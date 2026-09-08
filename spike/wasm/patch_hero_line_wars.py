#!/usr/bin/env python3
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"{path}: start marker not found: {start[:100]!r}")
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f"{path}: end marker not found: {end[:100]!r}")
    b += len(end)
    p.write_text(text[:a] + replacement + text[b:])


# This phase deliberately reuses the proven asset-free OpenRealm wasm smoke
# world, but replaces the smoke behavior with a small authoritative Hero Line
# Wars game. The server remains the owner of economy, movement, combat, leaks,
# levels and win/loss; the browser shell only sends input and reads exported
# presentation state.

# Emscripten exports used by the browser HUD/input bridge.
replace_once(
    "games/warcraft-3/game/g_main.c",
    '#include <stdarg.h>\n',
    '#include <stdarg.h>\n#ifdef __EMSCRIPTEN__\n#include <emscripten/emscripten.h>\n#endif\n',
)

# The old virtual-map sentinel is a spike implementation detail. Keep the
# narrow virtual-map exception, but give the actual game its own identity.
for filename in (
    "games/warcraft-3/game/g_main.c",
    "client/cl_view.c",
    "common/common.c",
):
    p = Path(filename)
    text = p.read_text()
    if "__wasm_smoke__" not in text:
        raise SystemExit(f"{filename}: expected wasm smoke sentinel before HLW overlay")
    p.write_text(text.replace("__wasm_smoke__", "__hero_line_wars__"))

# Authoritative game state and browser input bridge. All synthetic units still
# spawn through OpenRealm's real WC3 edict/model/snapshot path.
anchor = 'static FLOAT wasm_map_unit_smoke_direction = 1.0f;\n'
insert = r'''static FLOAT wasm_map_unit_smoke_direction = 1.0f;

#define HLW_MAX_CREEPS 128
#define HLW_PLAYER 0
#define HLW_ENEMY 1
#define HLW_LANE_PLAYER_Y (-110.0f)
#define HLW_LANE_ENEMY_Y (110.0f)
#define HLW_SPAWN_X (-255.0f)
#define HLW_EXIT_X (255.0f)
#define HLW_INCOME_FRAMES 100
#define HLW_HERO_ATTACK_FRAMES 5
#define HLW_NOVA_COOLDOWN_FRAMES 60

typedef struct {
    LPEDICT ent;
    BYTE sender;
    BYTE defender;
    BYTE type;
    BOOL active;
    FLOAT hp;
    FLOAT max_hp;
    FLOAT speed;
    DWORD reward;
    DWORD xp;
} hlwCreep_t;

typedef struct {
    LONG gold;
    LONG income;
    LONG lives;
    DWORD level;
    DWORD xp;
    DWORD attack_cooldown;
} hlwSide_t;

static hlwCreep_t hlw_creeps[HLW_MAX_CREEPS];
static hlwSide_t hlw_side[2];
static LPEDICT hlw_hero[2];
static BOOL hlw_move[4]; /* left, right, up, down */
static DWORD hlw_last_income_frame;
static DWORD hlw_next_ai_send_frame;
static DWORD hlw_nova_cooldown;
static int hlw_game_state; /* 0 playing, 1 player won, -1 player lost */
static DWORD hlw_model_unit;

static const LONG hlw_send_cost[3] = { 10, 35, 75 };
static const LONG hlw_send_income[3] = { 2, 6, 12 };
static const FLOAT hlw_creep_hp[3] = { 48.0f, 125.0f, 260.0f };
static const FLOAT hlw_creep_speed[3] = { 3.6f, 2.35f, 1.55f };
static const DWORD hlw_creep_reward[3] = { 3, 8, 16 };
static const DWORD hlw_creep_xp[3] = { 8, 18, 34 };
static const FLOAT hlw_creep_scale[3] = { 9.0f, 14.0f, 19.0f };

static void HLW_RemoveCreep(DWORD slot) {
    hlwCreep_t *creep;
    if (slot >= HLW_MAX_CREEPS) return;
    creep = &hlw_creeps[slot];
    if (creep->active && creep->ent && creep->ent->inuse) G_FreeEdict(creep->ent);
    memset(creep, 0, sizeof(*creep));
}

static DWORD HLW_LevelNeed(DWORD level) {
    return 38u + MAX(1u, level) * 32u;
}

static void HLW_AwardKill(BYTE defender, hlwCreep_t const *creep) {
    if (!creep || defender > 1) return;
    hlw_side[defender].gold += (LONG)creep->reward;
    hlw_side[defender].xp += creep->xp;
    while (hlw_side[defender].xp >= HLW_LevelNeed(hlw_side[defender].level)) {
        hlw_side[defender].xp -= HLW_LevelNeed(hlw_side[defender].level);
        hlw_side[defender].level++;
    }
}

static void HLW_KillCreep(DWORD slot, BYTE defender) {
    hlwCreep_t copy;
    if (slot >= HLW_MAX_CREEPS || !hlw_creeps[slot].active) return;
    copy = hlw_creeps[slot];
    HLW_AwardKill(defender, &copy);
    HLW_RemoveCreep(slot);
}

static int HLW_FindFreeCreepSlot(void) {
    FOR_LOOP(i, HLW_MAX_CREEPS) if (!hlw_creeps[i].active) return (int)i;
    return -1;
}

static int HLW_SpawnCreep(BYTE sender, BYTE type) {
    int slot;
    VECTOR2 spawn;
    LPEDICT ent;
    hlwCreep_t *creep;
    BYTE defender;

    if (sender > 1 || type > 2 || hlw_game_state) return 0;
    slot = HLW_FindFreeCreepSlot();
    if (slot < 0) return 0;
    defender = sender == HLW_PLAYER ? HLW_ENEMY : HLW_PLAYER;
    spawn = (VECTOR2){ HLW_SPAWN_X, defender == HLW_PLAYER ? HLW_LANE_PLAYER_Y : HLW_LANE_ENEMY_Y };
    ent = SP_SpawnAtLocation(WASM_MAP_UNIT_SMOKE_CLASS, sender, &spawn);
    if (!ent) return 0;

    ent->think = NULL;
    ent->s.model = hlw_model_unit;
    ent->s.player = sender;
    ent->s.scale = hlw_creep_scale[type];
    ent->s.radius = hlw_creep_scale[type] + 4.0f;
    ent->collision = 9.0f;
    ent->s.collision = 9.0f;
    ent->s.origin.z = 6.0f;
    ent->health.max_value = hlw_creep_hp[type];
    ent->health.value = hlw_creep_hp[type];
    gi.LinkEntity(ent);

    creep = &hlw_creeps[slot];
    memset(creep, 0, sizeof(*creep));
    creep->ent = ent;
    creep->sender = sender;
    creep->defender = defender;
    creep->type = type;
    creep->active = true;
    creep->hp = creep->max_hp = hlw_creep_hp[type];
    creep->speed = hlw_creep_speed[type];
    creep->reward = hlw_creep_reward[type];
    creep->xp = hlw_creep_xp[type];
    return 1;
}

static int HLW_SendForSide(BYTE side, BYTE type) {
    if (side > 1 || type > 2 || hlw_game_state) return 0;
    if (hlw_side[side].gold < hlw_send_cost[type]) return 0;
    if (!HLW_SpawnCreep(side, type)) return 0;
    hlw_side[side].gold -= hlw_send_cost[type];
    hlw_side[side].income += hlw_send_income[type];
    return 1;
}

static void HLW_ResetState(void) {
    FOR_LOOP(i, HLW_MAX_CREEPS) HLW_RemoveCreep(i);
    memset(hlw_move, 0, sizeof(hlw_move));
    hlw_side[HLW_PLAYER] = (hlwSide_t){ 80, 20, 20, 1, 0, 0 };
    hlw_side[HLW_ENEMY] = (hlwSide_t){ 80, 20, 20, 1, 0, 0 };
    hlw_last_income_frame = level.framenum;
    hlw_next_ai_send_frame = level.framenum + 12;
    hlw_nova_cooldown = 0;
    hlw_game_state = 0;

    if (hlw_hero[HLW_PLAYER]) {
        hlw_hero[HLW_PLAYER]->s.origin = (VECTOR3){ -55.0f, HLW_LANE_PLAYER_Y, 7.0f };
        hlw_hero[HLW_PLAYER]->s.player = HLW_PLAYER;
        hlw_hero[HLW_PLAYER]->s.scale = 24.0f;
        hlw_hero[HLW_PLAYER]->s.radius = 26.0f;
        gi.LinkEntity(hlw_hero[HLW_PLAYER]);
    }
    if (hlw_hero[HLW_ENEMY]) {
        hlw_hero[HLW_ENEMY]->s.origin = (VECTOR3){ -55.0f, HLW_LANE_ENEMY_Y, 7.0f };
        hlw_hero[HLW_ENEMY]->s.player = HLW_ENEMY;
        hlw_hero[HLW_ENEMY]->s.scale = 24.0f;
        hlw_hero[HLW_ENEMY]->s.radius = 26.0f;
        gi.LinkEntity(hlw_hero[HLW_ENEMY]);
    }
}

static void HLW_Init(void) {
    VECTOR2 enemy_spawn = { -55.0f, HLW_LANE_ENEMY_Y };

    memset(hlw_creeps, 0, sizeof(hlw_creeps));
    memset(hlw_hero, 0, sizeof(hlw_hero));
    hlw_model_unit = wasm_map_unit_smoke_unit ? wasm_map_unit_smoke_unit->s.model : 0;
    hlw_hero[HLW_PLAYER] = wasm_map_unit_smoke_unit;
    hlw_hero[HLW_ENEMY] = SP_SpawnAtLocation(WASM_MAP_UNIT_SMOKE_CLASS, HLW_ENEMY, &enemy_spawn);
    if (!hlw_hero[HLW_PLAYER] || !hlw_hero[HLW_ENEMY]) {
        fprintf(stderr, "HERO_LINE_WARS_KERNEL=FAIL hero spawn\n");
        return;
    }
    hlw_hero[HLW_PLAYER]->think = NULL;
    hlw_hero[HLW_ENEMY]->think = NULL;
    hlw_hero[HLW_ENEMY]->s.model = hlw_model_unit;
    HLW_ResetState();
    fprintf(stderr, "HERO_LINE_WARS_KERNEL=READY gold=%ld income=%ld lives=%ld\n",
            (long)hlw_side[0].gold, (long)hlw_side[0].income, (long)hlw_side[0].lives);
}

static FLOAT HLW_Distance2D(LPCEDICT a, LPCEDICT b) {
    FLOAT dx, dy;
    if (!a || !b) return 999999.0f;
    dx = a->s.origin.x - b->s.origin.x;
    dy = a->s.origin.y - b->s.origin.y;
    return sqrtf(dx * dx + dy * dy);
}

static int HLW_FindNearestCreep(BYTE defender, LPCEDICT hero, FLOAT range) {
    int best = -1;
    FLOAT best_distance = range;
    FOR_LOOP(i, HLW_MAX_CREEPS) {
        FLOAT distance;
        hlwCreep_t const *creep = &hlw_creeps[i];
        if (!creep->active || creep->defender != defender || !creep->ent || !creep->ent->inuse) continue;
        distance = HLW_Distance2D(hero, creep->ent);
        if (distance <= best_distance) {
            best = (int)i;
            best_distance = distance;
        }
    }
    return best;
}

static void HLW_HeroAttack(BYTE defender) {
    int target;
    FLOAT damage;
    if (defender > 1 || !hlw_hero[defender] || hlw_side[defender].attack_cooldown) return;
    target = HLW_FindNearestCreep(defender, hlw_hero[defender], 108.0f);
    if (target < 0) return;
    damage = defender == HLW_PLAYER
        ? 24.0f + hlw_side[defender].level * 4.0f
        : 21.0f + hlw_side[defender].level * 3.5f;
    hlw_creeps[target].hp -= damage;
    hlw_creeps[target].ent->health.value = MAX(0.0f, hlw_creeps[target].hp);
    hlw_side[defender].attack_cooldown = HLW_HERO_ATTACK_FRAMES;
    if (hlw_creeps[target].hp <= 0.0f) HLW_KillCreep((DWORD)target, defender);
}

static void HLW_MovePlayerHero(void) {
    FLOAT dx = (hlw_move[1] ? 1.0f : 0.0f) - (hlw_move[0] ? 1.0f : 0.0f);
    FLOAT dy = (hlw_move[2] ? 1.0f : 0.0f) - (hlw_move[3] ? 1.0f : 0.0f);
    FLOAT length;
    LPEDICT hero = hlw_hero[HLW_PLAYER];
    if (!hero || (!dx && !dy)) return;
    length = sqrtf(dx * dx + dy * dy);
    if (length > 0.0f) { dx /= length; dy /= length; }
    hero->s.origin.x = MAX(-235.0f, MIN(220.0f, hero->s.origin.x + dx * 5.5f));
    hero->s.origin.y = MAX(-165.0f, MIN(-55.0f, hero->s.origin.y + dy * 5.0f));
    gi.LinkEntity(hero);
}

static void HLW_MoveEnemyHero(void) {
    LPEDICT hero = hlw_hero[HLW_ENEMY];
    int target;
    FLOAT wanted;
    if (!hero) return;
    target = HLW_FindNearestCreep(HLW_ENEMY, hero, 9999.0f);
    wanted = target >= 0 ? hlw_creeps[target].ent->s.origin.x - 55.0f : -55.0f;
    if (hero->s.origin.x < wanted - 3.0f) hero->s.origin.x += 3.4f;
    else if (hero->s.origin.x > wanted + 3.0f) hero->s.origin.x -= 3.4f;
    hero->s.origin.x = MAX(-230.0f, MIN(210.0f, hero->s.origin.x));
    hero->s.origin.y = HLW_LANE_ENEMY_Y;
    gi.LinkEntity(hero);
}

static void HLW_CheckWinLoss(void) {
    if (hlw_side[HLW_ENEMY].lives <= 0 && !hlw_game_state) {
        hlw_game_state = 1;
        fprintf(stderr, "HERO_LINE_WARS_RESULT=PLAYER_WIN frame=%u\n", (unsigned)level.framenum);
    } else if (hlw_side[HLW_PLAYER].lives <= 0 && !hlw_game_state) {
        hlw_game_state = -1;
        fprintf(stderr, "HERO_LINE_WARS_RESULT=PLAYER_LOSS frame=%u\n", (unsigned)level.framenum);
    }
}

static void HLW_RunCreeps(void) {
    FOR_LOOP(i, HLW_MAX_CREEPS) {
        hlwCreep_t *creep = &hlw_creeps[i];
        if (!creep->active || !creep->ent || !creep->ent->inuse) continue;
        creep->ent->s.origin.x += creep->speed;
        creep->ent->s.origin.y = creep->defender == HLW_PLAYER ? HLW_LANE_PLAYER_Y : HLW_LANE_ENEMY_Y;
        gi.LinkEntity(creep->ent);
        if (creep->ent->s.origin.x >= HLW_EXIT_X) {
            hlw_side[creep->defender].lives--;
            fprintf(stderr, "HERO_LINE_WARS_LEAK defender=%u lives=%ld type=%u\n",
                    (unsigned)creep->defender, (long)hlw_side[creep->defender].lives,
                    (unsigned)creep->type);
            HLW_RemoveCreep(i);
        }
    }
}

static void HLW_RunEconomy(void) {
    if (level.framenum - hlw_last_income_frame >= HLW_INCOME_FRAMES) {
        hlw_side[HLW_PLAYER].gold += hlw_side[HLW_PLAYER].income;
        hlw_side[HLW_ENEMY].gold += hlw_side[HLW_ENEMY].income;
        hlw_last_income_frame = level.framenum;
        fprintf(stderr, "HERO_LINE_WARS_INCOME player=%ld/%ld enemy=%ld/%ld\n",
                (long)hlw_side[0].gold, (long)hlw_side[0].income,
                (long)hlw_side[1].gold, (long)hlw_side[1].income);
    }

    if (level.framenum >= hlw_next_ai_send_frame) {
        BYTE type = 0;
        if (level.framenum > 500 && hlw_side[HLW_ENEMY].gold >= hlw_send_cost[2]) type = 2;
        else if (hlw_side[HLW_ENEMY].gold >= hlw_send_cost[1]) type = 1;
        if (!HLW_SendForSide(HLW_ENEMY, type) && type != 0) HLW_SendForSide(HLW_ENEMY, 0);
        hlw_next_ai_send_frame = level.framenum + 34;
    }
}

static void HLW_RunFrame(void) {
    if (hlw_game_state) return;
    if (hlw_side[0].attack_cooldown) hlw_side[0].attack_cooldown--;
    if (hlw_side[1].attack_cooldown) hlw_side[1].attack_cooldown--;
    if (hlw_nova_cooldown) hlw_nova_cooldown--;
    HLW_RunEconomy();
    HLW_MovePlayerHero();
    HLW_MoveEnemyHero();
    HLW_RunCreeps();
    HLW_HeroAttack(HLW_PLAYER);
    HLW_HeroAttack(HLW_ENEMY);
    HLW_CheckWinLoss();
}

EMSCRIPTEN_KEEPALIVE int HLW_Send(int type) {
    if (type < 0 || type > 2) return 0;
    return HLW_SendForSide(HLW_PLAYER, (BYTE)type);
}

EMSCRIPTEN_KEEPALIVE void HLW_SetMove(int direction, int down) {
    if (direction < 0 || direction > 3) return;
    hlw_move[direction] = down ? true : false;
}

EMSCRIPTEN_KEEPALIVE int HLW_CastNova(void) {
    LPEDICT hero = hlw_hero[HLW_PLAYER];
    FLOAT damage;
    int hits = 0;
    if (!hero || hlw_game_state || hlw_nova_cooldown) return 0;
    damage = 58.0f + hlw_side[HLW_PLAYER].level * 8.0f;
    FOR_LOOP(i, HLW_MAX_CREEPS) {
        hlwCreep_t *creep = &hlw_creeps[i];
        if (!creep->active || creep->defender != HLW_PLAYER || !creep->ent) continue;
        if (HLW_Distance2D(hero, creep->ent) > 155.0f) continue;
        creep->hp -= damage;
        creep->ent->health.value = MAX(0.0f, creep->hp);
        hits++;
        if (creep->hp <= 0.0f) HLW_KillCreep(i, HLW_PLAYER);
    }
    hlw_nova_cooldown = HLW_NOVA_COOLDOWN_FRAMES;
    return hits + 1; /* nonzero also confirms a successful empty cast */
}

EMSCRIPTEN_KEEPALIVE void HLW_Reset(void) { HLW_ResetState(); }
EMSCRIPTEN_KEEPALIVE int HLW_GetGold(void) { return (int)hlw_side[0].gold; }
EMSCRIPTEN_KEEPALIVE int HLW_GetIncome(void) { return (int)hlw_side[0].income; }
EMSCRIPTEN_KEEPALIVE int HLW_GetEnemyIncome(void) { return (int)hlw_side[1].income; }
EMSCRIPTEN_KEEPALIVE int HLW_GetLives(int side) { return side >= 0 && side < 2 ? (int)hlw_side[side].lives : 0; }
EMSCRIPTEN_KEEPALIVE int HLW_GetHeroLevel(int side) { return side >= 0 && side < 2 ? (int)hlw_side[side].level : 0; }
EMSCRIPTEN_KEEPALIVE int HLW_GetHeroXp(int side) { return side >= 0 && side < 2 ? (int)hlw_side[side].xp : 0; }
EMSCRIPTEN_KEEPALIVE int HLW_GetNovaCooldown(void) { return (int)((hlw_nova_cooldown + 9) / 10); }
EMSCRIPTEN_KEEPALIVE int HLW_GetIncomeCountdown(void) {
    DWORD elapsed = level.framenum - hlw_last_income_frame;
    return (int)((HLW_INCOME_FRAMES > elapsed ? HLW_INCOME_FRAMES - elapsed : 0) / 10);
}
EMSCRIPTEN_KEEPALIVE int HLW_GetGameState(void) { return hlw_game_state; }
EMSCRIPTEN_KEEPALIVE int HLW_GetHeroX10(void) {
    return hlw_hero[0] ? (int)(hlw_hero[0]->s.origin.x * 10.0f) : 0;
}
EMSCRIPTEN_KEEPALIVE int HLW_GetCreepCount(int defender) {
    int count = 0;
    if (defender < 0 || defender > 1) return 0;
    FOR_LOOP(i, HLW_MAX_CREEPS) if (hlw_creeps[i].active && hlw_creeps[i].defender == defender) count++;
    return count;
}
'''
replace_once("games/warcraft-3/game/g_main.c", anchor, insert)

# Repurpose the original smoke unit as the player hero and initialize the whole
# HLW state only after the real production spawn/model path succeeded.
replace_once(
    "games/warcraft-3/game/g_main.c",
    '''    wasm_map_unit_smoke_unit->think = NULL;\n    gi.LinkEntity(wasm_map_unit_smoke_unit);\n\n    fprintf(stderr,\n''',
    '''    wasm_map_unit_smoke_unit->think = NULL;\n    gi.LinkEntity(wasm_map_unit_smoke_unit);\n    HLW_Init();\n\n    fprintf(stderr,\n''',
)

# Replace the old oscillating smoke marker with the game simulation.
run_start = '''    if (wasm_map_unit_smoke) {\n        static DWORD last_report_frame;\n'''
run_end = '''        return;\n    }\n#endif\n\n    G_StartScripts();\n'''
run_replacement = '''    if (wasm_map_unit_smoke) {\n        HLW_RunFrame();\n        return;\n    }\n#endif\n\n    G_StartScripts();\n'''
replace_between("games/warcraft-3/game/g_main.c", run_start, run_end, run_replacement)

# The original visual smoke intentionally rendered one diagnostic marker. Turn
# that renderer-owned overlay into two Hero Line Wars lanes and project every
# authoritative hero/creep snapshot onto the board. Scale encodes role/type:
# heroes=24, runner=9, brute=14, juggernaut=19.
visual_start = '''#ifdef __EMSCRIPTEN__\n    if (!strcmp(cl.configstrings[CS_WORLD], "__hero_line_wars__")) {\n        size2_t const window = re.GetWindowSize();\n'''
visual_end = '''    }\n#endif\n    CL_DrawTEnts();\n'''
visual_replacement = r'''#ifdef __EMSCRIPTEN__
    if (!strcmp(cl.configstrings[CS_WORLD], "__hero_line_wars__")) {
        size2_t const window = re.GetWindowSize();
        FLOAT const board_w = window.width * 0.78f;
        FLOAT const board_h = window.height * 0.62f;
        FLOAT const board_x = (window.width - board_w) * 0.5f;
        FLOAT const board_y = (window.height - board_h) * 0.46f;
        FLOAT const cell_w = board_w / 13.0f;
        FLOAT const cell_h = board_h / 9.0f;
        RECT border = { board_x - 7.0f, board_y - 7.0f, board_w + 14.0f, board_h + 14.0f };
        RECT top_lane = { board_x, board_y + board_h * 0.20f, board_w, board_h * 0.22f };
        RECT bottom_lane = { board_x, board_y + board_h * 0.58f, board_w, board_h * 0.22f };
        RECT enemy_exit = { board_x + board_w - 12.0f, top_lane.y, 12.0f, top_lane.height };
        RECT player_exit = { board_x + board_w - 12.0f, bottom_lane.y, 12.0f, bottom_lane.height };
        re.DrawFill(&border, (COLOR32){ 135, 55, 205, 255 });
        for (int y = 0; y < 9; y++) {
            for (int x = 0; x < 13; x++) {
                RECT cell = {
                    board_x + x * cell_w + 1.0f,
                    board_y + y * cell_h + 1.0f,
                    cell_w - 2.0f,
                    cell_h - 2.0f
                };
                COLOR32 color = ((x + y) & 1)
                    ? (COLOR32){ 50, 24, 72, 255 }
                    : (COLOR32){ 27, 14, 42, 255 };
                re.DrawFill(&cell, color);
            }
        }
        re.DrawFill(&top_lane, (COLOR32){ 52, 22, 75, 255 });
        re.DrawFill(&bottom_lane, (COLOR32){ 37, 27, 68, 255 });
        re.DrawFill(&enemy_exit, (COLOR32){ 255, 73, 128, 255 });
        re.DrawFill(&player_exit, (COLOR32){ 64, 235, 180, 255 });

        FOR_LOOP(i, cl.num_active) {
            DWORD const number = cl.active_entities[i];
            entityState_t const *state;
            FLOAT tx, ty, size;
            RECT marker;
            COLOR32 color;
            BOOL hero;
            if (!number || number >= MAX_CLIENT_ENTITIES) continue;
            state = &cl.ents[number].current;
            if (state->class_id != MAKEFOURCC('o', 'p', 'e', 'o')) continue;
            tx = (state->origin.x + 270.0f) / 540.0f;
            ty = (180.0f - state->origin.y) / 360.0f;
            tx = MAX(0.0f, MIN(1.0f, tx));
            ty = MAX(0.0f, MIN(1.0f, ty));
            hero = state->scale >= 23.0f;
            size = hero ? 26.0f : MAX(10.0f, state->scale * 1.15f);
            if (hero) {
                color = state->player == 0
                    ? (COLOR32){ 65, 245, 182, 255 }
                    : (COLOR32){ 255, 72, 132, 255 };
            } else if (state->scale >= 18.0f) {
                color = state->player == 0
                    ? (COLOR32){ 173, 116, 255, 255 }
                    : (COLOR32){ 255, 107, 75, 255 };
            } else if (state->scale >= 13.0f) {
                color = state->player == 0
                    ? (COLOR32){ 90, 183, 255, 255 }
                    : (COLOR32){ 255, 153, 66, 255 };
            } else {
                color = state->player == 0
                    ? (COLOR32){ 255, 222, 84, 255 }
                    : (COLOR32){ 255, 92, 92, 255 };
            }
            marker = (RECT){
                board_x + tx * board_w - size * 0.5f,
                board_y + ty * board_h - size * 0.5f,
                size, size
            };
            re.DrawFill(&marker, color);
            if (hero) {
                RECT core = { marker.x + 6.0f, marker.y + 6.0f,
                              MAX(3.0f, marker.width - 12.0f), MAX(3.0f, marker.height - 12.0f) };
                re.DrawFill(&core, (COLOR32){ 240, 240, 245, 255 });
            }
        }
        re.DrawString((int)board_x, (int)(board_y - 27.0f), "HERO LINE WARS // OPENREALM WASM");
        re.DrawString((int)(board_x + 8.0f), (int)(top_lane.y + 8.0f), "ENEMY LINE");
        re.DrawString((int)(board_x + 8.0f), (int)(bottom_lane.y + 8.0f), "YOUR LINE");
        {
            static BOOL hlw_board_reported = false;
            if (!hlw_board_reported) {
                fprintf(stderr, "HERO_LINE_WARS_BOARD=PASS %.0fx%.0f\n", board_w, board_h);
                hlw_board_reported = true;
            }
        }
    }
#endif
    CL_DrawTEnts();
'''
replace_between("client/cl_view.c", visual_start, visual_end, visual_replacement)

# Native WC3 info panels are intentionally not part of the asset-free browser
# game. Drag-selection may still happen, but it must not wake retail UI texture
# paths and reintroduce missing-texture magenta blocks.
replace_once(
    "games/warcraft-3/game/hud/hud_infopanel.c",
    '''void UI_SendInfoPanel(LPEDICT ent, LPEDICT *selected, DWORD count) {\n    UI_WriteStart(LAYER_INFOPANEL);\n''',
    '''void UI_SendInfoPanel(LPEDICT ent, LPEDICT *selected, DWORD count) {\n#ifdef __EMSCRIPTEN__\n    if (!strcmp(level.map_path, "__hero_line_wars__")) {\n        UI_ClearLayer(ent, LAYER_INFOPANEL);\n        UI_SeedInfoPanelCache(ent, selected, count);\n        return;\n    }\n#endif\n    UI_WriteStart(LAYER_INFOPANEL);\n''',
)

print("OpenRealm Hero Line Wars authoritative kernel applied")
