# PZ SURVIVAL V0

## Objective

Pivot the playable from a short arena bounty into a small persistent zombie-survival neighborhood inspired by the *mechanical structure* of games such as Project Zomboid, without copying proprietary source code, maps, artwork, UI assets, writing, names, or other protected expression.

## V0 slice

The slice contains one original suburban block:

- two houses;
- a convenience store;
- roads, yards, fencing, parked cars and persistent interiors;
- 42 deterministic zombies;
- doors and smashable windows;
- searchable fridges, cupboards, dressers, medicine cabinets, shelves and crates;
- inventory weight plus a backpack capacity upgrade;
- food, water, bandages and painkillers;
- hunger, thirst, fatigue, pain, bleeding and health;
- zombie sight plus sound investigation;
- quiet walking, louder sprinting, melee noise and very loud broken glass;
- persistent corpses;
- accelerated day/night visibility;
- browser-local save/load of world state.

## Authority

`SurvivalState` is a pure TypeScript deterministic simulation. Pixi only presents it. The previous Apocalypse V3 combat/FX experiment remains preserved on its own branch and is not the world authority here.

The blockchain escrow/contracts remain available below this branch ancestry but are deliberately not surfaced in the V0 survival UI. Future contracts should refer to meaningful persistent-world outcomes (recover a bag, rescue a survivor, extract medicine), not arcade score chores.

## Controls

- WASD — move
- Shift — sprint (more noise / faster needs)
- E — open/close door or search adjacent container
- F — smash adjacent window (very loud)
- Space — knife attack in facing direction
- B — bandage if bleeding and a bandage is carried
- Mouse wheel — camera zoom
- Save / Load — local persistence

## Acceptance gate

PASS only if:

1. same seed + input sequence is deterministic;
2. closed doors/windows block occupancy and their state changes matter;
3. loud noise causes zombie investigation;
4. inventory capacity constrains looting and a backpack expands it;
5. bleeding causes continuing harm and bandaging stops it;
6. save/load reproduces the same simulation hash;
7. the browser build boots and captures the neighborhood;
8. legacy deterministic combat and escrow tests stay green.

No merge authority is implied by this phase.
