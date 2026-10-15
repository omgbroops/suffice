# Independent saved-patch replay

Reconstructed all three saved patches from initial bases and restored original native tests. No model calls or new benchmark attempts. Pinned evaluator dependencies are reused through read-only mounts. An unfinished physical dependency copy is preserved separately and hidden by the read-only dependency mount.

| Attempt | Task | Private acceptance | Original native suite | Build / lint | Verdict |
|---|---|---|---|---|---|
| 001 | h02 | passed | 390 tests, 385 passed, 3 pending, 2 failed | not required by historical gate | accepted |
| 002 | h02 | passed | 390 tests, 385 passed, 3 pending, 2 failed | not required by historical gate | accepted |
| 003 | l01 | passed | 153 tests, 153 passed, 0 pending, 0 failed | passed | accepted |

Historical failures match the original controls by exact test title. h02 lint was not rerun: the original actor receipts preserve its pre-existing Node24 tooling crash, and lint is not an original historical acceptance gate. Private graders ran under Linux Node24.15.0 in the isolated evaluator, using unchanged grader source; original private receipts used Windows Node24.15.0. Frozen input and original base checks: unchanged.

Detailed reconstruction hashes: .suffice/general-field-replay-v1/receipts/reconstruction.json. Raw native/private receipts: .suffice/general-field-replay-v1/receipts/. Historical test failures are retained in these receipts; existing lint crash receipts remain with the original pilot attempts.
