# Visual Recovery V1

The imported full-city experiment was rejected by human playtest because it created unreadable visual density and deterministic enemy pile-ups against building rectangles.

This recovery keeps the successful pieces from that pass: fixed-tick buffering for SPACE/E/Q/Shift release and the once-per-run Last Chance rescue.

It removes the imported city tilemap and all building collision geometry. The arena is open again, with sparse street dressing only; authoritative collision remains limited to the existing breakable props.

Apple Inu now uses a dedicated small SVG bitten-apple head asset instead of a procedural pile of Phaser shapes. The white dog body is reduced in screen size while the sword remains side-bitten.

Gore density and persistence are reduced so limbs remain readable without covering the arena.
