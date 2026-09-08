#!/usr/bin/env python3
from pathlib import Path

path = Path("client/cl_main.c")
text = path.read_text()
old = '''    mode = CL_VideoMode();
    re.Init(mode.width, mode.height);
    
    S_Init();
    CL_MusicInit();
    CL_MovieInit();

    /* Initialize UI library */
    menu = M_GetAPI((menuImport_t) {
'''
new = '''    mode = CL_VideoMode();
    re.Init(mode.width, mode.height);
#ifdef __EMSCRIPTEN__
    fprintf(stderr, "WASM_INIT_TRACE=renderer-ready\\n");
#endif
    
    S_Init();
#ifdef __EMSCRIPTEN__
    fprintf(stderr, "WASM_INIT_TRACE=sound-returned\\n");
#endif
    CL_MusicInit();
#ifdef __EMSCRIPTEN__
    fprintf(stderr, "WASM_INIT_TRACE=music-returned\\n");
#endif
    CL_MovieInit();
#ifdef __EMSCRIPTEN__
    fprintf(stderr, "WASM_INIT_TRACE=movie-returned\\n");
#endif

    /* Initialize UI library */
#ifdef __EMSCRIPTEN__
    fprintf(stderr, "WASM_INIT_TRACE=before-menu-api\\n");
#endif
    menu = M_GetAPI((menuImport_t) {
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"client/cl_main.c: expected one init sequence, got {count}")
text = text.replace(old, new, 1)
old2 = '''        .PlayMovie = CL_PlayMovie,
    });
    
    menu.Init();

    SZ_Init(&cls.netchan.message, cls.netchan.message_buf, MAX_MSGLEN);
'''
new2 = '''        .PlayMovie = CL_PlayMovie,
    });
#ifdef __EMSCRIPTEN__
    fprintf(stderr, "WASM_INIT_TRACE=menu-api-returned init=%p\\n", (void *)menu.Init);
    fprintf(stderr, "WASM_INIT_TRACE=before-menu-init\\n");
#endif
    
    menu.Init();
#ifdef __EMSCRIPTEN__
    fprintf(stderr, "WASM_INIT_TRACE=menu-init-returned\\n");
#endif

    SZ_Init(&cls.netchan.message, cls.netchan.message_buf, MAX_MSGLEN);
'''
count = text.count(old2)
if count != 1:
    raise SystemExit(f"client/cl_main.c: expected one menu init sequence, got {count}")
path.write_text(text.replace(old2, new2, 1))
print("OpenRealm wasm init tracing applied")
