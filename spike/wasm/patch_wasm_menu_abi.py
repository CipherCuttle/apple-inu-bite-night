#!/usr/bin/env python3
from pathlib import Path

path = Path("games/warcraft-3/menu/menu_main.c")
text = path.read_text()
old = '''#include <stdlib.h>
#include <stdio.h>

#include "menu_local.h"
'''
new = '''#include <stdlib.h>
#include <stdio.h>
#ifdef __EMSCRIPTEN__
#include <stdarg.h>
#endif

#include "menu_local.h"
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"menu_main.c: expected include block once, got {count}")
text = text.replace(old, new, 1)

anchor = '''menuImport_t mi;
LPCPLAYER menu_player;

void M_UpdatePlayerState(LPCPLAYER state) { menu_player = state; }
'''
replacement = '''menuImport_t mi;
LPCPLAYER menu_player;

#ifdef __EMSCRIPTEN__
/* The native menu ABI is a shared-library boundary built from function tables.
 * In the browser spike those modules are linked into one Wasm executable, where
 * indirect calls are signature-checked. Keep the small boot-critical host
 * surface on direct Wasm calls rather than globally emulating function-pointer
 * casts and hiding future ABI defects. */
int FS_ReadFileQ3(LPCSTR filename, void **buf);
void FS_FreeFile(void *buf);
HANDLE MemAlloc(long size);
void MemFree(HANDLE mem);

static int M_WasmFSReadFile(LPCSTR fileName, void **buf) {
    return FS_ReadFileQ3(fileName, buf);
}

static void M_WasmFSFreeFile(void *buf) {
    FS_FreeFile(buf);
}

static HANDLE M_WasmMemAlloc(long size) {
    return MemAlloc(size);
}

static void M_WasmMemFree(HANDLE mem) {
    MemFree(mem);
}

static void M_WasmPrintf(LPCSTR fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vfprintf(stderr, fmt, args);
    va_end(args);
}
#endif

void M_UpdatePlayerState(LPCPLAYER state) { menu_player = state; }
'''
count = text.count(anchor)
if count != 1:
    raise SystemExit(f"menu_main.c: expected menu import anchor once, got {count}")
text = text.replace(anchor, replacement, 1)

old_api = '''menuExport_t M_GetAPI(menuImport_t import) {
    mi = import;
    
    menuExport_t exp;
'''
new_api = '''menuExport_t M_GetAPI(menuImport_t import) {
    mi = import;
#ifdef __EMSCRIPTEN__
    mi.FS_ReadFile = M_WasmFSReadFile;
    mi.FS_FreeFile = M_WasmFSFreeFile;
    mi.MemAlloc = M_WasmMemAlloc;
    mi.MemFree = M_WasmMemFree;
    mi.Printf = M_WasmPrintf;
#endif
    
    menuExport_t exp;
'''
count = text.count(old_api)
if count != 1:
    raise SystemExit(f"menu_main.c: expected M_GetAPI anchor once, got {count}")
path.write_text(text.replace(old_api, new_api, 1))
print("OpenRealm wasm menu ABI adapter applied")
