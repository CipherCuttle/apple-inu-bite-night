#!/usr/bin/env python3
from pathlib import Path

path = Path("sound/s_sound.c")
text = path.read_text()
old = '''BOOL S_Init(void) {
    memset(&s, 0, sizeof(s));
    if (SDL_Init(SDL_INIT_AUDIO) != 0) {
'''
new = '''BOOL S_Init(void) {
    memset(&s, 0, sizeof(s));
#ifdef __EMSCRIPTEN__
    /* Browser spike V0 deliberately keeps audio fail-closed. SDL2's WebAudio
     * callback currently traps through an invalid/null wasm table entry after
     * device resume. Rendering/client viability must not depend on papering
     * over that separate port boundary. All public sound calls already guard
     * s.initialized, so leaving it false is explicit and safe. */
    fprintf(stderr, "[sound] browser spike: audio disabled pending WebAudio callback port\\n");
    return FALSE;
#endif
    if (SDL_Init(SDL_INIT_AUDIO) != 0) {
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"sound/s_sound.c: expected exactly one S_Init match, got {count}")
path.write_text(text.replace(old, new, 1))
print("OpenRealm wasm audio boundary applied")
