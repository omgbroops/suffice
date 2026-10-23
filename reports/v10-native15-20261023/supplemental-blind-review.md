# Independent blind review of cookie-173 baseline validation

Reviewer: `/root/cookie_validation_review`, completed before either cookie actor was independently scored.

Conclusion: cookie-173 is valid, and its baseline fails for the intended source bug. Requiring literal ERR_ASSERTION incorrectly excludes this failure.

Inputs read: frozen acceptance source `evaluation/frozen/cookie-173.test.mjs`; all four baseline/reference acceptance/public result.json, stdout.txt and stderr.txt sets under `evaluation/results/`; the cookie-173 entry in grading-freeze.json; and the public contract supplied in the review request. Every stderr file was empty.

No actor solutions, outputs, grades, or attempts/grading directories were inspected. No files were changed or actor/grader processes run by the reviewer.

The acceptance assertion calls dom('.example.com') while evaluating the arguments to assert.equal. The baseline serializer throws TypeError: option domain is invalid before the assertion executes. Consequently, absence of ERR_ASSERTION is expected. Its stack points directly from production serialize through the helper to the valid-domain assertion. See frozen source line 8 and baseline acceptance stdout line 8.

The baseline completed both expected tests: the leading-dot test failed, malformed-domain rejection passed, and no tests were cancelled or skipped. It exited 1 with no execution error, timeout, or overflow. This supports an expected source failure rather than an infrastructure failure. See baseline acceptance stdout line 21 and result.json line 16.

Reference acceptance passes both tests; baseline and reference public regressions each pass both tests. See their stdout.txt line 14.

Uniform validation criterion: accept either an assertion failure or a reviewed source exception directly demonstrating violation of the public contract, provided the complete expected named suite executes without infrastructure failures or omissions, reference acceptance passes, and required baseline/reference public regressions pass. Arbitrary nonzero exits remain insufficient. Keep all frozen acceptance assertions unchanged.
