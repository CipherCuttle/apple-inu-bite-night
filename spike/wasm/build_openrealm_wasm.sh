#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$PWD/open-realm}"
cd "$ROOT"

UPSTREAM_SHA="cf12357883950c14abce8d636596952c3fc547bb"
ACTUAL_SHA="$(git rev-parse HEAD)"
if [[ "$ACTUAL_SHA" != "$UPSTREAM_SHA" ]]; then
  echo "wrong upstream revision: expected $UPSTREAM_SHA got $ACTUAL_SHA" >&2
  exit 2
fi

mkdir -p build-wasm build-wasm/obj build/share

# Generate the system-font header with the native host compiler. This is a
# build-time transformation only; the browser runtime remains fully wasm.
gcc -O2 tools/img2sysfont.c -o build-wasm/img2sysfont
build-wasm/img2sysfont renderer/conchars.pcx renderer/conchars_sysfont.h conchars_sysfont_pcx

# Preserve OpenRealm's unity-module boundaries while replacing native shared
# objects with wasm objects that are linked into one browser executable.
python3 - <<'PY'
from pathlib import Path

out = Path('build-wasm')

def sources(*dirs, exclude=()):
    found = []
    for d in dirs:
        for p in Path(d).rglob('*.c'):
            rel = p.as_posix()
            if any(rel.endswith(x) for x in exclude):
                continue
            found.append(rel)
    return sorted(set(found))

def write(name, items, extra=()):
    paths = list(items) + list(extra)
    text = ''.join(f'#include "../{p}"\n' for p in paths)
    (out / f'unity_{name}.c').write_text(text)
    print(name, len(paths), 'sources')

write('shared', sources('shared'))
write('jass', sources('games/warcraft-3/jass'))
write('sheet', [
    'games/warcraft-3/sheet/parser.c',
    'games/warcraft-3/sheet/sheet.c',
])
write('renderer', sources('renderer', 'games/warcraft-3/renderer'), extra=['common/mpq.c'])
write('game', sources('games/warcraft-3/game', 'games/warcraft-3/common', exclude=('world_w3.c', 'routing.c')), extra=['common/mpq.c'])
write('menu', sources('games/warcraft-3/menu', 'games/warcraft-3/common', exclude=('world_w3.c', 'routing.c')), extra=['common/mpq.c'])
write('app', sources('client', 'server', 'common', 'sound', exclude=('stb_vorbis.c',)))
PY

COMMON_FLAGS=(
  -O1
  -Wall
  -Wno-unused-function
  -Wno-unused-variable
  -fno-common
  -I.
  -Ishared
  -Ishared/types
  -Igames/warcraft-3
  -Igames/warcraft-3/common
  -DWC3
  -DUSE_FOGOFWAR
  '-DBZ_GAME="warcraft-3"'
  -DBZ_GL_ES3
  -DBZ_MSAA_SAMPLES=0
)

# Emscripten ports must be enabled while compiling translation units as well as
# during final link; otherwise their sysroot headers (notably SDL2/SDL.h) are
# intentionally unavailable.
PORT_FLAGS=(
  -sUSE_SDL=2
  -sUSE_ZLIB=1
)

compile_unity() {
  local name="$1"; shift
  echo "[wasm:$name]"
  emcc "${COMMON_FLAGS[@]}" "${PORT_FLAGS[@]}" "$@" -c "build-wasm/unity_${name}.c" -o "build-wasm/obj/${name}.o"
}

compile_unity shared
compile_unity jass
compile_unity sheet
compile_unity renderer
compile_unity game -DSTB_FDF_IMPLEMENTATION -DSTB_FDF_GLOBALS
compile_unity menu -DSTB_FDF_IMPLEMENTATION -DSTB_FDF_GLOBALS
compile_unity app

# Copy engine-owned, redistributable config/font assets only. No Warcraft III
# retail archives or proprietary map data are embedded by this spike.
cp -R share/. build/share/
mkdir -p build/share/warcraft-3
cp -R games/warcraft-3/share/. build/share/warcraft-3/

# Gate-5 synthetic scene assets are generated exclusively from OpenRealm's own
# test fixture sources and generators. The pseudo-map has no Blizzard archive.
mkdir -p \
  build/share/warcraft-3/Units \
  build/share/warcraft-3/TestUI/Textures \
  build/share/warcraft-3/TestUI/Models
cp games/warcraft-3/tests/resources-src/Units/UnitBalance.slk \
  build/share/warcraft-3/Units/UnitBalance.slk
cp games/warcraft-3/tests/resources-src/Units/UnitUI.slk \
  build/share/warcraft-3/Units/UnitUI.slk
