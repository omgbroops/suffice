# V4 results

Rows: 72. Pass rates use Wilson 95% intervals. cost/final pass = total cost / final passes. cost/first-attempt pass = first-round cost of all tasks / first-attempt passes. Contaminated sets are public, contaminated.

## By benchmark

| group | n | first-attempt pass (Wilson 95%) | final pass (Wilson 95%) | cost/task | cost/final pass | cost/first-attempt pass | escalation | non-success | cost unknown |
|---|---|---|---|---|---|---|---|---|---|
| polyglot (public, contaminated) | 72 | 46/72 63.9% [52.4%, 74.0%] | 65/72 90.3% [81.3%, 95.2%] | $0.0461 | $0.0511 | $0.0221 | 8.3% | 4 (run_timeout: 4) | 0 |

## By difficulty

| group | n | first-attempt pass (Wilson 95%) | final pass (Wilson 95%) | cost/task | cost/final pass | cost/first-attempt pass | escalation | non-success | cost unknown |
|---|---|---|---|---|---|---|---|---|---|
| easy | 30 | 28/30 93.3% [78.7%, 98.2%] | 29/30 96.7% [83.3%, 99.4%] | $0.0133 | $0.0138 | $0.0141 | 0.0% | 1 (run_timeout: 1) | 0 |
| hard | 12 | 4/12 33.3% [13.8%, 60.9%] | 11/12 91.7% [64.6%, 98.5%] | $0.0652 | $0.0711 | $0.0387 | 8.3% | 1 (run_timeout: 1) | 0 |
| medium | 30 | 14/30 46.7% [30.2%, 63.9%] | 25/30 83.3% [66.4%, 92.7%] | $0.0713 | $0.0856 | $0.0334 | 16.7% | 2 (run_timeout: 2) | 0 |

## By arm

| group | n | first-attempt pass (Wilson 95%) | final pass (Wilson 95%) | cost/task | cost/final pass | cost/first-attempt pass | escalation | non-success | cost unknown |
|---|---|---|---|---|---|---|---|---|---|
| single:claude-sonnet-5-5 | 36 | 27/36 75.0% [58.9%, 86.2%] | 34/36 94.4% [81.9%, 98.5%] | $0.0730 | $0.0772 | $0.0339 | 0.0% | 0 | 0 |
| v4 | 36 | 19/36 52.8% [37.0%, 68.0%] | 31/36 86.1% [71.3%, 93.9%] | $0.0193 | $0.0224 | $0.0053 | 16.7% | 4 (run_timeout: 4) | 0 |

