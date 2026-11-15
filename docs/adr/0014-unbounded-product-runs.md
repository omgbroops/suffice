# Product runs have no default task budget

Normal CLI and desktop runs have no Suffice-imposed wall-clock, estimated-cost, response-count, or tool-call-count cap. The inherited 600-second, $10, 60-response and 240-tool limits are removed from product defaults.

Explicit CLI `--timeout` and `--max-cost` remain available for bounded jobs and reject invalid values. Manual cancellation, provider errors, receipt-write errors, and per-command shell timeouts remain. Frozen experiment runners keep their own independent budgets; historical experiments are unchanged.
