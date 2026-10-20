# Public replay of the prior failed task

Reconstructed the final polyglot source for Pi, V1, V2 and V3 solely from their
recorded write/edit tool calls, ordered by event time. The reconstruction asserts
unique edit matches and records a SHA-256 history. Sources and provenance are
retained under artifact-audit/. No evaluator scripts, private cases or solutions
were read. No model inference or original-workspace mutation was performed.

All four reconstructed artifacts compile with the original image's GCC. All
four pass 38 independently computed public Fibonacci cases in C and with the
explicit separately mounted Python interpreter: 0..30, 50, 92, 93, 100, 1000,
10000 and 21000. This is partial diagnostic coverage, not proof of correctness.
The fresh image has no default python3 for any of the four replays.

Prior receipts show V1 added a persistent /usr/local/bin/python3 symlink. V2
instead used an exported PATH or temporary launcher within individual commands;
Sol's takeover also used a modified PATH without changing the final system
installation. V3 reported the missing interpreter and left the public check
unverified. Pi also used a command-local PATH adjustment but was independently
accepted. Therefore absent Python alone does not explain the independent grades.
The exact independent rejection cause remains unestablished; preserve 4/5 and
all prior scores. Do not convert this replay into a replacement benchmark pass.

The supported harness finding is narrower: repeated paid code repair was
triggered by an unavailable verification prerequisite, even though that
diagnostic supplied no evidence of a numerical source defect. New explicit
checker prerequisites can leave such coverage unverified without paying for
another coding stage. Actual required product state is still a candidate check.

Reproduce with benchmark/calibration-artifact-audit.py followed by
benchmark/calibration-replay.py in the existing Sonion WSL environment. Replay
containers have networking disabled and no credentials, model runtime or hidden
evaluator mounts. The original receipts and runtime are unchanged.
