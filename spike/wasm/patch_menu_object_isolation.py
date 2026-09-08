#!/usr/bin/env python3
from pathlib import Path

path = Path("spike/wasm/build_openrealm_wasm.sh")
text = path.read_text()

anchor = """compile_unity game -DSTB_FDF_IMPLEMENTATION -DSTB_FDF_GLOBALS\ncompile_unity menu -DSTB_FDF_IMPLEMENTATION -DSTB_FDF_GLOBALS\ncompile_unity app\n\n# Copy engine-owned, redistributable config/font assets only. No Warcraft III\n"""
replacement = """compile_unity game -DSTB_FDF_IMPLEMENTATION -DSTB_FDF_GLOBALS\n\n# Native OpenRealm loads libgame and libmenu in separate shared-library symbol\n# namespaces. For the monolithic browser target, keep the menu unity as LLVM\n# bitcode long enough to namespace every symbol that is also defined by game.\n# This handles macro-generated FDF functions without changing C token semantics.\necho \"[wasm:menu-bitcode]\"\nemcc \"${COMMON_FLAGS[@]}\" \"${PORT_FLAGS[@]}\" \\\n  -DSTB_FDF_IMPLEMENTATION -DSTB_FDF_GLOBALS \\\n  -flto=full -c build-wasm/unity_menu.c -o build-wasm/obj/menu.bc\ncompile_unity app\n\nLLVM_BIN=\"$(cd \"$(dirname \"$(command -v emcc)\")/..\" && pwd)/bin\"\nLLVM_NM=\"$LLVM_BIN/llvm-nm\"\nLLVM_DIS=\"$LLVM_BIN/llvm-dis\"\nLLVM_AS=\"$LLVM_BIN/llvm-as\"\nfor tool in \"$LLVM_NM\" \"$LLVM_DIS\" \"$LLVM_AS\"; do\n  if [[ ! -x \"$tool\" ]]; then\n    echo \"missing LLVM tool required for Wasm module isolation: $tool\" >&2\n    exit 3\n  fi\ndone\n\n# llvm-dis is also the format gate: if Emscripten stops emitting LLVM bitcode for\n# this command, fail here rather than silently linking an unisolated menu.\n\"$LLVM_DIS\" build-wasm/obj/menu.bc -o build-wasm/menu.ll\n\"$LLVM_NM\" -g --defined-only -j build-wasm/obj/game.o | sort -u > build-wasm/game-defined.syms\n\"$LLVM_NM\" -g --defined-only -j build-wasm/obj/menu.bc | sort -u > build-wasm/menu-defined.syms\ncomm -12 build-wasm/game-defined.syms build-wasm/menu-defined.syms \\\n  | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' \\\n  > build-wasm/menu-duplicate.syms\n\n# The exact collision family that caused browser menu boot must be visible in\n# the pinned objects. Upstream drift fails closed instead of weakening the gate.\nfor symbol in frames UI_ParseFDF UI_FdfReadFile UI_LoadTexture Theme_String; do\n  if ! grep -Fxq \"$symbol\" build-wasm/menu-duplicate.syms; then\n    echo \"expected game/menu duplicate missing: $symbol\" >&2\n    exit 4\n  fi\ndone\n\nawk '{ print $1, \"__openrealm_menu_\" $1 }' \\\n  build-wasm/menu-duplicate.syms > build-wasm/menu-redefine.syms\npython3 ../spike/wasm/rename_llvm_symbols.py \\\n  build-wasm/menu.ll \\\n  build-wasm/menu-redefine.syms \\\n  build-wasm/menu-isolated.ll\n\"$LLVM_AS\" build-wasm/menu-isolated.ll -o build-wasm/obj/menu-isolated.bc\n\n\"$LLVM_NM\" -g --defined-only -j build-wasm/obj/menu-isolated.bc \\\n  | sort -u > build-wasm/menu-isolated.syms\nfor symbol in frames UI_ParseFDF UI_FdfReadFile UI_LoadTexture Theme_String; do\n  if grep -Fxq \"$symbol\" build-wasm/menu-isolated.syms; then\n    echo \"menu isolation left critical symbol unnamespaced: $symbol\" >&2\n    exit 5\n  fi\n  if ! grep -Fxq \"__openrealm_menu_${symbol}\" build-wasm/menu-isolated.syms; then\n    echo \"menu isolation lost critical symbol: $symbol\" >&2\n    exit 6\n  fi\ndone\n\nprintf 'OPENREALM_MENU_ISOLATED_SYMBOLS=%s\\n' \"$(wc -l < build-wasm/menu-duplicate.syms)\"\nprintf 'OPENREALM_MENU_ISOLATION_CRITICAL=PASS\\n'\n\n# Copy engine-owned, redistributable config/font assets only. No Warcraft III\n"""
count = text.count(anchor)
if count != 1:
    raise SystemExit(f"build script: expected compile anchor once, got {count}")
text = text.replace(anchor, replacement, 1)

old_link = """  build-wasm/obj/game.o \\\n  build-wasm/obj/menu.o \\\n  -o build-wasm/openrealm.html \\\n"""
new_link = """  build-wasm/obj/game.o \\\n  build-wasm/obj/menu-isolated.bc \\\n  -o build-wasm/openrealm.html \\\n"""
count = text.count(old_link)
if count != 1:
    raise SystemExit(f"build script: expected menu link anchor once, got {count}")
text = text.replace(old_link, new_link, 1)

path.write_text(text)
print("OpenRealm menu LLVM namespace patch applied")
