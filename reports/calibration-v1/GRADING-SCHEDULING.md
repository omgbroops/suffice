# Grading throughput diagnosis and scheduling amendment

Three HTML-filter Luna actors finished their model work in roughly two minutes
each, then their official verifiers reached the existing 900-second timeout.
Those outcomes remain ungraded. A subsequent live HTML grader container showed
2 GiB memory usage against its 2 GiB limit, an OOMKilled flag, about 240 Chromium
and 54 chrome_crashpad processes, and roughly 2,998 reported PIDs including threads.
Only process/resource metadata was inspected, not private cases or solutions.
This suggests resource exhaustion but does not establish its underlying cause.

The old controller retained its two admission slots through the complete actor,
grader and cleanup lifecycle. The amended scheduler releases the model slot only
after a terminal known-cost worker receipt. It allows at most two active model
jobs and four total task containers, while retaining observed-memory, quota and
campaign-spending guards. A container stays occupied until its outer result is
saved; an interrupted or unaccounted actor stops new admissions for review.

An owned STOP marker prevents the old controller from admitting another job. The
new scheduler adopts its already-running trials, without restarting their actors
or graders, and admits only untouched frozen jobs. It removes only its own marker
after all 32 original result records exist. The two previously authorized provider
replacements wait for this new supervisor, then run with their original frozen
policies. No grader timeout was shortened, no tests/resources changed, and no
failed score was replaced as part of this scheduling amendment.

Four pure admission checks and a no-inference handoff simulation verify model
and container caps, conservative unknown-usage handling, adoption without a
duplicate launch, and successful completion with the handoff marker removed.
Live status confirmed a WAL-recovery actor admitted while a completed HTML model
run remained in grading. Mixed scheduling and additional resource contention
further limit causal claims about latency. This improves queue throughput; it
does not establish that an individual grader has become faster.
