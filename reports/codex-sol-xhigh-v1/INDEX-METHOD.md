# Our ten-issue comparison and the published Coding Agent Index

The current authorized run is twenty new actor sessions on the original ten GitHub issues: frozen Suffice versus native Codex, both GPT-6.1 Sol xhigh. It supports a local acceptance-versus-cost graph. It does not produce an Artificial Analysis Coding Agent Index.

Artificial Analysis's currently published v1.5 methodology combines three suites with equal weight: DeepSWE v1.1 (113 tasks), Terminal-Bench 4.0 (66), and SWE-Atlas QnA (124). Each task receives three attempts. A full configuration therefore requires 909 attempts, and a full two-harness comparison requires 1,818, plus preparation, controls and grading. QnA requires its prescribed judge; environment policies and benchmark-specific verifiers must also match. The index averages the three pass@1 percentages, rather than pooling every task into one percentage. A partial subset must be labeled as a subset, not the published index.

For our current campaign, mean attempt cost is total inference across all attempted tasks divided by attempts. Cost per accepted task is that same total divided by independently frozen-check accepted tasks, including spending on unsuccessful attempts. Median cost is the median of individual attempt costs. Missing usage remains unknown; known lower bounds are separate. Budget-certified acceptance is reported separately from passing a grader. Fresh input, cache reads, output and reasoning are recorded; reasoning is included in output rather than added twice.

Reason's article uses an index-normalized solved-cost measure: mean cost across its task collection divided by the index expressed as a fraction. Because component sizes differ, this is not generally identical to total cost divided by the literal count of passing attempts. We should preserve both definitions explicitly if we later run its suites.

The blog's gains are author-reported comparisons. Its methodology also notes that its October jobs preceded some later strict trajectory/accounting gates. Their published numbers cannot be combined with our ten issues as a common quality scale. No full-index campaign is being launched automatically.

Sources inspected on 2026-10-15 America/Chicago:

- [Artificial Analysis v1.5 methodology](https://artificialanalysis.ai/methodology/coding-agents-benchmarking)
- [Reason Agent 1.1 article](https://reasonmachines.com/blog/introducing-reason-agent-1-1)
- [Reason benchmark methodology](https://github.com/reason-machines/benchmark/blob/main/docs/METHODOLOGY.md)
