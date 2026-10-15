# Suffice overnight results — October 15, 2026

The external comparison is complete: **10 real historical GitHub issues attempted by frozen Suffice general-v1 and native stock Pi 1.2.0, plus 3 open issues attempted by Suffice.** Both comparison arms used GPT-6.1 Sol low, identical public task specifications, matched environments and independent $10-per-task ceilings. No known estimate approached that ceiling; two Pi full totals remain unknown. Heavy execution ran on Sonion; source changes and evidence are reconciled into this Windows worktree. No upstream PR was submitted.

## The efficiency signal survived

| Historical result | Suffice | Native Pi |
| --- | ---: | ---: |
| Accepted by frozen original/native + private checks | 10/10 | 9/10 |
| Total API-equivalent inference | $0.540464 | At least $0.681877; full cost unknown |
| Cost per frozen-check accepted task | $0.054046 | At least $0.075764 |
| Recorded model replies, including failed replies | 76 | 142 |
| Mean actor execution time | 88.8 seconds | 112.5 seconds |

Suffice used **at least 20.7% less inference in total and 28.7% less per accepted task** on this cohort. Pi had two terminated responses with incomplete usage before successful retries. Their known receipts remain included; missing costs are unknown, not zero. Pi has 7 accepted tasks with completely verified budget accounting and 2 further accepted tasks whose full budget status cannot be certified.

The direction also holds when comparing only the eight completely priced pairs: **13.4% lower total cost**. Among the seven completely priced pairs that both passed, Suffice cost **10.1% less**. Those are sensitivity subsets, not replacements for the full result. Including six operationally invalid initial integration attempts and their corrected reruns, Suffice's historical cost per primary accepted task was at least **23.9% lower**. All failed setup and attempt receipts remain preserved.

Suffice was cheaper on six issues and more expensive on four. Pi's primary coding failure changed when p-queue's public `next` event fires, contrary to existing completion-event expectations. Independent post-hoc review found two further Pi regressions that primary checks missed: reserved-event authorization in Emittery and a reentrant-pause hang in fastq. These are supplementary findings, not silently revised primary scores. A Suffice replay timing failure is also retained; matched unchanged-baseline diagnostics reproduced timing sensitivity, so it was not called an established source regression.

The detailed per-task table, fresh/cached/output cost components, environments, exclusions and limitations are in [RESULTS.md](RESULTS.md); machine-readable values are in [RESULTS.json](RESULTS.json).

## Open-issue engineering delivered reviewable patches

| Issue | Independent review outcome | Total actor inference |
| --- | --- | ---: |
| Workerpool #596 | Scoped fix supported by selected original suites, build/types and worker integration | $0.042186 |
| p-wait-for #37 | Scoped cancellation/timeout fix supported by original tests, types and additional checks | $0.043638 |
| p-debounce #35 | First patch passed primary checks but introduced a cancellation regression; one separately recorded repair passed originals and the independent regression | $0.103624, including repair |

The live total, including repair, was **$0.1894476**. These are reviewed patches for human inspection, not guarantees of full upstream CI or maintainer acceptance. Workerpool's full high-worker-count suite exceeded the unchanged address-space limit; its validated scope is documented. Review receipts and patch paths: [initial review](../../research/field-campaign-v1/audits/live-patch-review.md) and [repair review](../../research/field-campaign-v1/audits/live-repair-review.md).

Two additional candidates were screened before inference: YAML #717 was already being implemented in an open fix PR; Arquero #329 could not be reproduced as reported with available data and had an unresolved schema-policy ambiguity. Neither was counted as a coding failure, and no replacement actors were launched. See [screening records](../../research/field-live-extension-v1).

## Luna is cheaper, but currently much less reliable

A separately versioned model-only calibration used the same Suffice architecture and ten matching source/prompt/grading packages. **Luna low accepted 2/10 for $0.03528592**, against the existing Sol-low reference's 10/10 for $0.540464. All 97 Luna request/reply/usage records reconciled, with no unknown costs or operational actor failures. This is exposed historical calibration, not an unseen holdout or an Astra comparison.

