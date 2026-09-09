#!/usr/bin/env python3
from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))

# WebGL2/GLES3 headers are supplied by Emscripten.
replace(
    "renderer/r_local.h",
    "#elif __linux__ && defined(BZ_GL_ES3)\n#include <GLES3/gl3.h>\n",
    "#elif (defined(__linux__) || defined(__EMSCRIPTEN__)) && defined(BZ_GL_ES3)\n#include <GLES3/gl3.h>\n",
)

# Name the browser platform explicitly and expose the Emscripten event loop API.
replace(
    "common/main.c",
    "#include <stdio.h>\n#ifdef _WIN32\n",
    "#include <stdio.h>\n#ifdef __EMSCRIPTEN__\n#include <emscripten.h>\n#endif\n#ifdef _WIN32\n",
)
replace(
    "common/main.c",
    "#if defined(__APPLE__)\n#define BZ_PLATFORM \"Darwin\"\n#elif defined(_WIN32)\n",
    "#if defined(__EMSCRIPTEN__)\n#define BZ_PLATFORM \"WebAssembly\"\n#elif defined(__APPLE__)\n#define BZ_PLATFORM \"Darwin\"\n#elif defined(_WIN32)\n",
)

# Browser frame pacing belongs to requestAnimationFrame, never SDL_Delay spin/sleep.
replace(
    "common/main.c",
    "    if (dedicated || !frequency) return;\n",
    "    if (dedicated || !frequency) return;\n#ifdef __EMSCRIPTEN__\n    (void)frame_start;\n    return;\n#endif\n",
)

browser_loop = r'''
#ifdef __EMSCRIPTEN__
typedef struct browser_loop_state_s {
    BOOL dedicated;
    DWORD start_time;
    DWORD frame_count;
    Uint64 performance_frequency;
} browser_loop_state_t;

static browser_loop_state_t browser_loop_state;

static void Com_BrowserFrame(void) {
    browser_loop_state_t *state = &browser_loop_state;
    Uint64 frame_start = SDL_GetPerformanceCounter();
    DWORD current_time = SDL_GetTicks();
    DWORD msec = current_time - state->start_time;

    if (SV_IsActive()) {
        SV_Frame(Cvar_Integer("com_fast_forward", 0) ? FRAMETIME : msec);
    }
    if (!state->dedicated) {
        CL_Frame(msec);
    }
    state->start_time = current_time;
    state->frame_count++;
    if (Cvar_Integer("com_frame_limit", 0) > 0 &&
        state->frame_count >= (DWORD)Cvar_Integer("com_frame_limit", 0)) {
        emscripten_cancel_main_loop();
        Com_Quit();
        return;
    }
    Com_LimitFrameRate(frame_start, state->performance_frequency, state->dedicated);
}
#endif

'''
replace("common/main.c", "int main(int argc, LPSTR argv[]) {\n", browser_loop + "int main(int argc, LPSTR argv[]) {\n")

