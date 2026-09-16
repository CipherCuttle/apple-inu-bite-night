# GAME NORTH STAR — BEAN

## Product sentence

A tiny, stupid-looking Bean with a weapon far too dangerous for him survives violent top-down fights in a broken old-internet version of the Ink universe.

## Human taste gate

The game is not allowed to become bigger until the current core loop is fun.

Primary question after a death:

> Do you immediately want to press R?

If not, progression/content/features are not the answer yet.

## Core verbs

- MOVE
- AIM
- DODGE
- SLASH
- SPECIAL

Everything else must earn its existence by making those verbs more readable, expressive or satisfying.

## Feel target

- immediate rather than floaty;
- violent rather than noisy;
- funny because Bean is visually pathetic relative to the damage he causes;
- easy to read in seconds;
- enough timing/positioning depth to improve through play;
- death should create "one more run", not relief.

## Visual north star

Canonical reference supplied by the owner on 2026-09-17: Bean presented as intentionally cheap-web / Y2K / broken-internet character art.

Preserve:

- warm yellow/orange bean body;
- thick near-black outline;
- tiny dot eyes and tiny curved mouth;
- blue-and-white cap;
- oversized white T-shirt with blue `BEAN` lettering;
- blue lower-body accents and chunky white footwear;
- slightly awkward, low-resolution/pixel-era proportions;
- Windows-98/XP-era UI, broken-page, giant-cursor, compressed-image and old-web texture when environmental/UI references are used;
- humor from sincerity + low-budget web aesthetics, not meme text spam.

Avoid:

- glossy 3D mascot rendering;
- generic mobile-game polish;
- neon cyberpunk card soup;
- excessive gradients/glows;
- smooth corporate vector art;
- modern SaaS UI language;
- AI-detail overload that destroys the primitive silhouette;
- automatically "upgrading" Bean into a heroic/cool character.

## Gameplay invariants

The resurrected pre-HLW deterministic fighter is the authority until an explicit experiment changes one variable family.

Do not silently change:

- damage;
- attack geometry;
- stamina costs;
- dodge invulnerability;
- enemy behavior;
- spawn logic;
- scoring;
- RNG;
- fixed-tick behavior;
- deterministic replay behavior.

## Development rule

Optimize for **increase in fun per minute of human attention**, not features per commit.

One taste problem -> one hypothesis family -> one playable experiment -> one human verdict.

Never respond to "this feels bad" by changing five unrelated systems at once.

## Explicit no-go

- no tower defense / Hero Line Wars drift;
- no idle loop;
- no crafting because "games have crafting";
- no progression system used to hide weak combat;
- no giant roadmap before the core loop survives repeated human playtests;
- no review loops once correctness and frozen invariants are established.
