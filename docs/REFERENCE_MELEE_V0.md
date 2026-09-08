# Bite Night melee reference — v0

## Reference game

The clean-room control/game-feel reference is **Hypersomnia** (TeamHypersomnia), a free/open-source top-down 2D shooter whose public documentation explicitly describes its dynamics as inspired by Hotline Miami.

Reference traits used as design observations only:

- movement independent from cursor aim;
- mouse-directed facing/crosshair;
- LMB wide melee swing;
- RMB narrow/power melee swing;
- fast, readable top-down combat where facing and timing matter.

## License boundary

Hypersomnia is licensed under GNU AGPL-3.0. Bite Night does **not** copy or incorporate Hypersomnia source code or assets. We use public gameplay/control behavior only as a clean-room design reference.

## Rugpull Tycoon lineage we own

The user's `CipherCuttle/rugpull-tycoon` top-down extraction branch already implemented project-owned versions of several useful feel patterns:

- keyboard movement independent from mouse-facing;
- left-click attack queueing;
- directional cone/dot targeting;
- bounded cooldowns;
- short hit-stop;
- directional knockback;
- camera shake;
- instant restart.

Bite Night ports those project-owned interaction patterns into its deterministic Phaser simulation while keeping rendering/effects non-authoritative.
