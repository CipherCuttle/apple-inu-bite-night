#!/usr/bin/env python3
from pathlib import Path

path = Path("common/common.c")
text = path.read_text()
old = '''bool Com_ResolveMapArgument(LPCSTR arg, LPSTR out, DWORD out_size) {
    fsMapResolve_t status;
'''
new = '''bool Com_ResolveMapArgument(LPCSTR arg, LPSTR out, DWORD out_size) {
#ifdef __EMSCRIPTEN__
    /* Gate-5 owns exactly one virtual map sentinel. It has no W3M/W3X archive;
     * the WC3 game module constructs its source-owned smoke world. Do not relax
     * normal map discovery or filesystem validation for any other argument. */
    if (arg && !strcmp(arg, "__wasm_smoke__")) {
        if (!out || !out_size) return false;
        snprintf(out, out_size, "%s", arg);
        return true;
    }
#endif
    fsMapResolve_t status;
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"common/common.c: expected map resolver anchor once, got {count}")
path.write_text(text.replace(old, new, 1))
print("OpenRealm wasm smoke map preflight exception applied")
