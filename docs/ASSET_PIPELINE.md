# Asset pipeline

The visual target is professional, graphic, splattery, readable, and coherent — not an asset-pack collage.

## Import gate
Every external asset requires:
1. source URL
2. author if attribution applies
3. license identifier
4. exact archive/file checksum before shipping
5. archive/source inspection status
6. modification note
7. destination path

A page-level license claim is not the same thing as byte-level archive verification.

Raw downloads belong in the gitignored `vendor/asset-inbox/`. Run:

```bash
pnpm assets:audit
```

to compute SHA-256 for local intake files. A present but unpinned archive is still blocked from production import.

## Approved raw-material sources
See:
- `licenses/ASSET_MANIFEST.json`
- `docs/ASSET_INTAKE_V1.md`

## Canonicalization pass
Imported art is not game-ready until it passes:
- shared logical scale
- shared palette / color grading
- consistent outline policy
- consistent top-left lighting convention
- nearest-neighbor rendering
- transparent-padding normalization
- detachable-body-part pivot review where applicable
- sprite-sheet timing review

## Identity rule
Free assets are donors, not the product identity.

- Apple Inu visible pixels must remain a custom, unmistakable apple-dog mascot with a mouth-held sword.
- Zombie art must read as undead human anatomy and support visible state changes such as missing limbs/crawler conversion.
- Kenney character sprites are not the final zombie identity; use that pack primarily for environment/props.

## Gore presentation budget
Borrow the discipline, not the React code, from `rugpull-tycoon`:
- separate loud/major gore from filler/minor gore
- hard caps on simultaneous effects
- deterministic jitter where replay-visible
- no unbounded particle creation
- boss/critical choreography gets the budget; filler yields first

## Render authority
Gameplay simulation emits semantic events (`enemy-hit`, `physics-impact`, `prop-hit`). Presentation decides blood, chunks, sound, camera and haptics. Presentation never decides damage or score.

For anatomy, simulation owns whether a body part exists; presentation owns how that state is drawn and how a detached part becomes a visual gib.
