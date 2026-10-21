# V4 SWE-bench Pro provider: gold check

Provider: `src/v4-swebpro.mjs` (`prepWorkspace`, `runAcceptance`). Gold check: `scripts/v4-swebpro-gold.mjs <instance_id>`.
Source of truth: `scaleapi/SWE-bench_Pro-os` `swe_bench_pro_eval.py` (`create_entryscript`, `eval_with_docker`), per-instance `run_scripts/<id>/{run_script.sh,parser.py}`, dataset `ScaleAI/SWE-bench_Pro` (test split) via datasets-server.

## Result: NOT PASSING (gold is infra_error: toolchain segfault)

Run 2 (Colima vz + Rosetta, after the restart): gold `infra_error` (classified from `signal: segmentation fault` in `asm`/`vet`), empty diff `empty_patch`. Wall 62 s gold+empty, image uncompressed size 596,381,092 bytes (`docker image inspect .Size`, sampled before rmi). Run 1 below (test_fail, 404 s) predates the classifier fix.

Run 1 detail:

| Item | Value |
|---|---|
| Instance | instance_flipt-io__flipt-518ec324b66a07fdd95464a5e9ca5fe7681ad8f9 (go) |
| Image | ghcr.io/scaleapi/swe-bench_pro-v2:<instance_id>, pulled `linux/amd64` |
| Gold patch applied | yes (all hunks, `git apply --binary`) |
| Gold verdict (run 1) | `test_fail`, pass=false (`gold-run.json`); run 2: `infra_error` |
| Empty diff verdict | `empty_patch`, pass=false (no container run) |
| Wall time | 404 s total for the gold + empty run, including pull and eval (`goldWallS` 403.7) |
| Image size | run 2: 596,381,092 bytes uncompressed; run 1 not recorded |
| Peak memory | not measured (docker stats not sampled) |

Cause: Go's toolchain segfaults under amd64 emulation in the container (`compile: signal: segmentation fault`, `vet: signal: segmentation fault`, and a `cgo` exit 2 for go-sqlite3). The target package `internal/config` fails with `[build failed]`, so `TestWhitespaceCorsAllowedOrigins` never runs. The patch itself applies. This is an infra failure, but the harness classifies it as `test_fail` because `output.json` exists. Toolchain crashes (segfault, SIGSEGV, qemu, exit 137/139) now classify as `infra_error` (`TOOLCHAIN_CRASH` in `src/v4-swebpro.mjs`, tested). Qutebrowser was not run because gold did not pass.

## Limits and shortcuts

- Test patch is applied from `/workspace/test_patch.patch` (row `test_patch`), not `/tests/`. Same `git apply` command as the eval's last `before_repo_set_cmd` line.
- Dockerfile `ENV` exports are skipped; the image's ENV is inherited at `docker run`.
- `patch.diff` is produced by the provider's `git diff` of the host workspace (`src/v4-swebpro.mjs`, around line 190).
- Scripts are fetched from `scaleapi/SWE-bench_Pro-os` `main` (raw GitHub) and cached under `~/.cache/v4-swebpro/scripts/`. Rows are cached in `~/.cache/v4-swebpro/rows.json` (642 rows returned by paging datasets-server; the split may be incomplete, check before relying on other instances).
- Unit tests: `tests/v4-swebpro.test.mjs` (no docker).

## Reports

Each run writes `reports/v4/failures/<V4_RUN_LABEL>/<instance_id>.{log,diff}`. The gold script uses label `gold` and `gold-empty` for the empty run.
