# v5 localization eval (free, no model calls)

Date: 2026-10-22. Index: src/v5-index.mjs (BM25 + path/symbol/literal boosts).
Recall@k = mean fraction of gold files in top k. Hit@k = share of tasks with at least one gold file in top k.
Tokens = chars/4 of the top-5 excerpt bundle (one 31-line snippet per file at its top symbol, or file head).

| set | tasks | R@1 | R@3 | R@5 | R@10 | hit@1 | hit@3 | hit@5 | hit@10 | mean bundle tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| polyglot (27+ manifest union) | 36 | 5.6% | 86.1% | 98.6% | 100.0% | 8.3% | 94.4% | 100.0% | 100.0% | 713 |
| SWE-bench Pro pilot | 2 | 12.5% | 25.0% | 25.0% | 37.5% | 50.0% | 50.0% | 50.0% | 50.0% | 1480 |

### polyglot per task
| task | gold | R@1 | R@3 | R@5 | R@10 | tokens | top-3 |
|---|---|---|---|---|---|---|---|
| cpp/sublist | sublist.cpp, sublist.h | 0.00 | 0.50 | 1.00 | 1.00 | 718 | .docs/instructions.md, CMakeLists.txt, sublist.cpp |
| cpp/phone-number | phone_number.cpp, phone_number.h | 0.00 | 1.00 | 1.00 | 1.00 | 698 | .docs/instructions.md, phone_number.h, phone_number.cpp |
| cpp/complex-numbers | complex_numbers.cpp, complex_numbers.h | 0.00 | 1.00 | 1.00 | 1.00 | 806 | .docs/instructions.md, complex_numbers.h, complex_numbers.cpp |
| go/alphametics | alphametics.go | 0.00 | 1.00 | 1.00 | 1.00 | 729 | .docs/instructions.md, .docs/instructions.append.md, alphametics.go |
| go/wordy | wordy.go | 0.00 | 1.00 | 1.00 | 1.00 | 401 | .docs/instructions.md, wordy.go, cases_test.go |
| go/say | say.go | 0.00 | 1.00 | 1.00 | 1.00 | 452 | .docs/instructions.md, cases_test.go, say.go |
| go/word-search | word_search.go | 0.00 | 1.00 | 1.00 | 1.00 | 495 | .docs/instructions.md, word_search.go, cases_test.go |
| go/two-bucket | two_bucket.go | 0.00 | 0.00 | 1.00 | 1.00 | 1052 | bonus_test.go, .docs/instructions.append.md, .docs/instructions.md |
| cpp/all-your-base | all_your_base.cpp, all_your_base.h | 0.00 | 1.00 | 1.00 | 1.00 | 770 | .docs/instructions.md, all_your_base.h, all_your_base.cpp |
| java/affine-cipher | src/main/java/AffineCipher.java | 0.00 | 1.00 | 1.00 | 1.00 | 1159 | .docs/instructions.md, src/main/java/AffineCipher.java, .docs/instructions.append.md |
| java/pig-latin | src/main/java/PigLatinTranslator.java | 0.00 | 1.00 | 1.00 | 1.00 | 1080 | .docs/instructions.md, src/main/java/PigLatinTranslator.java, gradlew |
| java/all-your-base | src/main/java/BaseConverter.java | 0.00 | 1.00 | 1.00 | 1.00 | 1087 | .docs/instructions.md, src/main/java/BaseConverter.java, gradlew |
| java/satellite | src/main/java/Satellite.java | 0.00 | 1.00 | 1.00 | 1.00 | 727 | .docs/instructions.md, src/main/java/Satellite.java, src/main/java/Tree.java |
| javascript/alphametics | alphametics.js | 0.00 | 1.00 | 1.00 | 1.00 | 485 | .docs/instructions.md, alphametics.js, package.json |
| javascript/house | house.js | 0.00 | 1.00 | 1.00 | 1.00 | 853 | .docs/instructions.md, house.js, package.json |
| python/affine-cipher | affine_cipher.py | 0.00 | 1.00 | 1.00 | 1.00 | 677 | .docs/instructions.md, .docs/instructions.append.md, affine_cipher.py |
| javascript/two-bucket | two-bucket.js | 0.00 | 1.00 | 1.00 | 1.00 | 1096 | .docs/instructions.md, .docs/instructions.append.md, two-bucket.js |
| python/transpose | transpose.py | 0.00 | 1.00 | 1.00 | 1.00 | 143 | .docs/instructions.md, transpose.py |
| python/proverb | proverb.py | 0.00 | 1.00 | 1.00 | 1.00 | 390 | .docs/instructions.append.md, .docs/instructions.md, proverb.py |
| python/connect | connect.py | 0.00 | 1.00 | 1.00 | 1.00 | 351 | .docs/instructions.md, connect.py |
| python/go-counting | go_counting.py | 0.00 | 1.00 | 1.00 | 1.00 | 726 | .docs/instructions.append.md, .docs/instructions.md, go_counting.py |
| rust/book-store | src/lib.rs, Cargo.toml | 0.00 | 1.00 | 1.00 | 1.00 | 358 | .docs/instructions.md, src/lib.rs, Cargo.toml |
| rust/parallel-letter-frequency | src/lib.rs, Cargo.toml | 0.00 | 0.00 | 1.00 | 1.00 | 640 | .docs/instructions.append.md, benches/benchmark.rs, .docs/instructions.md |
| rust/accumulate | src/lib.rs, Cargo.toml | 0.00 | 0.50 | 1.00 | 1.00 | 468 | .docs/instructions.append.md, .docs/instructions.md, src/lib.rs |
| rust/pig-latin | src/lib.rs, Cargo.toml | 0.00 | 0.50 | 1.00 | 1.00 | 481 | .docs/instructions.md, src/lib.rs, .docs/introduction.md |
| javascript/grade-school | grade-school.js | 0.00 | 1.00 | 1.00 | 1.00 | 918 | .docs/instructions.md, grade-school.js, package.json |
| rust/decimal | src/lib.rs, Cargo.toml | 0.50 | 0.50 | 1.00 | 1.00 | 632 | src/lib.rs, .docs/instructions.md, .docs/hints.md |
| cpp/linked-list | linked_list.cpp, linked_list.h | 0.00 | 0.50 | 0.50 | 1.00 | 1094 | .docs/instructions.append.md, .docs/instructions.md, linked_list.cpp |
| javascript/space-age | space-age.js | 0.00 | 1.00 | 1.00 | 1.00 | 1232 | .docs/instructions.md, space-age.js, .docs/introduction.md |
| rust/gigasecond | src/lib.rs, Cargo.toml | 0.50 | 0.50 | 1.00 | 1.00 | 638 | Cargo.toml, .docs/instructions.append.md, .docs/instructions.md |
| cpp/clock | clock.cpp, clock.h | 0.00 | 1.00 | 1.00 | 1.00 | 444 | .docs/instructions.md, clock.h, clock.cpp |
| go/forth | forth.go | 0.00 | 1.00 | 1.00 | 1.00 | 556 | .docs/instructions.md, forth.go, cases_test.go |
| java/simple-linked-list | src/main/java/SimpleLinkedList.java | 0.00 | 1.00 | 1.00 | 1.00 | 866 | .docs/instructions.md, src/main/java/SimpleLinkedList.java, gradlew |
| java/ocr-numbers | src/main/java/OpticalCharacterReader.java | 0.00 | 1.00 | 1.00 | 1.00 | 874 | .docs/instructions.md, src/main/java/OpticalCharacterReader.java, gradlew |
| javascript/react | react.js | 0.00 | 1.00 | 1.00 | 1.00 | 632 | .docs/instructions.md, react.js, LICENSE |
| python/dot-dsl | dot_dsl.py | 1.00 | 1.00 | 1.00 | 1.00 | 955 | dot_dsl.py, .docs/instructions.append.md, .docs/instructions.md |

