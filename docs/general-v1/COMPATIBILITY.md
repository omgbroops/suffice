# Compatibility validation

General v1 passed nine deterministic compatibility groups, using no inference calls:

| Group | Result |
| --- | --- |
| Edits spanning a JavaScript package and a TypeScript package | Passed |
| Root config, hidden CI config and a newly authored test | Passed |
| Project npm tests, TypeScript compiler build and lint | Passed |
| JS and ordinary TS AST discovery | Passed |
| Explicit fallback for non-strippable TypeScript syntax | Passed |
| File traversal and external symlink rejection | Passed |
| Private host file reads from commands and their descendants | Denied as required |
| Writes to read-only runtime outside the repository | Denied as required |
| Command timeout and delayed child-process cleanup | Passed |

The outer execution timeout also returned 124 in approximately 1.6 seconds with no delayed child write. The outer output ceiling stopped a noisy process. Detailed receipts are in `.suffice/compat/runs/`, `.suffice/boundary-validation/` and `reports/general-v1/boundary-validation.json`. Failed setup iterations are preserved alongside the final pass. These are tool/environment checks, not coding intelligence or efficiency measurements.

Both agent entry points passed a separate zero-inference startup preflight. They resolved identical GPT-6.1 Sol/OpenAI model metadata and pricing at low effort. Native stock Pi retained read/bash/edit/write, its stock system prompt and automatic compaction. Suffice retained codemode-only provider exposure and its custom minimal prompt; its registered primitive inventory is also recorded. The provider's actual declared tool schemas are captured during attempts.

The original external-Pi campaign's 391 frozen input hashes and its complete ZIP match their saved originals. The original benchmark-agent SHA256 remains `da6264394c865519eed298f0d73ccd77e02f21b5fbd5d7d5fd446b131e7e2383`; the ZIP SHA256 remains `bc91c95d988470b390b3d39f73992330eb96fb7197f9d408a7c6887ddbdeb3f9`. The previous 28.9% finding is preserved, and applies to the previous configuration/cohort only.

Native Windows isolation probes failed before any model attempt: minimal read access was rejected by the selected elevated backend, and the broader profile returned `helper_unknown_error: setup refresh had errors`. The new execution boundary therefore uses the already installed WSL/Bubblewrap path and a separately installed pinned Linux runtime. No unrestricted fallback is used. This platform difference prevents pooling new results with the earlier Windows pilot. Both arms of the new comparison use the same Linux environment.

Decision: compatibility is sufficient to freeze general v1 and run only the planned historical and live issue pilots. It is not evidence that the new configuration retains a cost advantage. Larger campaigns remain gated on the pilots' environment, grading, accounting and task-quality results.
