# Independent interface-friction fixture review

Read-only inspection before scored live runs. Reviewed interface-friction/benchmarks/friction/tasks.json, every *.acceptance.mjs, scripts/prepare-friction.py and selected pinned reference modules. No live model, fixture replay, dependency change or parent-worktree edit. Baseline/reference execution belongs to parent validation and is not claimed here.

## Contract calibration

No clear public-prompt/hidden-assertion contradiction identified. No exact output spelling is demanded beyond the stated values and standard ENOENT filesystem code. These checks avoid the earlier finalizer-reason specificity issue. The following is the complete hidden test-group mapping (assertions within each group share the mapping):

| Task / hidden group | Public requirement / qualification |
|---|---|
| JSON5 every digit | NUL followed by any decimal digit; valid parse and exact roundtrip directly match. |
| JSON5 other contexts | Isolated NUL, nondigit and adjacent NUL followed by digit match preservation clauses. |
| JSON5 nested keys/arrays | Explicit object-key and nested-value preservation. |
| JSON5 quote choices | Explicit supported quote options; checks roundtrip but not whether output actually honors selected delimiter. |
| dotenv missing single | Explicit paths attempted, no cwd fallback; empty env/parsed and ENOENT are consistent with missing path. |
| dotenv all missing | Explicit arrays and filesystem errors. Does not require specific error.path selection among failures. |
| dotenv mixed valid/missing | Preserve successful parsed values and error, never fallback. Only valid-first/missing-second is tested; missing-first/valid-second continuation is absent. |
| dotenv precedence/override | Explicit first-file precedence and override behavior; tests initially empty processEnv only. |
| dotenv default | Explicit cwd default preserved. Requires process cwd actually be fixture workspace; runner setup must establish this. SUFFICE_WORKSPACE alone does not change cwd. |
| flatted CJS wide ring | Thousands of mutually linked entries, no stack exhaustion, array length and every next identity. Explicitly in scope. |
| flatted ESM wide ring | Same requirement; checks last-to-first cycle but not every ESM link. |
| flatted shared literal | Identity and ordinary stringify/parse; literal numeric-looking string preserved. |
| flatted reviver | Number transformation and root invocation match preservation. Test name says receiver but **never checks this**. |
| synthetic queue | Output order and clearing original queue directly match prompt; strictly development pilot. |

## Discovery and exposure limitations

Every visible test exposes an entry path: JSON5 src/lib, dotenv src/lib/main.js, flatted src/cjs/index.js, pilot src/collections/queue.js. JSON5 index.js immediately imports stringify; flatted src/package.json discloses cjs and esm entries. There are only 8/3/2 JS source files. Thus directory symbols/search can exercise an interface contract and reduce EISDIR friction, but these fixtures are weak evidence for difficult repository discovery. Navigation activation does not establish relevant-context selection efficacy.

Metadata tasks.json additionally includes historical modified files, public fix commit, referenceDir, acceptancePath and sourceFiles. Those are researcher/evaluator data, not actor briefing. Verify runner passes only public prompt and ordinary workspace tools rather than serializing whole task records. SourceFiles may legitimately bound immutable/edit policy internally without appearing as an oracle path list in actor input. Historical source filenames remain naturally discoverable from visible tests; do not describe this as blinded source localization.

## Reference and fixture boundaries

prepare-friction.py retains selected .js files under lib/cjs/esm plus package/README/license metadata, wraps them under src, and replaces the original test suite with authored Node samples. Flatted root browser bundles, original upstream tests, type declarations, build scripts and dependencies are absent even though package metadata references several of them. This is a runnable production-module slice, not a complete repository build or full entrypoint compatibility check. Explicit flatted CJS/ESM requirement is fairly represented; browser bundles are neither editable nor tested.

Flatted reference revive still recursively traverses lazy children. Its two-pass/lazy scheme can handle wide collections without implying arbitrary-depth stack safety; the prompt appropriately excludes arbitrary-depth nested JSON. JSON5 pinned reference uses x00 only before util.isDigit; tests permit other semantically correct encodings. Dotenv reference attempts each configured path, accumulates parsedAll, keeps lastError and populates processEnv; tested semantics align. Public historical repair availability means training contamination cannot be excluded.

## Selected regression scope and missing checks

Visible samples are three authored tests per real task: JSON5 basic parsing/roundtrip/replacer indentation; dotenv parse/populate default/override; flatted ordinary roundtrip/self-cycle/reviver number conversion. No original upstream test suite is included. Hidden final acceptance is also a finite sample, not full requested contract proof. README currently says hidden acceptance checks the full requested task; qualify reporting as checks selected requirements.

Coverage absent or incomplete, not observed implementation failures: JSON5 actual quote delimiter compliance, broad escapes/replacer semantics; dotenv missing-first/valid-later, valid/missing/valid continuation, existing environment precedence, public config wrapper and tilde paths; flatted reviver receiver/deletion/order/cyclic reviver behavior, every ESM link, alternate widths/shapes. Most are reasonable out-of-sample limits for a bounded interface study; avoid calling their absence bugs or adding them after seeing actor failures and preserving a holdout label.

Recommended interpretation: suitable narrow interface-friction cohort if baseline/reference receipts validate, cwd is correct, evaluator metadata stays outside actor prompts, activation is measured and pilot remains separate. No pre-run blocker identified from static prompt/assertion review. Task success and directory-tool activation are distinct endpoints. Do not claim general capability gain, robust code discovery or complete upstream regression safety from this cohort.

Parent follow-up: actor receives public task.prompt and repository name only, excluding sourceFiles/files/fix/grader metadata. Parent plans package-root imports in visible tests and an actual reviver receiver assertion; these planned revisions were not reread in this review. Parent will describe small historical-library discovery, not difficult large-repository search. Original observations above describe the bytes reviewed before those revisions.
