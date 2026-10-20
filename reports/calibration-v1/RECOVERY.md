# Reviewed provider interruptions

Two completed attempts were reviewed while the next actor was still running.
`interruption-review.json` pins their receipts and the unchanged campaign manifest.

- `kv-store-grpc-v1-refined`: HTTP 503 with
  `subscription_sharing_user_unavailable`, followed by an aborted operation.
  Three request records, four assistant records, and two terminal usage records.
  Known cost floor: $0.01517000. Whole-attempt cost remains unknown.
- `filter-js-from-html-v1-refined`: the response stream ended without a terminal
  response event after approximately 15 minutes. Three request and assistant
  records, but only two terminal usage records. Known cost floor: $0.00978760.
  Whole-attempt cost remains unknown. The receipts do not establish whether the
  provider, proxy, or network closed the stream; no HTTP 503 was recorded here.

Zero usage on an error record does not establish zero incurred cost. Partial
response content is not used to fabricate missing billing data or a completed
patch. Original grades, failed outcomes and unknown full costs remain preserved.
The interruptions do not establish correctness regressions or concurrency causation.

One finite successor supervisor was queued to wait for the existing supervisor
to exit normally, letting its live actor finish. Before resuming untouched jobs
at two-way concurrency it refreshes the report, checks the manifest and reviewed
receipt hashes, rejects partial workspaces, and refuses any newly interrupted or
unknown-cost attempt not covered by this review. It never replaces completed
attempts or changes model policies, prompts, tools, checks, timeouts or budgets.
Existing quota, memory, spending and operational stop conditions remain active.

Recovery guards were checked without inference: a matching review is accepted;
changed receipts, a partial actor workspace, and an unreviewed interruption are
rejected. The production CLI and previous benchmark reports are unchanged.
