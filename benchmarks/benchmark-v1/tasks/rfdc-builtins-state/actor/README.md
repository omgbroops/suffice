Repair injected deep-clone regressions in rfdc: maps alias their inputs, binary views share storage, and custom constructor handlers fail in circular mode.

The complete pinned upstream repository is in src/, including its original documentation and development tests. The benchmark visible checks are dependency-free. Run from this workspace: node --test tests/visible.test.mjs. Do not install dependencies or run upstream package scripts.