old_loop = r'''    DWORD startTime = SDL_GetTicks();
    DWORD frameCount = 0;
    Uint64 performanceFrequency = SDL_GetPerformanceFrequency();
    while (true) {
        Uint64 frameStart = SDL_GetPerformanceCounter();
        DWORD currentTime = SDL_GetTicks();
        DWORD msec = currentTime - startTime;
        if (SV_IsActive()) {
            SV_Frame(Cvar_Integer("com_fast_forward", 0) ? FRAMETIME : msec);
        }
        if (!dedicated) {
            CL_Frame(msec);
        } else {
            /* Dedicated server: read console commands from stdin. */
            LPSTR cmd = Sys_ConsoleInput();
            if (cmd && *cmd) {
                Cbuf_AddText(cmd);
                Cbuf_AddText("\n");
                Cbuf_Execute();
            }
        }
        startTime = currentTime;
        frameCount++;
        if (Cvar_Integer("com_frame_limit", 0) > 0 &&
            frameCount >= (DWORD)Cvar_Integer("com_frame_limit", 0)) {
            Com_Quit();
        }
        Com_LimitFrameRate(frameStart, performanceFrequency, dedicated);
    }
'''
new_loop = r'''#ifdef __EMSCRIPTEN__
    browser_loop_state.dedicated = dedicated;
    browser_loop_state.start_time = SDL_GetTicks();
    browser_loop_state.frame_count = 0;
    browser_loop_state.performance_frequency = SDL_GetPerformanceFrequency();
    emscripten_set_main_loop(Com_BrowserFrame, 0, 1);
#else
    DWORD startTime = SDL_GetTicks();
    DWORD frameCount = 0;
    Uint64 performanceFrequency = SDL_GetPerformanceFrequency();
    while (true) {
        Uint64 frameStart = SDL_GetPerformanceCounter();
        DWORD current_time = SDL_GetTicks();
        DWORD msec = current_time - startTime;
        if (SV_IsActive()) {
            SV_Frame(Cvar_Integer("com_fast_forward", 0) ? FRAMETIME : msec);
        }
        if (!dedicated) {
            CL_Frame(msec);
        } else {
            /* Dedicated server: read console commands from stdin. */
            LPSTR cmd = Sys_ConsoleInput();
            if (cmd && *cmd) {
                Cbuf_AddText(cmd);
                Cbuf_AddText("\n");
                Cbuf_Execute();
            }
        }
        startTime = current_time;
        frameCount++;
        if (Cvar_Integer("com_frame_limit", 0) > 0 &&
            frameCount >= (DWORD)Cvar_Integer("com_frame_limit", 0)) {
            Com_Quit();
        }
        Com_LimitFrameRate(frameStart, performanceFrequency, dedicated);
    }
#endif
'''
replace("common/main.c", old_loop, new_loop)

# The browser V0 uses only OpenRealm's in-process loopback transport. Remote
# native UDP is explicitly deferred rather than silently proxied.
replace(
    "server/sv_init.c",
    "static BOOL SV_EnsureServerPort(void) {\n    NET_ConfigSource(NS_SERVER, true);\n",
    "static BOOL SV_EnsureServerPort(void) {\n#ifdef __EMSCRIPTEN__\n    return true;\n#endif\n    NET_ConfigSource(NS_SERVER, true);\n",
)

# PF_Sleep is a server callback; blocking a browser event loop is invalid.
replace(
    "server/sv_game.c",
    "void PF_Sleep(DWORD msec) {\n    usleep(msec * 1000);\n}\n",
    "void PF_Sleep(DWORD msec) {\n#ifdef __EMSCRIPTEN__\n    (void)msec;\n#else\n    usleep(msec * 1000);\n#endif\n}\n",
)

# A browser smoke only counts after the actual OpenRealm client init returns
# with the SDL GL context that the renderer created. BZ_GL_ES3 requests ES 3,
# which Emscripten maps to WebGL2 under the link settings in the spike harness.
replace(
    "common/main.c",
    "        SV_Init();\n        CL_Init();\n        if (load_map_from_save) {\n",
    "        SV_Init();\n        CL_Init();\n#ifdef __EMSCRIPTEN__\n"
    "        {\n"
    "            int gl_major = 0;\n"
    "            if (!SDL_GL_GetCurrentContext() || SDL_GL_GetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, &gl_major) != 0 || gl_major < 3) {\n"
    "                fprintf(stderr, \"OPENREALM_SDL_WEBGL_BOOT=FAIL major=%d error=%s\\n\", gl_major, SDL_GetError());\n"
    "                return 2;\n"
    "            }\n"
    "            fprintf(stderr, \"OPENREALM_SDL_WEBGL_BOOT=PASS major=%d\\n\", gl_major);\n"
    "            EM_ASM({\n"
    "                globalThis.__OPENREALM_SDL_WEBGL_BOOT = true;\n"
    "                const status = document.getElementById('status');\n"
    "                if (status) status.textContent = 'OPENREALM_SDL_WEBGL_BOOT=PASS';\n"
    "            });\n"
    "        }\n"
    "#endif\n"
    "        if (load_map_from_save) {\n",
)

print("OpenRealm browser overlay applied")
