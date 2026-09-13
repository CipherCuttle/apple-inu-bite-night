# Apple Inu — agent entrypoint

Before planning or changing this repository, inspect the exact Git state, `README.md`, relevant `docs/`, package scripts, CI, and the current open PR/phase stack. Do not assume an older README phase is still current when newer Git authority says otherwise.

Use `PLAN -> CHANGESET -> VERIFY -> VERDICT` and the smallest coherent diff. Preserve the deterministic simulation boundary and do not broaden product scope while executing an active phase unless the current phase authority explicitly permits it.

For remote GitHub work, group related multi-file edits into coherent commits when possible, keep unrelated work unchanged, and record exact commit SHAs plus verification results in the PR.

Run the repository-native lint, typecheck, test, build, determinism, and phase-specific checks that apply to the changed surface. Missing capability is a limitation, not a PASS. Do not weaken existing checks to make a change land.

Follow the bounded completion policy: implement -> test -> one independent hostile review -> fix Critical/High findings -> one targeted re-review only if those fixes were needed -> merge only when authorized -> move forward. Do not create review loops.
