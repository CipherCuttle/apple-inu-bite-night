# Identity V0

## Player
Apple Inu is project-owned art derived from the project's established apple-dog palette and silhouette. The visible rig is split into body, head and sword so the head itself drives slash/stab/dash/whirlwind animation and the muzzle visibly covers the sword hilt.

## Zombies
Walker/heavy sprites are canonicalized from SpriteAttack's CC0 FreeArt Topdown Zombies source. Heavy survivors have an authoritative `severedArm` state. A qualifying nonlethal slash/whirlwind clears that arm in simulation, selects a matching missing-arm render texture, and emits the same detached arm as a gib.

## Gore
Only a tiny curated CC0 subset is imported: three Reactorcore meat gibs and two overcrafted blood-trail decals. Existing GoreBudget/pooling remains authoritative for effect count; presentation still cannot change damage or score.

## Reproducibility
Archive SHA-256 values are frozen in `licenses/ASSET_MANIFEST.json`. `scripts/audit-asset-inbox.mjs` can check locally staged source archives. Derived production files have per-file SHA-256 entries under `assets[]`.
