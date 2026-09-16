# PROMPT-TO-PLAYABLE V1

## Goal

Make the owner operate as creative director/playtester while the implementation agent owns repo mechanics, experiments, verification and receipts.

The owner should be able to say things like:

> slash feels mushy

> make dodge more committed

> Bean should look more broken-internet and less polished

The agent converts that into a bounded experiment instead of asking the owner to specify code.

## Loop

`PROMPT -> HYPOTHESIS -> SMALLEST DIFF -> VERIFY -> PLAYABLE ARTIFACT -> HUMAN VERDICT -> KEEP/REVERT/SYNTHESIZE`

## Agent contract

For each taste prompt:

1. State the likely causal family being tested.
2. Freeze unrelated gameplay variables.
3. Prefer one experiment branch or one clearly isolated commit.
4. Run lint, typecheck, tests, build and determinism.
5. Boot the built browser game and capture a screenshot artifact.
6. Report exactly what changed and what was intentionally preserved.
7. Ask the owner for a primitive taste verdict, not an engineering diagnosis.

## Human verdict vocabulary

The owner may answer naturally. These terse forms are preferred when convenient:

- `KEEP` — clearly better;
- `REVERT` — worse;
- `MIX A/B` — combine named qualities from variants;
- `SAME` — no meaningful improvement;
- free text such as `dash sick, slash still shit` is fully valid.

The agent owns translating that feedback into the next hypothesis.

## Experiment discipline

A taste experiment should normally change one causal family:

- timing;
- impact feedback;
- enemy reaction;
- movement;
- camera;
- audio;
- presentation/art;
- encounter composition.

Changing multiple families is allowed only when the experiment explicitly tests a coherent gestalt and the owner is told that causal attribution will be weaker.

## Evidence hierarchy

1. deterministic/unit correctness proves the build is mechanically valid;
2. browser boot proves the artifact runs;
3. screenshots/video prove presentation did not catastrophically regress;
4. human play proves whether the change is actually desirable.

Automated checks must never be described as proof that a mechanic is fun.

## Closure rule

Once an experiment is mechanically green and the owner gives a clear taste verdict, close it. Do not create recursive review loops for medium/low polish findings.

## Current V1 automation

`.github/workflows/bean-playtest.yml` performs:

- frozen install;
- lint;
- typecheck;
- full tests;
- production build;
- determinism regression;
- local serving of `dist`;
- headless Chromium boot screenshot;
- upload of the screenshot + tested `dist` as a workflow artifact.

V2 may add scripted controller/mouse scenarios and short video capture after V1 proves useful.
