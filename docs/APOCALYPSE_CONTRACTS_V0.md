# APOCALYPSE CONTRACTS V0

## Objective

Prove the smallest version of a blockchain-enabled game contract where:

1. a sponsor locks real value against explicit game terms;
2. one runner accepts the job;
3. the runner submits a deterministic replay;
4. an independent verifier reruns the game locally;
5. only a verified receipt can authorize payout;
6. unresolved escrow can be refunded after the deadline.

This experiment deliberately does **not** put gameplay on-chain.

## Current playable objective

V0 uses the existing deterministic combat simulator and supports a `survive` contract:

- fixed simulation seed;
- minimum survival ticks;
- maximum replay length;
- optional minimum kills;
- atomic reward amount.

The client records the exact `InputState[]`. `verifyReplay()` constructs a fresh `GameState`, reruns those inputs, recomputes the final simulation hash, and refuses a receipt if the runner, seed, objective window, kill requirement, or result hash does not match.

The first extraction contract is intentionally deferred until the survival kernel has authoritative inventory/extraction state. We will not fake an extraction proof in metadata.

## Settlement contract

`contracts/ApocalypseEscrow.sol` is a minimal EVM escrow:

`OPEN -> ACCEPTED -> PAID`

or after the deadline:

`OPEN/ACCEPTED -> REFUNDED`

The sponsor cannot accept their own job. A runner cannot replace another accepted runner. Only the configured verifier can settle success. Payout uses checks-effects-interactions and the reward is zeroed before the external transfer.

## Frozen boundaries

- Movement, combat, enemies, RNG and fixed-tick simulation remain off-chain.
- The blockchain never decides whether a sword hit a zombie.
- Rapier/presentation physics are not proof authority.
- V0 has no token, NFT, pay-to-win item or wallet interaction inside combat.
- V0 does not claim decentralized proof verification.

## Explicit trust boundary

The escrow is trust-minimized, but **V0 still trusts one verifier address** to attest that an independently replayed run passed.

That is intentional. The experiment answers whether funded player-created contracts are fun before spending time on zk proofs, optimistic challenges, verifier quorums, TEEs, or other attestation machinery.

A future verifier design must reduce this trust boundary before valuable public contracts are treated as production-safe.

## Verification

Game/replay gate:

```sh
pnpm typecheck
pnpm vitest run tests/apocalypse-contracts.test.ts tests/determinism.test.ts
```

Escrow gate:

```sh
forge test -vvv
```

GitHub Actions runs both gates independently on the experiment branch.

## Next experiment if V0 passes

Add one in-game contract board and one end-to-end flow:

`POST CONTRACT -> ACCEPT -> PLAY -> VERIFY -> SETTLE`

Use local/testnet value only. The next objective should be an authoritative survival-kernel event such as `extract item X`, not a client-supplied claim.