# Keep the historical lowercase lookup spelling available on a case-sensitive
# Emscripten filesystem as well; both files contain identical source-owned data.
cp games/warcraft-3/tests/resources-src/Units/UnitUI.slk \
  build/share/warcraft-3/Units/unitUI.slk
cat > build/share/warcraft-3/Units/UnitData.slk <<'SLK'
ID;PWXL;N;E
B;X4;Y2;D0
C;X1;Y1;K"unitDataID"
C;X2;K"collision"
C;X3;K"movetp"
C;X4;K"targType"
C;X1;Y2;K"opeo"
C;X2;K"16"
C;X3;K"foot"
C;X4;K"ground"
E
SLK

gcc -O2 tools/blpgen.c -lm -o build-wasm/blpgen
gcc -O2 tools/mdxgen.c -lm -o build-wasm/mdxgen
build-wasm/blpgen checker 64 64 8 \
  build/share/warcraft-3/TestUI/Textures/wasm_smoke_ground.blp
build-wasm/blpgen alpha_ring 64 64 \
  build/share/warcraft-3/TestUI/Textures/wasm_smoke_unit.blp
build-wasm/mdxgen quad_sprite 'TestUI\\Textures\\wasm_smoke_ground.blp' \
  build/share/warcraft-3/TestUI/Models/wasm_smoke_ground.mdx
build-wasm/mdxgen anim_pulse 'TestUI\\Textures\\wasm_smoke_unit.blp' \
  build/share/warcraft-3/TestUI/Models/anim_pulse.mdx
for smoke_asset in \
  build/share/warcraft-3/Units/UnitBalance.slk \
  build/share/warcraft-3/Units/UnitData.slk \
  build/share/warcraft-3/Units/UnitUI.slk \
  build/share/warcraft-3/TestUI/Textures/wasm_smoke_ground.blp \
  build/share/warcraft-3/TestUI/Textures/wasm_smoke_unit.blp \
  build/share/warcraft-3/TestUI/Models/wasm_smoke_ground.mdx \
  build/share/warcraft-3/TestUI/Models/anim_pulse.mdx; do
  test -s "$smoke_asset"
done
printf 'OPENREALM_MAP_UNIT_SMOKE_ASSETS=PASS\n'

cat > build-wasm/shell.html <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OpenRealm WebAssembly Spike</title>
  <style>
    html,body{margin:0;background:#08070b;color:#ddd;font-family:monospace;height:100%}
    #status{position:fixed;z-index:3;left:12px;top:10px;background:#000a;padding:8px 10px}
    canvas{display:block;width:100vw;height:100vh}
  </style>
</head>
<body>
<div id="status">booting OpenRealm wasm…</div>
<canvas id="canvas" oncontextmenu="event.preventDefault()"></canvas>
<script>
  var Module = {
    canvas: document.getElementById('canvas'),
    arguments: ['-data', '/share', '+map', '__wasm_smoke__'],
    print: (...args) => console.log(...args),
    printErr: (...args) => console.error(...args),
    setStatus: (text) => { document.getElementById('status').textContent = text || 'OpenRealm wasm running'; },
    onRuntimeInitialized: () => { document.getElementById('status').textContent = 'OpenRealm wasm runtime initialized'; },
    onAbort: (reason) => { document.getElementById('status').textContent = `OPENREALM_ABORT=${reason}`; }
  };
</script>
{{{ SCRIPT }}}
</body>
</html>
HTML

emcc \
  build-wasm/obj/app.o \
  build-wasm/obj/shared.o \
  build-wasm/obj/jass.o \
  build-wasm/obj/sheet.o \
  build-wasm/obj/renderer.o \
  build-wasm/obj/game.o \
  build-wasm/obj/menu.o \
  -o build-wasm/openrealm.html \
  "${PORT_FLAGS[@]}" \
  -sFULL_ES3=1 \
  -sMIN_WEBGL_VERSION=2 \
  -sMAX_WEBGL_VERSION=2 \
  -sSTACK_SIZE=8388608 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sASSERTIONS=1 \
  -sEXIT_RUNTIME=0 \
  -sENVIRONMENT=web \
  -sFORCE_FILESYSTEM=1 \
  --preload-file build/share@/share \
  --shell-file build-wasm/shell.html \
  -Wl,--allow-multiple-definition

ls -lh build-wasm/openrealm.html build-wasm/openrealm.js build-wasm/openrealm.wasm build-wasm/openrealm.data
printf 'OPENREALM_ENGINE_LINK=PASS\n'
