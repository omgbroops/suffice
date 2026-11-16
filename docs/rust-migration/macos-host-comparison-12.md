# Matched macOS host diagnostic — campaign 12

The experimental Wry host uses less memory on this workload, but its terminal
latency regresses. It is not accepted as the production replacement. The full
Rust engine/UI rewrite, Windows runtime and installer/performance gates remain
open.

Later standalone-package qualification found that the old Electron artifact
resolved its missing `@suffice/harness` entry from the enclosing checkout. That
also loaded two distinct Pi SDK module identities. This baseline is unsuitable
for conclusions about a self-contained installed app. Keep the measured numbers
below as historical diagnostic observations; compare the corrected standalone
package before asserting a current memory or startup benefit. The exact module
resolution proof is retained with the subsequent packaging continuation.

Five alternating pairs completed on macOS 26.5.2. Ten host runs passed all phases,
120 process snapshots reconciled, all exits and process/store/project cleanup
passed, and runtime fingerprints stayed unchanged. Each run used the same
30-thread/1,000-message fixture in independent homes/profiles. Both rendered
29,389 transcript characters at 1440 × 900 CSS pixels, DPR 2.

| Host median | Electron | Wry | Wry change |
| --- | ---: | ---: | ---: |
| Ready physical footprint | 796.02 MiB | 542.87 MiB | −31.80% |
| Ready summed resident bytes | 760.39 MiB | 519.78 MiB | −31.64% |
| Instrumented equal-viewport startup | 1,115.31 ms | 894.46 ms | −19.80% |
| Transcript selection | 566.85 ms | 619.04 ms | +9.21% |
| Provider-settings workload | 298.13 ms | 297.77 ms | −0.12% |
| Terminal through visible output | 172.48 ms | 349.38 ms | +102.57% |

The median paired physical-footprint change at ready was −34.24%, compared with
−31.80% from the ratio of host medians; these are different summaries of the same
five pairs. All terminal pairs regressed, from +66.85% through +106.82%. Two
transcript-selection pairs exceeded +10% despite the +9.21% host-median ratio.
Settled ready/settings CPU was 0.40%/0.38% of one core for Electron versus
0.83%/0.97% for Wry. The settings CPU host-median ratio rose 8.45%, while its
median paired change rose 10.74%. Do not conflate CPU, physical footprint and RSS.

## Method and limitations

Application inputs are frozen from `1b6373d`; the measurement driver has the
separately recorded native viewport correction. The C kernel observer attributes
launchd-parented WebKit services and retired-helper CPU using separate app
coalitions. Per-process identities, member counts, raw snapshots, all host values
and paired differences are retained. Universal services outside the coalition,
including WindowServer, are excluded. These are sampled observations, not a
continuous peak or a cold-cache experiment.

Electron was constrained by the 896-point available work area in campaign 11.
That campaign is invalid for comparison and is retained in full. The corrected
driver verifies the launchd PID, browser process type, canonical private profile,
unique native window and renderer identity before adjusting the real native
window. It verifies three stable frames and closes its temporary main inspector
before resource sampling. No viewport emulation or relaxed gate was used.

Electron-specific viewport preparation took a median 201.49 ms in campaign 12 and
is included in startup. Report this as instrumented, equal-viewport startup, not
ordinary launch speed. First-party application code and both executable hashes
were unchanged by this driver correction. Both apps ran the same DOM fixture
code and confirmed actual rendered transcript/settings/terminal markers.

The installed macOS 26.5.2 is below the package's declared 27.0 minimum. The direct
executables worked, but this diagnostic cannot qualify supported installation or
release acceptance. Wry retains Node, Pi, the web renderer and their dependencies.
There is no Rust installer-size result. Ready memory and instrumented startup also
fall short of the original 40%/25% targets, and terminal latency violates the
no-large-regression requirement. Earlier Windows results stay unchanged.

Independent Astra High review recomputed the complete campaign and matched the
coordinator's numbers. Requested routing is unverified. The observed terminal
regression is assigned for a measured breakdown of renderer, transport, PTY and
supervisor/instrumentation costs. Cleanup and feature guarantees must be retained
while addressing it.

## Evidence

`measurements/macos-hosts-11-12/` retains both campaigns, the earlier viewport
proofs and failures, stage provenance, runtime/source/binary hashes, independent
analysis and its recomputation script. The frozen staged checkout has its own
Bun dependencies; no shared dependency junctions were used. No paid provider
request or publication occurred.
