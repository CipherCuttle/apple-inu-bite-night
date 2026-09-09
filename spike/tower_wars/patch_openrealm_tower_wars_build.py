#!/usr/bin/env python3
from pathlib import Path

path = Path("spike/wasm/build_openrealm_wasm.sh")
text = path.read_text()

compile_anchor = """printf 'OPENREALM_MENU_ISOLATION_CRITICAL=PASS\\n'\n\n# Copy engine-owned, redistributable config/font assets only. No Warcraft III\n"""
compile_replacement = """printf 'OPENREALM_MENU_ISOLATION_CRITICAL=PASS\\n'\n\n# G8: compile the deterministic Tower Wars session into the same Wasm module as\n# OpenRealm. The browser bridge exports session-level mutations only; raw match\n# mutation functions are not part of the JS ABI.\nif [[ \"${TW_BROWSER_V0:-0}\" != \"1\" ]]; then\n  echo 'TW_BROWSER_V0=1 is required for the Tower Wars browser build' >&2\n  exit 7\nfi\ncat > build-wasm/unity_tower_wars.c <<'TWUNITY'\n#include \"../../spike/tower_wars/tw_grid.c\"\n#include \"../../spike/tower_wars/tw_match.c\"\n#include \"../../spike/tower_wars/tw_replay.c\"\n#include \"../../spike/tower_wars/tw_browser.c\"\nTWUNITY\necho \"[wasm:tower-wars]\"\nemcc -std=c11 -O2 -Wall -Wextra -Werror \\\n  -I../spike/tower_wars \\\n  -c build-wasm/unity_tower_wars.c \\\n  -o build-wasm/obj/tower_wars.o\ntest -s build-wasm/obj/tower_wars.o\nprintf 'TOWER_WARS_WASM_CORE_COMPILE=PASS\\n'\n\n# Copy engine-owned, redistributable config/font assets only. No Warcraft III\n"""
count = text.count(compile_anchor)
if count != 1:
    raise SystemExit(f"build script: expected post-isolation anchor once, got {count}")
text = text.replace(compile_anchor, compile_replacement, 1)

shell_start = "cat > build-wasm/shell.html <<'HTML'\n"
shell_end = "\nHTML\n\nemcc \\\n"
start = text.find(shell_start)
if start < 0:
    raise SystemExit("build script: shell start anchor missing")
end = text.find(shell_end, start)
if end < 0:
    raise SystemExit("build script: shell end anchor missing")
if text.find(shell_start, start + 1) >= 0:
    raise SystemExit("build script: multiple shell start anchors")
replacement = "cp ../spike/tower_wars/tower_wars_shell.html build-wasm/shell.html\n\nemcc \\\n"
text = text[:start] + replacement + text[end + len(shell_end):]

link_anchor = """  build-wasm/obj/game.o \\\n  build-wasm/menu-isolated.ll \\\n  -o build-wasm/openrealm.html \\\n"""
link_replacement = """  build-wasm/obj/game.o \\\n  build-wasm/menu-isolated.ll \\\n  build-wasm/obj/tower_wars.o \\\n  -o build-wasm/openrealm.html \\\n"""
count = text.count(link_anchor)
if count != 1:
    raise SystemExit(f"build script: expected isolated menu link anchor once, got {count}")
text = text.replace(link_anchor, link_replacement, 1)

runtime_anchor = """  -sFORCE_FILESYSTEM=1 \\\n  --preload-file build/share@/share \\\n"""
runtime_replacement = """  -sFORCE_FILESYSTEM=1 \\\n  -sEXPORTED_RUNTIME_METHODS=UTF8ToString \\\n  --preload-file build/share@/share \\\n"""
count = text.count(runtime_anchor)
if count != 1:
    raise SystemExit(f"build script: expected runtime export anchor once, got {count}")
text = text.replace(runtime_anchor, runtime_replacement, 1)

pass_anchor = "printf 'OPENREALM_ENGINE_LINK=PASS\\n'\n"
if text.count(pass_anchor) != 1:
    raise SystemExit("build script: engine-link marker anchor mismatch")
text = text.replace(pass_anchor, pass_anchor + "printf 'TOWER_WARS_OPENREALM_LINK=PASS\\n'\n", 1)

path.write_text(text)
print("Tower Wars OpenRealm build injection applied")
