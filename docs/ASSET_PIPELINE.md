# Asset pipeline

The visual target is professional, graphic, splattery, readable, and coherent — not an asset-pack collage.

## Import gate
Every external asset requires:
1. source URL
2. author if attribution applies
3. license identifier
4. original file checksum when practical
5. modification note
6. destination path

## Approved raw-material sources
See `licenses/ASSET_MANIFEST.json`.

## Canonicalization pass
Imported art is not game-ready until it passes:
- shared logical scale
- shared palette / color grading
- consistent outline policy
- consistent top-left lighting convention
- nearest-neighbor rendering
- sprite-sheet timing review

## Gore presentation budget
Borrow the discipline, not the React code, from `rugpull-tycoon`:
- separate loud/major gore from filler/minor gore
- hard caps on simultaneous effects
- deterministic jitter where replay-visible
- no unbounded particle creation
- boss/critical choreography gets the budget; filler yields first

## Render authority
Gameplay simulation emits semantic events (`enemy-hit`, `enemy-killed`). Presentation decides blood, chunks, sound, camera and haptics. Presentation never decides damage or score.
