Two independent stateful JavaScript task fixtures are ready for review. Neither has
been attempted by a repair model. The split was assigned before fixture validation:

| Task | Split | Scope | Reference visible/hidden | Defective base visible/hidden |
| --- | --- | --- | --- | --- |
| fastq-resume-window | calibration | tier 1, queue scheduling component | 3/3, 16/16 | 3/3, 2/16 |
| emittery-iterator-lifecycle | reserve | tier 1, event iterator component | 3/3, 18/18 | 3/3, 5/18 |

These are complete pinned upstream repository trees with disclosed injected
production defects and a known reference repair. They are not historical bug
claims or long-task evidence. The full fastq dependency reusify is also pinned and
vendored, with its source archive and license. No package installation, upstream
package scripts, networked tests, credentials, or model inference were used.

Each `task.json` contains the full public contract, requirement IDs, assertion
mapping, source/archive hashes, provenance, split, allowed production path, and
engineering scope assigned before any model attempt. `actor/` is the only tree
to expose to a repair actor; its complete upstream source lives in `src/` and
its authored public tests live in `tests/visible.test.mjs`. Do not expose sibling
`private/`, `reference/`, descriptor provenance, or validation TAP files to actors.
The reserve task remains sealed from repair actors.

Run the offline baseline validation from this worktree:

```
python benchmarks/benchmark-v1/validate-async.py
```

It verifies frozen SHA256 manifests and complete upstream source preservation,
then runs eight native Node suites with a 3 second test timeout and a 15 second
process bound. `async-validation.json` records results; per-suite TAP evidence is
outside the actor trees. Each literal named test has one native assertion mapped
to explicit public requirement IDs, and cases run independently after failures.

Before and after evaluating a candidate copied from an actor tree:

```
python benchmarks/benchmark-v1/check-async-candidate.py <task-directory> <candidate-workspace>
```

This rejects added, removed, symlinked, or edited unauthorized files and checks
evaluator/reference hashes. Only the single declared production file may differ.
Run `node --test --test-reporter=tap --test-timeout=3000 tests/visible.test.mjs`
with the candidate as cwd. Run the task's `private/acceptance.test.mjs` by absolute
path with the same cwd. Alternatively set `SUFFICE_TASK_WORKSPACE` explicitly.
All task descriptor paths are task-relative POSIX paths; `workspaceVisiblePath`
is the explicitly named workspace-relative exception.

The source archives total 869,130 bytes; all artifacts together are below 5 MiB.
Upstream development-dependency suites were preserved as source context but not
executed. Fixture-construction smoke checks exposed two candidate injection
combinations that synchronously stalled a queue; those mutations were revised
before freezing. The final defective bases complete all independent cases and
fail only the expected acceptance suites. This was fixture validation, not a
model repair attempt or a calibration inference result.
