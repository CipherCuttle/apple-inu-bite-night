#!/usr/bin/env python3
from pathlib import Path

path = Path("spike/wasm/build_openrealm_wasm.sh")
text = path.read_text()

anchor = """compile_unity menu -DSTB_FDF_IMPLEMENTATION -DSTB_FDF_GLOBALS\ncompile_unity app\n\n# Copy engine-owned, redistributable config/font assets only. No Warcraft III\n"""
replacement = """compile_unity menu -DSTB_FDF_IMPLEMENTATION -DSTB_FDF_GLOBALS\ncompile_unity app\n\n# Native OpenRealm keeps libgame and libmenu in separate shared-library symbol\n# namespaces. The browser spike links both into one Wasm executable, so preserve\n# that isolation explicitly: rename only global definitions that exist in both\n# module objects on the menu side. Relocations inside menu.o follow the renamed\n# symbol entries, while unique API entry points such as M_GetAPI stay unchanged.\nLLVM_BIN=\"$(cd \"$(dirname \"$(command -v emcc)\")/..\" && pwd)/bin\"\nLLVM_NM=\"$LLVM_BIN/llvm-nm\"\nLLVM_OBJCOPY=\"$LLVM_BIN/llvm-objcopy\"\n\nfor tool in \"$LLVM_NM\" \"$LLVM_OBJCOPY\"; do\n  if [[ ! -x \"$tool\" ]]; then\n    echo \"missing LLVM tool required for Wasm module isolation: $tool\" >&2\n    exit 3\n  fi\ndone\n\n\"$LLVM_NM\" -g --defined-only -j build-wasm/obj/game.o | sort -u > build-wasm/game-defined.syms\n\"$LLVM_NM\" -g --defined-only -j build-wasm/obj/menu.o | sort -u > build-wasm/menu-defined.syms\ncomm -12 build-wasm/game-defined.syms build-wasm/menu-defined.syms > build-wasm/menu-duplicate.syms\n\n# These symbols are the minimum evidence that the collision which broke menu\n# boot is actually present in the pinned upstream objects. Fail closed if the\n# upstream layout changes instead of silently applying a meaningless rewrite.\nfor symbol in frames UI_ParseFDF UI_FdfReadFile UI_LoadTexture Theme_String; do\n  if ! grep -Fxq \"$symbol\" build-wasm/menu-duplicate.syms; then\n    echo \"expected game/menu duplicate missing: $symbol\" >&2\n    exit 4\n  fi\ndone\n\nawk '{ print $1, \"__openrealm_menu_\" $1 }' build-wasm/menu-duplicate.syms > build-wasm/menu-redefine.syms\n\"$LLVM_OBJCOPY\" --redefine-syms=build-wasm/menu-redefine.syms \\\n  build-wasm/obj/menu.o build-wasm/obj/menu-isolated.o\n\nprintf 'OPENREALM_MENU_ISOLATED_SYMBOLS=%s\\n' \"$(wc -l < build-wasm/menu-duplicate.syms)\"\nprintf 'OPENREALM_MENU_ISOLATION_CRITICAL=PASS\\n'\n\n# Copy engine-owned, redistributable config/font assets only. No Warcraft III\n"""
count = text.count(anchor)
if count != 1:
    raise SystemExit(f"build script: expected compile anchor once, got {count}")
text = text.replace(anchor, replacement, 1)

old_link = """  build-wasm/obj/game.o \\\n  build-wasm/obj/menu.o \\\n  -o build-wasm/openrealm.html \\\n"""
new_link = """  build-wasm/obj/game.o \\\n  build-wasm/obj/menu-isolated.o \\\n  -o build-wasm/openrealm.html \\\n"""
count = text.count(old_link)
if count != 1:
    raise SystemExit(f"build script: expected menu link anchor once, got {count}")
text = text.replace(old_link, new_link, 1)

path.write_text(text)
print("OpenRealm menu object isolation build patch applied")
