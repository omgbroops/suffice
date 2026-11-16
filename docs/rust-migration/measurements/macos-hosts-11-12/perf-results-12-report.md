# Campaign 12 results audit

All five alternating Electron/Wry pairs completed on macOS 26.5.2 arm64. The data contain 120 reconciled snapshots across 10 launches and four measured phases. Every renderer showed 30 threads at 1440 × 900 CSS pixels and DPR 2, selected the same 29,389-character transcript through message 999, opened provider settings, and rendered the PTY marker. All hosts completed the finish phase and exited with code zero.

## Rendered workload latency

| Phase | Electron median, ms | Wry median, ms | Change in host medians | Median change within pairs |
| --- | ---: | ---: | ---: | ---: |
| Ready from bootstrap | 1,115.31 | 894.46 | −19.80% | −11.68% |
| Open saved transcript | 566.85 | 619.04 | +9.21% | +5.99% |
| Open provider settings | 298.13 | 297.77 | −0.12% | −0.76% |
| Open PTY through visible output | 172.48 | 349.38 | +102.57% | +98.09% |

The PTY took 66.85% to 106.82% longer in every pair. Transcript selection also exceeded +10% in pairs 1 and 3 (+10.04% and +15.06%). Instrumented startup includes Electron’s native viewport adjustment, which took 162.14–388.09 ms, with a 201.49 ms median. The main inspector closed before each first snapshot. The two hosts used different readiness and command delivery paths. The finish-command receipt took 1.07 ms on Electron and 27.74 ms on Wry. Total time from the finish command to observed exit was 208.17 ms and 70.64 ms, respectively. The finish command and shutdown have distinct transport and exit paths.

## Process footprint

Each run contributes the median of its three snapshots for that phase. Values below are the medians of the five runs for each host. Paired percentages are the medians of the five within-pair percentage differences, calculated from unrounded bytes.

| Phase | Electron physical, MiB | Wry physical, MiB | Change in host medians | Median paired change | Electron RSS, MiB | Wry RSS, MiB | Change in host medians | Median paired change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ready | 796.02 | 542.87 | −31.80% | −34.24% | 760.39 | 519.78 | −31.64% | −31.38% |
| Transcript | 1,142.09 | 690.82 | −39.51% | −40.42% | 884.33 | 605.44 | −31.54% | −31.50% |
| Settings | 1,346.23 | 781.68 | −41.94% | −42.05% | 956.09 | 698.42 | −26.95% | −26.53% |
| PTY | 1,426.18 | 1,067.96 | −25.12% | −24.02% | 1,020.77 | 736.84 | −27.81% | −27.33% |

Physical footprint is the kernel's charge to the app coalition. Summed live RSS can count shared mappings in multiple processes. These are sampled phase footprints. The experiment did not measure continuous peaks.

## CPU

The kernel ledger includes CPU consumed by exited helpers. The ready window runs from coalition creation to the third ready snapshot. Each later window runs from the previous phase’s third snapshot to the current phase’s third snapshot, including command delivery, rendering, fixed settling waits, and observation intervals. The settled percentages cover only the first-to-third snapshot interval within the named phase. A value of 100% corresponds to one core.

| Through phase | Electron window CPU, ms | Wry window CPU, ms | Change in host medians | Median paired change | Settled Electron, % of one core | Settled Wry, % of one core |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ready | 1,823.81 | 1,292.06 | −29.16% | −28.92% | 0.40 | 0.83 |
| Transcript | 972.53 | 763.61 | −21.48% | −21.17% | 13.51 | 4.24 |
| Settings | 487.40 | 528.59 | +8.45% | +10.74% | 0.38 | 0.97 |
| PTY | 486.17 | 502.73 | +3.41% | +0.69% | 12.35 | 8.67 |

Settled ready and settings CPU increased by 0.43 and 0.59 percentage points of one core. Relative changes in those short intervals have small denominators. Cumulative CPU through the last PTY snapshot was 3,788.10 ms on Electron and 3,056.01 ms on Wry by host median.

## Evidence and limits

All ten launchd jobs had distinct resource and jetsam coalition IDs. Every raw member count matched the kernel ledger before and after enumeration. Root process start identity stayed stable, all recorded members retired, and each Wry run included attributed WebKit content, GPU, networking, and Node processes. Fixture files, shared project, renderer hashes and the 69,460-file runtime fingerprint matched. The audit rehashed the retained observer and named staged artifacts. All ten scratch directories were removed; each Wry run recorded removal of its receipt-bound WebKit store. The summary JSON includes each raw receipt’s hash, the five measurements for each host and all paired differences.

The packaged app declares macOS 27.0 as its minimum. These direct launches on macOS 26.5.2 provide diagnostic evidence only. The Wry version retains Node, Pi and the web UI. Installer-size reduction, supported-platform release behavior, original Windows working-set targets and full Rust parity remain open. Campaign 11’s failed viewport comparisons are excluded from every statistic here.
