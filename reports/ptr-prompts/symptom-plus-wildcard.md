# path-to-regexp repair task

path-to-regexp 0.1.12 (source in src/): pathToRegexp("/:a-:b-:c").exec("/1-2-3--4") returns a match with c = "-4". A parameter should not be able to start with the separator that precedes it, so this path should not match. The same must hold when an earlier element in the segment is a bare `*` wildcard, e.g. "/a*-:b-:c" must not match "/ab-1-2--3".

Only production JavaScript under src may be edited. Smoke test: SUFFICE_WORKSPACE=<workspace> node --test tests/visible.test.mjs
