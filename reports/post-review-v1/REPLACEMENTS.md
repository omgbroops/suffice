# Two authorized timeout replacements

The user explicitly requested rerunning the timeout results and not counting
the originals. This authorizes exactly one fresh replacement for
`queue-aborted-review` and one for `queue-aborted-pi`, with the new 1,800-second
limit. No other failures receive automatic replacements.

The original trials and results stay in place. `campaign/replacement-plan.json`
pins their result hashes, exclusion reason, and replacement identifiers. The
replacement runner waits for the existing queue to drain so that total
concurrency stays at two. It reuses the frozen initial images, task prompts,
public checks, model/effort settings, and harness runtime. It starts from fresh
task containers and supplies no old patches, reviewer feedback, or grader
information. Per-attempt cost/response/tool limits and campaign quota/spend
admission controls are unchanged.

`campaign/PRIMARY-RESULTS.md` and `primary-results.json` are now the selected
comparison. The two originals are excluded immediately, including while their
replacements are pending. Replacement outcomes count regardless of success,
failure, or another timeout. The original `RESULTS.md` and `results.json` remain
the original-attempt audit and are not the replacement-adjusted comparison.
All executed spend, including excluded originals, appears separately in the
primary report. This exclusion was requested after seeing the interruptions;
it is a disclosed protocol amendment, not part of the original preregistration.

The original completed Luna-alone run retains its 600-second allowance. It
finished in 325.198 seconds. All other selected attempts use 1,800 seconds;
the five subsequent issues remain the fully matched time-budget cohort.
