#!/usr/bin/env python3
from pathlib import Path

path = Path('games/warcraft-3/game/g_save.c')
text = path.read_text()


def once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'g_save.c: expected one match, got {count}: {old[:120]!r}')
    text = text.replace(old, new, 1)

# OpenRealm's native WC3 save format intentionally stores two 32-bit pieces of
# relocation metadata inside pointer/function-pointer fields. wasm32 pointers
# are four bytes, so preserving that on-disk ABI by writing past the pointer
# field would be memory corruption. Keep the native invariant intact and make
# browser save/load explicitly unsupported in this viability spike.
once(
    '_Static_assert(sizeof(umove_t *) == 8, "F_MMOVE packs a relocation offset and a validation hash into the pointer field");\n'
    '_Static_assert(sizeof(void (*)(LPEDICT)) == 8, "F_CFUNCTION packs a roster index and a name hash into the pointer field");\n',
    '#ifndef __EMSCRIPTEN__\n'
    '_Static_assert(sizeof(umove_t *) == 8, "F_MMOVE packs a relocation offset and a validation hash into the pointer field");\n'
    '_Static_assert(sizeof(void (*)(LPEDICT)) == 8, "F_CFUNCTION packs a roster index and a name hash into the pointer field");\n'
    '#endif\n',
)

once(
    'BOOL G_GetSaveMap(LPCSTR filename, LPSTR map, DWORD map_size) {\n',
    'BOOL G_GetSaveMap(LPCSTR filename, LPSTR map, DWORD map_size) {\n'
    '#ifdef __EMSCRIPTEN__\n'
    '    (void)filename; (void)map; (void)map_size;\n'
    '    fprintf(stderr, "WC3 browser spike: save files are disabled on wasm32\\n");\n'
    '    return false;\n'
    '#endif\n',
)

once(
    'BOOL WriteGame(LPCSTR filename) {\n',
    'BOOL WriteGame(LPCSTR filename) {\n'
    '#ifdef __EMSCRIPTEN__\n'
    '    (void)filename;\n'
    '    fprintf(stderr, "WC3 browser spike: SaveGame is disabled on wasm32\\n");\n'
    '    return false;\n'
    '#endif\n',
)

once(
    'BOOL ReadGame(LPCSTR filename) {\n',
    'BOOL ReadGame(LPCSTR filename) {\n'
    '#ifdef __EMSCRIPTEN__\n'
    '    (void)filename;\n'
    '    fprintf(stderr, "WC3 browser spike: LoadGame is disabled on wasm32\\n");\n'
    '    return false;\n'
    '#endif\n',
)

path.write_text(text)
print('OpenRealm wasm32 save boundary applied')
