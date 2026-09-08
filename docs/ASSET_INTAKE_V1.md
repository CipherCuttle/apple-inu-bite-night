# Asset Intake V1 — Identity Pass

Status: **SOURCE VETTING COMPLETE / BINARY IMPORT NOT YET AUTHORIZED**

This document freezes the first external-art intake for Apple Inu: Bite Night. The current gameplay has passed the first responsiveness/physics feel gates, but the visual identity still reads as programmer art. The next pass must improve **Apple Inu identity**, **zombie anatomy**, and **dismemberment readability** without turning the repository into an asset-pack collage.

## Intake rule

A source page saying “CC0” is necessary but not sufficient to ship its files.

A third-party binary may enter `public/assets/` only after:

1. source page and author are recorded;
2. license identifier is recorded;
3. exact downloaded bytes are hashed with SHA-256;
4. archive contents are inspected for unexpected executables/scripts;
5. only the required files are selected;
6. selected art passes the Bite Night canonicalization rules;
7. each shipped file is recorded in `licenses/ASSET_MANIFEST.json -> assets[]`.

Raw archives go in `vendor/asset-inbox/`, which is intentionally gitignored.

Run:

```bash
pnpm assets:audit
```

to hash anything placed in the inbox. An archive with no pinned SHA in the manifest is **not cleared to ship** merely because the audit prints a hash; the hash must first be reviewed and written back into the manifest.

## Verification result

### P0 — first import candidates

#### SpriteAttack — FreeArt Topdown Zombies
Source: https://opengameart.org/content/freeart-topdown-zombies  
License: CC0-1.0.

Publisher page explicitly states that the archive contains:

- 3 top-down zombies;
- SVG files;
- exploded body parts;
- animation samples for 2 zombies.

**Use:** primary zombie anatomy and body-part donor.

**Do not:** drop the untouched sprites directly into the game and call the identity pass complete.

Target:

```text
public/assets/enemies/zombies/
  base/
  parts/
    head/
    arm/
    leg/
    torso/
```

#### SpriteAttack — Topdown Soldier
Source: https://opengameart.org/content/topdown-soldier  
License: CC0-1.0.

Publisher page describes SVG/PDF vector files from a top-down human construction tutorial.

**Use:** human proportion/pivot donor for modular zombie rigs.

Target raw design source only:

```text
art/source/anatomy/
```

#### Reactorcore — Gore Blood Gibs Meat Chunks
Source: https://opengameart.org/content/gore-blood-gibs-meat-chunks  
License: CC0-1.0.

Publisher page explicitly describes meat chunks, bones, organs, blood/gib effects and recommends bounded particle usage.

**Use:** curated high-value gibs only. Keep the existing `GoreBudget` architecture.

Target:

```text
public/assets/gore/gibs/
```

#### overcrafted — Bloodsplatter and Bloodsplash Animation
Source: https://opengameart.org/content/bloodsplatter-and-bloodsplash-animation  
License: CC0-1.0.

Publisher page states that it contains a bloodsplash spritesheet, single frames, bloodsplatter animation and GIMP source.

**Use:** one normalized animated splash family, not every raw variant.

Target:

```text
public/assets/gore/splashes/
```

#### Kenney — Top-down Shooter
Source: https://kenney.nl/assets/top-down-shooter  
License: CC0-1.0.

Kenney lists 580 files and tags the pack for top-down, furniture and zombies. A secondary pinned CC0 mirror (`Tiddybub/2d-assets` commit `e0cbe0d995554a490d4c182fe9beb8769ffbb606`) records 601 extracted files and the original Kenney source.

**Use:** world/prop donor only:

- doors;
- tables/chairs;
- bins;
- furniture;
- urban floor/wall fragments;
- breakable clutter.

**Do not:** use Kenney zombie characters as final Bite Night zombie identity.

Target:

```text
public/assets/arena/props/
public/assets/arena/tiles/
```

### P1 — reference/motion donors

These are useful, but they should not define the shipped visual identity before archive byte verification.

#### Shepardskin — Dog Sprites
Source: https://opengameart.org/content/dog-sprites  
License: CC0-1.0.

Use for dog locomotion/secondary-motion timing only.

Final Apple Inu must remain custom and unmistakable:

