# q04 original-contract replacement

Nano Stores #371 explicitly reports that atoms and computed stores from separately bundled modules have distinct epoch state and stale computed values. It expects consistent computed updates across modules. The original title/body are preserved verbatim, including a suggested globalThis/Symbol repair. That hint is disclosed; acceptance does not inspect a symbol, global variable, counter, function shape, source string, or exact error.

The hidden regression loads two complete actual source copies as distinct module instances. It uses the public atom/computed/listen/get/set APIs. One same-instance healthy control passes before and after. A mounted computed over one foreign atom and a mounted computed over multiple foreign atoms must publish the updated derived values. Both fail on the pre-fix baseline with stale public values; all three pass with the actual upstream atom/index.js and computed/index.js files. This models the reported module-instance boundary without requiring React, a specific bundler, or toy replacement source. Actual bundler/tree-shaking builds and unmounted computed chains are not covered.

The complete original 14 test files are executed through the repository's original Better Node Test runner in both controls. It reports 46 passing entries; some are file-level rather than individually enumerated inner assertions. This is not a claim of 46 total assertions or complete lint/type/size CI. Native baseline/reference exits are both zero. Acceptance independently reports baseline 1 pass/2 failures, reference 3 passes/0 failures.

The final dependency install uses the original upstream pnpm-lock.yaml with pinned pnpm10.34.7 --frozen-lockfile --ignore-scripts, matching original CI policy. The lock remains byte-identical. Initial npm resolution/semver trial dependencies, locks and receipts are preserved privately under npm-semver and are not the final controls. Public package.json and original lock metadata are unchanged.


Base physical bytes match Git HEAD for every tracked file, with the original provided pnpm lock. All archived original files and tests are byte-identical. Git has one local original-source-plus-lock commit, no future fixing commit object, no private tests or reference objects. dependencyDir points to the actual installed base/node_modules directory, mounted read-only for controls. Fix files and hidden tests live only under private/. q03 and its graders are preserved unchanged.

All preparation, installs and controls ran on Sonion under two-core affinity. No frozen general-v1 file changed and no model call was made. Independent blind contract review and final dependency/source recheck passed before admission.
