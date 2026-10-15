These two candidates use complete, commit-pinned upstream source trees from [rfdc](https://github.com/davidmarkclements/rfdc) and [TinyQueue](https://github.com/mourner/tinyqueue), with MIT and ISC licenses respectively. The exact pins, source archive hashes, public contracts and injection descriptions are in each task.json. Combined compressed archive downloads were 21,249 bytes. No dependencies were installed and no upstream scripts ran.

Both are **scope tier 1, single-component repairs**. Each has three deliberately injected regression mechanisms; neither is represented as an upstream defect. Multiple failing cases do not establish model difficulty or task duration. These are candidates for independent review, not demonstrated challenging or long tasks. No inference or model repair attempt has run. Calibration and reserve allocation was frozen before injection and author validation, and has not changed.

| Candidate | Split | Defective visible | Defective private | Reference visible | Reference private |
| --- | --- | --- | --- | --- | --- |
| rfdc-builtins-state | calibration | 2/2 | 1/9 | 2/2 | 9/9 |
| tinyqueue-heap-state | reserve | 2/2 | 0/7 | 2/2 | 7/7 |

Every private test has a literal name and a corresponding assertionMap entry linking all its assertions to the public requirement IDs. Tests use only native Node modules, contain no subprocess/network/credential access, and run against an explicit SUFFICE_WORKSPACE. A future runner must copy **only actor/** into the agent workspace. task.json, reference/, source archives, private/, validation receipts and this authoring script stay evaluator-side. The actor includes the complete upstream tree in src/ and its visible test in tests/visible.test.mjs.

rfdc intentionally scopes binary-view expectations to behavior supported by the pristine source: DataViews extend to the end of their buffer, root binary views are excluded, and Buffer byte offsets are not specified. The task also excludes cyclic arrays and self-referential Map/Set values. Those limitations are explicit in the public prompt, rather than hidden evaluation surprises. The reference repair is the pristine pinned upstream index.js in both tasks.

validation/frozen.json within each candidate records content hashes, test counts and TAP log hashes. state-task-validation.json summarizes the offline author validation. The builder is an author tool that creates both public and private files and launches offline Node validation; it must never be made available in an actor workspace.
