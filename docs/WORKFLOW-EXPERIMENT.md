# Architect-first workflow comparison

Protocol prepared October 14, 2026. Main campaign: `yaml-workflow-v1`.

## Question and configurations

Does a strong architect plus bounded cheap implementation improve total cost while preserving independently measured correctness? Separate workflow overhead from worker-model effects:

- **solo:** GPT-6.1 Sol, low effort, navigation and codemode, one session.
- **workflow-sol:** Sol parent plans read-only, code assembles a versioned source packet, fresh Sol worker implements, the same parent resumes for final review/repair.
- **workflow-luna:** Identical workflow; only the worker model changes to GPT-6 Luna.

All models use low effort. The parent prompt does not identify the worker model. No LLM scout, learned routing, response compaction treatment, history pruning, new dependency, container, or new sandbox infrastructure is introduced. Existing Node test-process restrictions remain. TypeScript navigation strips erasable types solely to index syntax; returned source stays original. That adapter is shared across every arm.

## Tasks and scoring

Three new historical nodeca/js-yaml fixes, each at its own pinned pre-fix parent: mapping-boundaries (three production files in reference), folded-tabs (multiple functions in one file), exponent-integers (six tag files). Source is around 5,800 lines, 41 TypeScript production files. Full nonhidden upstream files are included under src/. Main prompts contain behavior, not fixes or reference commits. Historical tasks can be represented in model training; this is not an uncontaminated benchmark.

Three repetitions of each task/configuration = **27 attempts**. Arm order rotates by task and repetition. Every attempt is retained, including failures. Cost comparisons use common groups with complete telemetry; partial usage remains a lower bound. No hidden-test result is disclosed to any actor. Acceptance is evaluated only after every phase is finished. Success requires a completed final phase, all frozen hidden acceptance and visible regression tests passing, and immutable files remaining unchanged. A recovered worker limit is recorded even if parent repair ultimately succeeds. Declared parent-generated checks are reported separately and cannot replace independent acceptance.

Before freezing: original revisions must fail behavioral assertions, upstream repairs must pass; both must pass regression checks. The visible checks cover existing common behavior, not the historical bug reproductions. An existing JSON_SCHEMA empty-string dump problem was found during preflight and excluded from the generic scalar round-trip regression group; it is outside all three tasks. A generated folded-scalar case was corrected to use explicit indentation because its original form was invalid YAML. Both corrections preceded model runs and freeze.

Hidden checks include public event-consumer validation, document boundaries, tab/space line adjacencies, widths/chomping controls, numeric schema families, nested collections, negative zero, and invalid explicitly tagged integers. Model-generated checks have a restricted declarative API and cannot change frozen tests. Parent plan must include at least one assertion failing on the baseline (up to three submissions). Tests run in actual Node processes. The check API uses JSON values, so special values such as negative zero must be covered by independent tests rather than serialized model cases.

The original upstream core test bodies also run unchanged, with only package resolution redirected to source through a Node import hook. Exclude distribution-build tests (no build installed), fast-check fuzzing (dependency not installed), and pathological stress tests. Require all selected tests to pass with the exact baseline test count. This broad regression gate is available through upstream_test in every arm and is included in code-managed checkpoints and final acceptance. This is not the repository's full npm test/build/typecheck suite.

## Workflow details and budgets

The parent selects 1-8 production paths, optional symbols, requirements, implementation steps, invariants, and 1-12 public checks. Code validates the handoff, executes baseline checks, and assembles up to 22,000 source characters (6,000 per symbol excerpt) with hashes and explicit truncation notices. Workers can expand context with navigation/read tools, but may edit only the selected paths. Parent review can repair any original production file if the selected scope was insufficient.

The parent remains the same in-memory session. A fresh worker receives the task and packet, not the parent's full investigation. Code executes public and declared checks after implementation and returns concise results plus a bounded unified diff. The parent gets a single final review/repair phase. There is no repeated cheap retry loop and no second independent reviewer. Tests run again afterward; then the external grader runs hidden acceptance.

Limits: solo 24 generations / 6 minutes; parent planning 10 / 4 minutes; worker 16 / 5 minutes; parent review/repair 12 / 5 minutes. Each phase has a 100-tool-call cap. Workflow has a larger maximum compute allowance than solo; this is a practical architecture comparison, not equal-compute scaling evidence. Record actual phase cost and latency. A timeout/aborted stream makes total cost conservatively unknown. No paid fallback from subscription access.

Campaign stops before the next attempt at $12 known API-equivalent usage, less than 1 GiB disk free, or 350 MiB campaign artifacts; two consecutive infrastructure/provider failures or authorization/quota errors also stop it. A run can cross the between-run cost threshold; finite per-phase limits bound that overshoot. Pauses and cache warmth are recorded limitations. No files outside campaign-owned outputs are removed. Unknown costs prevent a claim of a precise final total.

## Frozen evidence and interpretation

Save hashes and copies of runtime source, prompts, tasks, tests, dependency lock, protocol and runner. Record baseline files, transcripts, patches, phase usage, actual model IDs, final test logs, contract/packet, and after-worker results. Do not tune the main configuration during the campaign. Smoke testing uses a separate invented infrastructure fixture, excluded from main results.

Compare A vs B for the combined planning/packet/check/review workflow; compare B vs C for worker-model substitution. B is not an isolated test of context assembly alone. Correctness and cost-per-attempt are both needed; conditioning only on successful attempts can hide failures. Report fallback/repair frequency and parent cost separately. This sample is exploratory and too small for a broad superiority claim.
