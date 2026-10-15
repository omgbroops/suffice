Repair injected TinyQueue heap regressions affecting insertion paths, replacement ordering and empty-state reuse.

The complete pinned upstream repository is in src/, including its original documentation and development tests. The benchmark visible checks are dependency-free. Run from this workspace: node --test tests/visible.test.mjs. Do not install dependencies or run upstream package scripts.