- apple-red silhouette;
- leaf + stem;
- readable muzzle/eyes/ears;
- dog paws/tail;
- sword visibly clenched in the mouth;
- head/body participating in attacks.

#### RGS_Dev — Free CC0 Modular Animated Vector Characters
Source: https://rgsdev.itch.io/free-cc0-modular-animated-vector-characters-2d  
License: CC0-1.0.

The page states separated animated body parts, idle/walk/roll/jump/hit/death animations and no generative AI.

The free itch archive is session-gated, so its bytes were **not** independently fetched in this audit.

Use now as a modular-rig architecture reference. Do not ship its pixels until the local archive is hashed.

#### Hormelz — Free 8-Directional Melee Character
Source: https://hormelz.itch.io/8-directional-melee-character  
License: CC0-1.0.

Use for attack timing, readable 8-direction melee poses, hit/death cadence and recovery timing.

This is a **motion study**, not a zombie/player skin.

### P2 — optional

RGS_Dev’s CC0 melee weapon generator is approved for sword silhouette ideation, but a custom Apple Inu sword is preferred.

Game-icons.net is deferred because CC-BY attribution adds bookkeeping and upgrade icons are not part of this identity pass.

## First import budget

The first actual art PR should stay small:

```text
Zombie anatomy:
  1 walker torso
  1 heavy torso
  2 heads
  2 arm variants
  2 leg variants
  1 crawler torso/state

Gore:
  <= 8 curated gib sprites
  1 animated blood splash sheet
  <= 4 floor splats

World:
  <= 10 breakable prop sprites

Apple Inu:
  custom visible sprite/rig
  dog donor material used only for motion study
```

Do **not** import hundreds of pack files merely because the license permits it.

## Canonicalization contract

Every selected asset must pass:

- one shared world scale;
- one outline policy;
- one top-left lighting convention;
- one palette/hue treatment;
- nearest-neighbor rendering where pixel art is used;
- transparent padding trimmed consistently;
- pivots defined for detachable anatomy;
- animation timing normalized to the game’s fixed-tick presentation;
- no source watermark/signature;
- no hidden dependency on source-pack naming/layout.

### Initial logical scale

Target these as starting points, then tune by playtest:

```text
Apple Inu          48–64 px visual footprint
walker zombie      44–56 px
heavy zombie       56–72 px
crawler             36–48 px
severed limb        10–24 px
head gib            12–20 px
```

## Anatomy contract

The first modular zombie renderer should expose:

```text
HEAD
TORSO
L_ARM
R_ARM
L_LEG
R_LEG
```

Simulation owns whether a part exists.

Presentation owns the sprite, blood socket, flying limb and animation.

Desired consequences:

```text
arm severed
→ arm removed from body
→ limb becomes presentation gib
→ future attack behavior may later degrade

leg severed
→ leg removed
→ locomotion degrades
→ crawler conversion becomes possible

decapitation
→ head removed
→ immediate kill

torso split
→ kill
→ high-budget gore event
```

Do not spawn a detached limb while leaving the same visible limb attached to the zombie.

## Apple Inu acceptance gate

A frozen frame with HUD hidden must let a new viewer answer all three correctly:

1. “That is a dog.”
2. “That is Apple Inu / an apple-dog mascot.”
3. “The dog is holding and moving the sword with its mouth.”

If any answer is unclear, the player-art pass fails regardless of animation polish.

## Zombie acceptance gate

A frozen frame must make these readable without UI:

- living zombie;
- heavy zombie;
- zombie missing an arm;
- zombie missing a leg / crawler;
- decapitated body.

If those reads depend on blood particles alone, the anatomy pass fails.

## Import order

1. locally obtain P0 archives;
2. place them in `vendor/asset-inbox/`;
3. run `pnpm assets:audit`;
4. record reviewed SHA-256 values in the manifest;
5. inspect/extract outside `public/assets`;
6. select only the first-import budget;
7. canonicalize art;
8. record each shipped derived file under `assets[]`;
9. only then replace programmer-art renderers.

## Current environment limitation

The source pages and direct archive URLs were verified during this audit, but this ChatGPT execution environment cannot fetch the non-HTML OGA/itch archive bytes directly. That limitation is why the manifest explicitly distinguishes `PAGE_VERIFIED` from `ARCHIVE_HASH_VERIFIED`.

No claim is made that an un-hashed archive has been byte-verified.
