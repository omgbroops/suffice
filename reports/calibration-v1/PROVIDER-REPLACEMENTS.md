# User-authorized provider-interruption replacements

The user requested one new attempt for each of the two interrupted refined-V1
runs and removal of those originals' failed costs from the main comparison.
`replacement-plan.json` was fixed before either new outcome. It names only
`kv-store-grpc / v1-refined` and `filter-js-from-html / v1-refined`, pins the
original receipts, manifest and runner, and authorizes one fresh attempt each.
The comparison retains 32 slots; at most 34 actor attempts are now authorized.

The main comparison excludes the original outcomes, costs and latency. Each new
attempt fills its slot regardless of passing, rejection, timeout or interruption.
No original is substituted back and no repeat-until-pass policy is used. Other
coding failures and ungraded results remain in the comparison. The former
comparison snapshot is preserved in `before-provider-replacements/`.

The two excluded originals have a combined recorded cost floor of $0.02495760.
Their full costs remain unknown because terminal provider usage was not received.
These amounts remain in separate all-campaign accounting and their receipts are
unchanged. Excluding usage from a comparison does not undo actual consumed usage.

The gRPC interruption explicitly recorded HTTP 503 with
`subscription_sharing_user_unavailable`. The HTML interruption recorded a stream
ending without a terminal response event, with no HTTP 503 recorded. Its underlying
provider, proxy or network cause is unestablished. Neither proves a concurrency
cause. No missing provider usage is fabricated as zero.

The finite replacement supervisor waits for the original controller to exit and
requires its campaign-complete marker before launching inference. Replacements
then run sequentially in fresh environments using the same frozen source,
models/effort, prompts, tools, checks and allowances. No hidden grader feedback
reaches the actors. Existing quota (>40%), memory and total-spend admission guards
are retained. An interruption in the replacement batch stops its remaining work
for review; no automatic additional replacement is authorized.

No-inference validation passed frozen-input/original-receipt hashes and the runner
pin. Three report-accounting tests cover excluded costs, pending replacements,
failed replacement selection, and the provider-replacement receipt directory.
