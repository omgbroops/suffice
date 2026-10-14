# Reproducing this investigation safely

Requires Node 24.15 or compatible and the pinned package-lock dependencies (`npm ci` in a fresh exported checkout; original worktree uses its existing dependency junction). No authentication is needed for cached audits. Run from the extracted worktree root with relative `.suffice/nemotron` paths preserved.

Read PROTOCOL-v2.md and LIVE-PROTOCOL-scored.md before interpreting scores. Frozen data are intentionally outside git under ignored .suffice/nemotron; reports/evidence-export.json lists sanitized public evidence to include with a review bundle.

Cached offline reproduction (no provider requests):

```
node --test experiments/nemotron/policy.test.mjs experiments/nemotron/vector-validation.test.mjs
node experiments/nemotron/audit-offline.mjs
```

Independent saved-patch reproduction (no model/provider requests; writes separate audit replay workspaces):

```
node experiments/nemotron/audit-live.mjs
```

Both audits write unique timestamped replay reports by default and accept `--out=reports/my-fresh-audit.json`; an existing output path is rejected before work. Original canonical reports remain intact. Live patch reconstruction uses a fresh timestamped replay directory and checks every immutable baseline byte plus patch before/after hashes. It compares the original actor workspace only when present; sanitized exports explicitly mark that comparison unavailable and validate frozen baseline/patch hashes instead. No original actor workspace access is required. Do not run historical acquisition/probe/offline/live driver commands against an existing evidence directory: drivers were single-campaign experimental entrypoints and do not implement safe reexecution/resume. Original durable process receipts/logs show exact commands, campaign names and PIDs. New inference replication requires a new isolated worktree/state directory, preserved frozen inputs, refreshed explicit zero-price availability and the original budgets; it must never overwrite this campaign's receipt files. Cached audits are the default reproducibility path.

Vector-validation.mjs is tested postcampaign boundary hardening, not retroactively used by scored provider-v2. V2 did not persist raw response indices or validate their uniqueness; cached vector/dimension/receipt/packet replay establishes reproducible saved ranks, not proof of unrecorded raw index uniqueness.
