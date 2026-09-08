# Identity V0

## Player
Apple Inu is project-owned art derived from the project's established apple-dog palette and silhouette. The visible rig is split into body, head and sword so the head itself drives slash/stab/dash/whirlwind animation and the muzzle visibly covers the sword hilt.

## Zombies
Walker/heavy sprites are canonicalized from SpriteAttack's CC0 FreeArt Topdown Zombies source. Heavy survivors have an authoritative `severedArm` state. A qualifying nonlethal slash/whirlwind clears that arm in simulation, selects a matching missing-arm render texture, and emits the same detached arm as a gib.

## Gore
Only a tiny curated CC0 subset is imported: three Reactorcore meat gibs and two overcrafted blood-trail decals. Existing GoreBudget/pooling remains authoritative for effect count; presentation still cannot change damage or score.

## Reproducibility
Archive SHA-256 values are frozen in `licenses/ASSET_MANIFEST.json`. `scripts/audit-asset-inbox.mjs` can check locally staged source archives. Derived production files have per-file SHA-256 entries under `assets[]`.

## Verification receipt
Identity migration source commit: `21a7c3ebf2b5c2d61dd673d4d5cec0155a7aaf19`.

The import migration verified the exact archive hashes, generated the canonical subset, then passed frozen install, lint, TypeScript, the full Vitest suite, production build, and the determinism regression before committing. This documentation commit intentionally triggers the normal repository CI and preview publishers against the resulting runtime.

## Player Identity V1 — white Apple Inu + side-bite sword

The visible player is rendered as a white/off-white dog with cool-gray shadowing, four readable paws, tail, and an Apple-product-like bitten-apple-shaped white head with green leaf/stem. The sword is no longer held straight forward: its idle/rest transform is approximately 76° off the facing axis and the hilt is layered between distinct upper/lower jaw shapes so it reads as physically bitten from the side.

The normal slash keeps the sword clamped at that side-bite angle while the entire head rig sweeps through a broad arc. Stab/dash may temporarily angle the blade toward travel for readability, then return to the side-bite rest transform. Combat timing, hit geometry, damage, enemy density and deterministic physics are unchanged in this pass.
