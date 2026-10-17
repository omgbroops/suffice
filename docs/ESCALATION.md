# Escalation harness (`luna-esc`) and selector-validity checks

Status: offline evidence only. The live arm has NOT been run (no subscription auth in the overnight sandbox).

## Why
Measured in `reports/semver-control-v1.json`: Sol 6/6 at $0.055/run; Luna 2/6 at $0.005; luna-review 6/6 at $0.094.
Norm questioned: "one model per run, or pay Sol to review everything". Alternative: Luna first, and Sol only when Luna
cannot prove its own fix (`escalationNeeded` in `src/real-policy.mjs`: no failing-then-passing reproducer).
Fresh Sol workspace on escalation; both phases' cost is charged; infrastructure errors never escalate.

## Offline replay (`node scripts/compare-policies.mjs`)
Replays recorded runs, no model calls. Cost is a known-cost floor (one luna-repro run has unknown cost).

| policy | pass | mean $ | escalated | gate false accepts |
|---|---|---|---|---|
| sol | 6/6 | 0.0549 | 0 | 0 |
| luna-review | 6/6 | 0.0938 | 0 | 0 |
| luna-repro alone | 2/6 | 0.0041 | 0 | 0 |
| luna-repro -> sol when repro not established | 5/6 | >=0.0372 | 3 | 1 |
| luna -> sol when not "completed" (no-op gate) | 2/6 | 0.0048 | 0 | 4 |

Caveats (refuter-3, accepted): the gate was chosen after seeing this data; n=6 is 3 tasks x 2 repetitions; pooled cheap-family
pass is 0/10, 3/10, 8/10 per task, so the saving is task routing, not proven gate skill; 5/6 vs 6/6 is statistically
indistinguishable. Break-even (own arithmetic): escalation costs less than Sol-only whenever Luna's gate accepts more than
about 7.5% of runs; the real risk is the false-accept rate, which cuts pass rate.

## Selector validity (`node scripts/mutant-matrix.mjs <task>`)
Applies every subset of a task's reference patches, runs visible and acceptance checks.
For lru-flight, ttl-sweep, token-bucket, batch-queue: 16 mutants each, 15 broken, visible tests pass on all 15 broken mutants,
only the full fix passes acceptance. So any best-of-N or escalation gate based on visible tests is a no-op on the hard split
(this is why `luna-bo3` was reverted). Limits: mutants are patch subsets, not model-generated; "broken" is defined by the
acceptance file; batch-queue has 4 subsets that hang to the 15 s timeout rather than failing cleanly.

## Live campaign (when subscription auth exists)
`node scripts/real-experiment.mjs --campaign esc-v1 --arms sol,luna,luna-repro,luna-esc,luna-review --repetitions 3`
Needed n for a 15-point pass-rate difference (95% vs 80%) at 80% power is about 70 per arm (normal approximation, own
calculation); the semver set has only 3 tasks, so a live result at this size is directional, not conclusive.
The catalog runner (`scripts/experiment.mjs`) has no requirement-derived gate, so `luna-esc` is wired into the real runner only.

## Why a test gate and not a Sol reviewer (from `luna-review` phases in semver-control-v1, n=6)
Sol review phase alone costs $0.017-0.048 (mean about $0.036), roughly two thirds of a whole Sol-solo run ($0.055).
The reviewer returned "repair" 6/6, including 3 runs whose Luna patch already passed hidden checks, so the
repair phase ($0.024-0.097) is Sol redoing the work. An LLM verifier that reads the patch therefore cannot be cheaper than
Sol solo here; a verifier must cost far less than about $0.01 (executable checks, not a model read) to leave any saving.
