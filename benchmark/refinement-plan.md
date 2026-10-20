# Five-task refinement pilot

20 fresh attempts: five previously unused Terminal-Bench 2 tasks, one per Pi,
refined Flexible (V1), refined Efficient (V2), and experimental Orchestrated (V3),
following the user's explicit amendment before freeze. No repeat or outcome-selected
replacement. This is a small system comparison, not a feature ablation or a
population accuracy estimate. The old 120-slot benchmark remains immutable.

Tasks, selected before model inference or viewing hidden tests/solutions:
cancel-async-tasks, cobol-modernization, custom-memory-heap-crash,
modernize-scientific-stack, polyglot-c-py. This covers asynchronous cleanup,
legacy translation, C++ debugging, Python migration, and cross-language behavior.
Selection favors executable public contracts and 2 GiB containers; it is purposive,
not random or representative of all software engineering.

Pi: stock 1.2.0, Sol High, unchanged tools/prompt. V1: Sol High, baseline codemode
and AST tools, explicit isolated-task prompt, one same-model repair after a public
check failure. V2: Luna High, existing output control/context/guidance/notices,
one upfront tool-free Sol Low plan (at most one response, requested 120 words),
one Luna repair after public failure, then existing bounded Sol Low takeover if
failure persists. All stages share the $5, 100-response, 240-tool task allowance;
one in-flight response may cross a boundary. No new per-stage sublimits. Production
defaults and the old Flexible repository prompt are unchanged.

V3: Sol High coordinator, without write/edit/general shell tools. It retains
read/AST navigation, recoverable output retrieval, a fixed public-check tool,
and a delegate tool. Luna High handles focused read-only investigation or
implementation with codemode. At most four sequential delegations in a shared
workspace avoid concurrent editing races. Workers receive the original public
task plus the coordinator's brief, not its full conversation. No code-writing
tools are exposed to Sol; the instruction also forbids writing code in briefs.
Exact check status and retained worker outputs remain available for review.
All coordinator and worker responses share the same whole-task allowances.
This is not an automatic every-tool-call interception policy. Stage usage is
non-overlapping; parent elapsed time includes nested worker time.
Sol can retrieve bounded byte ranges of original worker output directly, including
base64 for binary bytes. The retrieval tool cannot read arbitrary receipt paths.

All arms receive the identical original task plus the same public self-check
command and coverage warning. Read-only public check scripts and initial source/
data fixtures are mounted identically. Pi may run that command itself; its final
public outcome is recorded without sending it back after completion. V1/V2 run
it in the controller and may use its failure under the declared repair policy.
That is an explicit treatment difference. Official evaluators run only after
the actors stop. Their contents and feedback never enter planning/repair.

Checks are authored from instruction.md and initial public source/data only.
They check cancellation cleanup/concurrency; the supplied COBOL fixture's byte
outputs; both published C++ build modes, normal exit and Valgrind; station means,
dependencies and legacy preservation; Fibonacci 0..12 in both languages.
Coverage is partial. A pass does not certify correctness. Before inference,
exercise negative controls in fresh containers and validate check infrastructure.
Preserve initial failures and check receipts. No hidden tests or solutions are
read during check preparation. Do not replace tasks based on actor outcomes.

Pre-inference amendment: the polyglot image has GCC but lacks Python. All arms
receive a separate read-only portable Python mount for the public check launcher.
Candidate execution still uses the task's system Python, and cancellation checks
re-execute on system Python as explicitly required. The checker runtime is not
silently installed as the task interpreter. Preserve the initial preflight failure
and initial manifest; re-freeze all source/check/task hashes before paid attempts.

Reuse pinned TB2 revision 69671fbaac6d67a7ef0dfec016cc38a64ef7a77c,
Harbor 0.24.0 and existing model catalog/authentication. Freeze source, dependency,
check, fixture and task hashes before the first paid response. Original task
timeouts/resources apply. Run at most two 2 GiB tasks concurrently, preserve
unrelated containers. Stop admissions at <=40% weekly remaining or unavailable
quota; let already admitted work finish. No quota resets or automatic model reruns.

Record independent acceptance, public verification separately, all stage costs,
cache/read/write/output tokens, model/tool calls, full agent latency, planning/
repair/takeover activation and failures. Keep incomplete usage unknown, not zero.
Include failed attempts in cost per accepted task and report all regressions.

## Diagnosis driving the changes

Original nginx V1 final answer explicitly deferred the requested system installation
because of repository restrictions, while presenting a temporary installation.
Its replacement receipt lives in the original campaign's separate replacement
directory. This is a scope mismatch, not evidence of a model inability to configure
nginx. The tensor V1 trace also shows a rejected /tmp write and shell workaround;
that friction alone is not established as the cause of its wrong implementation.
No task-specific patch or hidden failure signature is added to the harness.

The isolated-task prompt is caller opt-in guidance for an already isolated
environment. It is not an OS security boundary and does not relax repository file
guards. The unchanged shell tool handles explicitly authorized out-of-workspace
operations. Missing or unexecuted controller verification is labeled unverified.
Upfront advice reads task text only, avoiding duplicate repository preparation.
