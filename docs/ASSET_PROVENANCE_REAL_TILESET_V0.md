# REAL TILESET INTAKE V0 — ASSET PROVENANCE

This experiment replaces programmer-authored house surfaces and selected furniture with externally authored, permissively licensed art. It does **not** use Project Zomboid source code, maps, artwork, UI assets, writing, or other proprietary expression.

## Screaming Brain Studios — isometric floors / walls

Source pages:
- 1000+ Isometric Floor Tiles: https://opengameart.org/content/1000-isometric-floor-tiles
- 1800+ Isometric Wall Tiles: https://opengameart.org/content/1800-isometric-wall-tiles

License: **CC0 / public-domain equivalent** per the OpenGameArt source entries.

Experimental retrieval mirror:
- https://github.com/DeinekoRoman/devoops
- pinned mirror commit: `6dc738b1f6aa0e94115956914fae9d529f63f7b9`

Used in V0:
- grass floor
- wood floor
- tile floor
- stone floor / exterior paving
- brick SE/SW wall tiles
- plaster SE/SW wall tiles

The floor sheets use `#ff00ff` as a transparent-color key. The browser experiment removes that key into alpha before constructing Pixi textures.

## Kenney — Furniture Kit

Source: https://kenney.nl/assets/furniture-kit

License: **CC0 1.0**. The mirrored pack also includes its CC0 license file.

Experimental retrieval mirror:
- https://github.com/RetroDECK/RetroQUEST
- pinned mirror commit: `dfa19a5602a31f64bd890d15279a61f43b127328`

Used in V0:
- kitchen fridge
- kitchen cabinet
- kitchen sink
- round table
- lounge sofa
- single bed
- toilet
- bathtub

## Transport boundary

For this taste-gate branch the browser loads the pinned raw GitHub files directly. That is **not** the production asset-delivery architecture. If the art direction passes, the accepted subset should be vendored or packed locally with provenance retained so builds do not depend on third-party raw URLs.

## Existing local fallback art

The prior local atlas remains available only as a fail-soft fallback and for asset classes not yet replaced in this bounded experiment (for example roof/opening/decor placeholders). Passing this phase does not authorize those fallbacks as final production art.
