# Post-implementation review prototype

Read [DIAGNOSIS.md](DIAGNOSIS.md) first, then [DESIGN.md](DESIGN.md).
The diagnosis and proposed paid experiment are ready for user review.
No paid comparison, model inference, provider setup or dependency installation
was performed during this work. Existing campaigns/results remain frozen.

## Implementation

The only new policy is experimental `efficient-review`: normal Luna High solve,
public checks, one tool-free Sol Low review, and at most one Luna High correction
pass. It uses the shared executor's preparation, codemode/AST tooling, output
recovery, notices and cost ledger. Original Flexible behavior and production CLI
files remain unchanged. Existing efficient/orchestrated policy behavior is retained.

The new strategy is accessible through the existing execution entrypoint. A request
has this shape (example only; running the entrypoint with real authentication would
make paid calls and is not authorized by this document):

```json
{
  "experimental": true,
  "strategy": "efficient-review",
  "workspace": "/absolute/path/to/clean-public-git-repo",
  "runDir": "/absolute/path/outside-the-repo/receipts",
  "prompt": "Original public issue text",
  "maxCostUsd": 1,
  "maxTurns": 100,
  "maxCalls": 240,
  "timeoutMs": 300000,
  "checks": [{"command": ["npm", "test"], "timeoutMs": 60000}]
}
```

The prototype requires a clean initial Git HEAD and rejects unsupported/oversized
review inputs. Its limits are explicit in DESIGN.md; an approval is advisory and
does not certify correctness. The reviewer receives no model-written implementation
summary as a substitute for source evidence. The repair sees the corrections and
public evidence, and can inspect the existing implementation with normal tools.

Receipts include `review-input.json`, `post-review/stage.json`, `review.json`, optional
`review-repair/stage.json`, public check records, and aggregate `worker.json`.
`reviewCalls` counts the review separately from the older advisory stages.
Stage costs sum to aggregate cost, including failures and any response overshoot.

## Local validation

`node --test tests/execution-post-review.test.mjs tests/execution-strategies.test.mjs tests/pipeline-executor.test.mjs tests/execution-orchestrated.test.mjs`
passed **34/34**. The seven new tests cover:

- Review after passing or unavailable checks, actual tracked diff/new-file content, and tool-free reviewer options.
- Exactly one Luna repair with retained effort and all stage costs counted; repeated checks retain their actual status.
- Malformed reviewer JSON and unknown usage stop without funding repair.
- Whole-task budget and reviewer response overshoot preserve spend and stop further stages.
- Dirty initial workspaces stop before paid sessions; oversized changes are not silently omitted.
- Correction path/schema validation and unchanged Flexible defaults.

Full `npm test` reported **164 passing, two failing**. The failures are the same
documented baseline native multi-package path-guard and synthetic reference-patch
exact-match failures. They remain unresolved. The focused suite passed again after
the final request-validation/accounting adjustment. Test sessions use deterministic
fakes with real temporary Git repositories; no model quality claim follows from them.

`python benchmark/diagnose-saved-failures.py` reproduces the offline inventory from
Sonion's saved receipts. Its input is actor-only logs and existing comparison
metadata. These reports must remain outside future actor/reviewer task workspaces.

## Next review decision

Review the diagnosis, six-task selection criteria, source-only support boundary,
shared spending limits and acceptance-per-dollar decision rule. Only after that
review should task selection/preflight/freeze and an explicitly authorized paid
launch proceed. No launch automation or ongoing monitor was created.
