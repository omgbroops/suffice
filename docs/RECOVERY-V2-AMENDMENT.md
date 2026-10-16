# Post-pilot implementation amendment

The v1 pilot and every frozen input remain unchanged. No further model inference is authorized in this session after the shared subscription limit. Separate future versions src/recovery-agent-v2.mjs and scripts/recovery-experiment-v2.mjs have syntax checks only, not live evaluation.

V2 uses the existing providerFailureKind classifier, which recognizes the exact Subscription Sharing usage-limit response. The v1 custom regex missed that response and unnecessarily launched three further immediately rejected calls; all four attempts and unknown totals are retained.

V2 routes custom literal-search reads through readText/scopedPath so optional paths cannot escape the workspace or access hidden/oversized files. The v1 pilot preserved read-only tools plus restricted edits, but its custom search used a direct resolved read. The pilot transcript was inspected for tool paths; no outside-workspace read was observed. Future security boundaries must use the scoped implementation. This corrective change was not silently applied to the frozen v1 experiment.

Test freshness in v1 refers to the latest visible check, with kind explicitly preserved as regression or cases in policy.lastTest. A generated passing check does not certify a checkpoint; checkpoint promotion still requires full visible regressions. Independent final tests always execute regardless of reported freshness.

Additional offline integration tests execute two genuinely failing local checks, restore only owned production files, and require fresh passing revalidation. They demonstrate mechanism behavior, not model recovery or capability improvement.