### SWE-bench Pro per task
| task | gold | R@1 | R@3 | R@5 | R@10 | tokens | top-3 |
|---|---|---|---|---|---|---|---|
| instance_qutebrowser__qutebrowser-0b621cb0ce2b54d3f93d8d41d8 | qutebrowser/misc/guiprocess.py | 0.00 | 0.00 | 0.00 | 0.00 | 1571 | tests/end2end/fixtures/quteprocess.py, qutebrowser/commands/command.py, tests/end2end/fixtures/testprocess.py |
| instance_qutebrowser__qutebrowser-c09e1439f145c66ee3af574386 | doc/help/commands.asciidoc, qutebrowser/browser/qutescheme.py, qutebrowser/completion/models/miscmodels.py, qutebrowser/misc/guiprocess.py | 0.25 | 0.50 | 0.50 | 0.75 | 1389 | qutebrowser/misc/guiprocess.py, qutebrowser/completion/models/miscmodels.py, tests/unit/browser/test_qutescheme.py |

Notes: polyglot issue = .docs/instructions(.append).md; gold = .meta/config.json solution files; index runs on the
prepWorkspace stub copy (hidden tests removed). SWE-bench Pro repo = shallow fetch of base_commit from upstream,
not the eval docker image (not pulled: multi-GB, disk 96% full); test_patch files removed; issue = problem_statement.
