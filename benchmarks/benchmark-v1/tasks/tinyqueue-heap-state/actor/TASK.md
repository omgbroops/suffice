Repair injected TinyQueue heap regressions affecting insertion paths, replacement ordering and empty-state reuse.

These are benchmark-authored defects in pinned real source, not claims of upstream bugs. Repair src/index.js while preserving the existing public API. The full repository is in src/. No installs, network access, subprocesses or package scripts are required. Run node --test tests/visible.test.mjs from the workspace.

Public acceptance contract:
Q1: The constructor must heapify any supplied dense array using the supplied comparator; default ordering is ascending. The existing API may mutate the supplied array.
Q2: push must preserve heap order for arbitrarily interleaved insertions, including inserts requiring movement through multiple ancestors.
Q3: pop must return the highest-priority item according to the comparator and restore the heap after replacement, including when the better child is on either side or only the left child exists.
Q4: length must equal the number of queued items after each operation; peek returns the next pop value without removal. Empty pop and peek return undefined. Draining and reusing a queue must not leave stale entries.
Q5: Custom comparators, including reverse numeric ordering and object-priority comparators, must govern construction, push, peek and pop. Duplicate priorities must retain all inserted entries; tie stability is not required.
