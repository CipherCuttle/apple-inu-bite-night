# Combat Reward V0

## Intent
Reward aggressive, readable cutting rather than restoring horde spam. Active population is frozen at 48.

## Chain / multiplier
- Kill window: 150 fixed ticks (~2.5s).
- 0–3 chain: ×1 score.
- 4–7: ×2 score + 1.12× cut speed.
- 8–11: ×3 score + 1.25× cut speed.
- 12+: ×4 score + 1.35× cut speed.
- Every 8 consecutive kills triggers a 36-tick world freeze. Player input/attacks continue while enemies stop advancing.

## Powerups
Every sixth kill deterministically drops one powerup, with type selected from the run RNG:
- `frenzy`: 6 seconds, additional 1.45× attack-speed multiplier.
- `freeze`: 90-tick time freeze.
- `apple-juice`: heal 1 HP up to max.

Drops are authoritative simulation state with pickup radius and TTL. Presentation cannot invent pickups or effects.

## Apple Inu head silhouette
The head is silhouette-first: two top lobes, a hard top cleft, tapered bottom, oversized three-step side bite, stem and leaf. Jaw/sword layers remain inside that silhouette so the head should read as a bitten apple before it reads as a dog face. The side-bite sword pose is preserved.