The failure traces often already contained relevant source or preservation tests. Examples include altering manual-redirect compatibility, breaking plain-map dotted keys, missing concurrency-cap preservation and changing a completion event into a start event. More retrieval alone is not established as the remedy. [Luna results](../luna-baseline-v2/RESULTS.md) and [failure taxonomy](../luna-baseline-v2/FAILURE-TAXONOMY.md) retain the individual evidence.

A bounded eight-attempt development pilot then tested low/medium effort and a public-source evidence packet, separately and together:

| Reused issue | Low | Low + evidence | Medium | Medium + evidence |
| --- | --- | --- | --- | --- |
| node-fetch #1386 | Fail | Fail | Fail | Fail |
| Nano Stores #371 | Fail | Pass | Pass | Pass |

All eight attempts completed with complete costs, totaling **$0.02867464**. Evidence was authored from the original public issue/source, without the hidden grader or solution. Its engineering/preparation inference is not included in actor costs. The HTTP packet did not cover manual-mode compatibility, limiting what its negative outcome says about context quality. One observation per cell on reused development tasks cannot establish a general effort effect, context effect or benefit from combining them. [Pilot report](../luna-evidence-v1/REPORT.md).

## Decision

**Keep Sol-low general-v1 as the frozen baseline.** The native Pi comparison supports an efficiency advantage on this cohort; it does not establish universal superiority. Do not replace Sol with Luna low, and do not enable a new context mechanism from this pilot. Medium effort alone rescued the same one development issue as the evidence variants, making fresh Luna-medium validation a smaller candidate next step than adding a harness feature. No further campaign was automatically started.

The dataset spans ten historical issues across six repositories and three initial live attempts plus one separate repair. It includes real asynchronous, stateful and compatibility work, but fixes were mostly localized and median historical execution was about a minute. It does **not** answer the multi-hour/large-monorepo question, isolate individual Suffice mechanisms, or measure parity with Astra, Codex or Prime Agent. One sample per agent/issue, repository overlap, public solution hints, possible training exposure, imperfect graders, incomplete Pi retry usage and limited CI coverage remain material limits.

## Accounting and review bundle

| Preserved inference ledger | Known API-equivalent USD |
| --- | ---: |
| Main campaign: 20 valid historical, 3 initial live and 6 invalid integration attempts | $1.82826840 |
| Separate p-debounce repair | $0.04281080 |
| Ten Luna-low calibrations | $0.03528592 |
| Eight Luna effort/evidence cells | $0.02867464 |
| Remote readiness checks | $0.00951080 |
| **Known total across these ledgers** | **$1.94455056** |

**The complete total remains unknown** because two Pi responses lack full usage. These are API-equivalent benchmark estimates under subscription access, not actual subscription charges, invoice amounts or total project expenditure. Engineering-agent inference, manual preparation, power and infrastructure are excluded. All observed inference remains included even where the environment was invalid or the patch failed.

The exporter verifies all 14 frozen general-v1 input hashes, excludes credentials and installed dependencies, checks credential literals without printing them, and verifies every archived file against its manifest. The final archive path, size and SHA-256 are recorded in [BUNDLE.json](BUNDLE.json). It contains source snapshots, task contracts, private grading/reference material for human review, controls, every attempt and event receipt, patches and independent audits. Private evaluation material was never mounted into actors. Reproduction instructions are in the archive's `BUNDLE-README.md`.

All current work lives in `C:/Users/Mohammed/Documents/GitHub/suffice-experiments/field-campaign-v1`; the original main checkout and earlier benchmark artifacts remain preserved. A final remote process check found no benchmark processes running. SSH became unreachable during packaging after completed results and remote code changes had been copied here. The final archive and these final report wording updates are generated locally from those copies; the two report updates await a reverse sync when Sonion reconnects. No VM or model benchmark was started locally.
