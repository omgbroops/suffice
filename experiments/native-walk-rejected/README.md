# Rejected subprocess traversal

This is a rejected subprocess prototype, not a production route. The comparison in `docs/rust-migration/measurements/walk-comparison-01.json` failed the latency gates. The archived adapter and tests are preserved; `crate/` reconstructs the sorted recursive executable from session records, and `workspace.mjs` is the baseline JavaScript from the original commit. The original measured binary was rebuilt before archival; its recorded SHA-256 is `e9e40635ff6f196c6a2d5f394dfe1f53c8a72493cc32f190efe7fe243154789d`. That binary is no longer available and the reconstruction does not match its hash, so source and binary identity cannot be established. Build `crate/` and set `SUFFICE_TEST_NATIVE_FS` to the resulting executable to run the archived tests. See `trial03/reconstruction.md` for the later sequential addon, also a reconstruction rather than a byte-verified snapshot.

Observed SHA-256 values from the Windows reconstruction and verification, using Rust/Cargo 1.92.0 and Node 24.22.2:

- Raw `docs/rust-migration/measurements/walk-comparison-01.json`: `3d85f78c33b069eb8d4c1b51a1f6820ee0d5bb419f875179d9aee6257a305638`.
- Raw `docs/rust-migration/measurements/walk-comparison-03.json`: `b2f0218c6c0d4c25577e0eb34b4433984fb5738a68e79dc0289a1896cbd847e7`.
- Reconstructed `crate/target/release/suffice-fs.exe`: `e9b35086996c072b8b821732eab3867614513d9f81345f910d038b56a5488690`. This hash is not an original trial artifact hash and cannot prove a match.
- Current reliability-fixed `crates/suffice-fs-addon/target/release/suffice_fs_addon.node`: `fc02d0b38177737ad751f3193fd8d98f14444fc7940b8982481c666d40dd2033`. It is not the trial 03 binary.
