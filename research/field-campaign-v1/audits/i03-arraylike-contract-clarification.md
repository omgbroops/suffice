# i03 array-like compatibility clarification



The non-Iterable array-like assertion is not an unsupported invention: the original public issue expressly identifies preservation of array-like runtime support and lists array-like input among its controls. It is defensible as a narrowly bounded compatibility requirement for this fix. The narrower documented Iterable parameter remains a real ambiguity about the general supported API domain.



This is a new clarification after an outcome-related question, not a replacement blind review. No actor output or patch was inspected for this clarification. The supplied outcome context is recorded in the JSON. No tests or model calls were run.



## Public evidence



The issue body in the task manifest, original-body archive and saved GitHub issue JSON is byte-identical after UTF-8 encoding and matches the original provenance SHA-256: `a6c73417c950693193d4a0d999b9480ac7afddc62cc6c018e06f29a470f681ce`.



- `research/field-campaign-v1/integration/i03/original-issue-body.md:28`: Expected: the iterator error rejects the returned promise, while rejections from tasks already scheduled by `map()` are observed. This need not cancel those tasks or delay the iterator error until they finish.

- `research/field-campaign-v1/integration/i03/original-issue-body.md:34`: A [tested candidate fix](https://github.com/brennanbutler01/p-limit/commit/e442a9887054e32d02386b806b0a59630ebda6d0) records scheduled promises during iteration and observes them with `Promise.allSettled()` in the iteration-error path before immediately rethrowing the original error. It preserves scheduling order, shared-queue behavior, and array-like runtime support. It adds a temporary array of promise references during collection.

- `research/field-campaign-v1/integration/i03/original-issue-body.md:36`: Verification: two strict subprocess regressions fail against unchanged main; all 30 tests pass with the fix on Node 22.20.0 and 24.13.0. Full `pnpm test`, including XO and tsd, passes on Node 24 (one existing TODO warning). Controls cover throwing before any item, mapper errors, interleaved scheduling, array-like input, and immediate rejection with pending work. Node 20 and browsers were not tested locally.

- `.suffice/field-campaign-v1/tasks/i03/base/readme.md:78`: ### limit.map(iterable, mapperFunction)

- `.suffice/field-campaign-v1/tasks/i03/base/readme.md:80`: Process an iterable of inputs with limited concurrency.

- `.suffice/field-campaign-v1/tasks/i03/base/readme.md:84`: Returns a promise equivalent to `Promise.all(Array.from(iterable, (item, index) => limit(mapperFunction, item, index)))`.

- `.suffice/field-campaign-v1/tasks/i03/base/index.d.ts:36`: @param iterable - An iterable containing an argument for the given function.

- `.suffice/field-campaign-v1/tasks/i03/base/index.d.ts:38`: @returns A promise equivalent to `Promise.all(Array.from(iterable, (item, index) => limit(mapperFunction, item, index)))`.

- `.suffice/field-campaign-v1/tasks/i03/base/index.d.ts:41`: iterable: Iterable<Input>,

- `.suffice/field-campaign-v1/tasks/i03/base/index.js:108`: const promises = Array.from(iterable, (value, index) => generator(function_, value, index));

- `research/field-campaign-v1/integration/i03/field-acceptance.mjs:27`: assert.deepEqual(await limit.map({0: 3, 1: 5, length: 2}, (value, index) => value + index), [3, 6]);



## Adjudication



The issue Expected paragraph focuses on iterator failure and already scheduled mapper rejections; array-like behavior is not necessary to repair that core failure.

However the same original public issue says its proposed fix preserves scheduling order, shared-queue behavior, and array-like runtime support, and explicitly lists array-like input among verification controls. This is task-public evidence independent of the hidden check or any actor outcome.

The pre-fix runtime uses Array.from directly, which handles the particular finite numeric-indexed object in line 27. The README and type return documentation explicitly give the Promise.all(Array.from(...)) equivalence, further supporting compatibility, but this alone would be weaker evidence because such an equivalence is normally interpreted over the documented input domain.

The README says iterable and the TypeScript signature is Iterable<Input>; the object in line 27 lacks Symbol.iterator and is outside that declared domain. Candidate-fix preservation language is descriptive rather than an explicit new API declaration. Therefore a general claim that ArrayLike is a formally documented accepted type would overstate the sources.

Considering all public issue text together with existing runtime behavior, the exact two-element compatibility check is defensible for this task. It should be reported separately from the core bug repair. The earlier blind audit is preserved unchanged; this clarification makes its previously unstated input-domain caveat explicit.



The private assertion is at line 27. It tests a plain two-element numeric-indexed object and index mapping; it does not demand an internal data structure or an exact error message.



## Reporting



- Keep frozen primary acceptance and its raw failure unchanged.

- If a patch passes the core iterator/mapper checks but fails only line 27, describe it as core repair with an issue-mentioned array-like compatibility regression, not as failure to fix the unhandled-rejection defect.

- Publish a sensitivity diagnostic excluding only the disputed assertion as a separate result if available; never substitute it silently for primary acceptance or use it to rewrite the grader.

- If using a stricter benchmark policy that accepts only the declared Iterable domain despite issue-mentioned runtime preservation, mark the array-like assertion disputed for contract-sensitivity analysis consistently across all actors. That policy choice cannot establish an additional core capability failure.



The earlier blind report and all primary graders/results remain unchanged. This report is a contract clarification, not a post-hoc change to the score.


## Subsequent evidence supplied by parent

The parent independently verified the live GitHub web/API body against the archived SHA-256 above. The documented `Iterable` domain creates a general API ambiguity; it does not invalidate this task because its public issue explicitly mentions preserving array-like runtime behavior.

The parent also reports that its separate diagnostic omitting only line 27 fails the later immediate iterator-error observation check, while the reference passes and baseline fails the earlier mapper rejection check. Those diagnostic receipts were not independently inspected for this clarification. That reported core-contract failure is separate evidence; line 27 alone should not be presented as explaining the diagnostic outcome.
