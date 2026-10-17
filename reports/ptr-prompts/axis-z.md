# path-to-regexp repair task

path-to-regexp 0.1.12 (source in src/): pathToRegexp("/:a-:b-:c").exec("/1-2-3--4") returns a match with c = "-4". A parameter should not be able to start with the separator that precedes it, so this path should not match.

Only production JavaScript under src may be edited. Smoke test: SUFFICE_WORKSPACE=<workspace> node --test tests/visible.test.mjs

Additional instruction: before fixing, write your own failing test cases for every construct in the path syntax (named params, optional/repeat modifiers, bare `*`, custom regex groups) comparing against what a correct fix must do; run them after fixing.
