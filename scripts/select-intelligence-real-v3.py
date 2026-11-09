"""Freeze the real-issue cohort from the pinned public CSV, before main inference.

Usage: python scripts/select-intelligence-real-v3.py PATH_TO_POLY_FULL_CSV
No third-party Python dependencies or model calls.
"""
import ast
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

REVISION = 'd56445f9940eae4e9d2974ec66820c2f1d7754e6'
CSV_SHA256 = '17ad661b20e9af1e2067fbbc2e2658a21137d56693570d1d07f966d8bc0408b7'
SEED = 'real-v3/20261109/'
COMPLEX = {
    599: 'Coordinate textarea value handling across DOM bindings, code generation and rendering.',
    605: 'Support computed property expressions in two-way bindings across compiler stages.',
    709: 'Repair binding observer initialization and component lifecycle ordering across generators.',
    835: 'Handle conditional default slots and empty-fragment mounting across block generators.',
    889: 'Implement destructured each-block bindings across parsing, validation and generation.',
    1345: 'Implement destructured computed-property parameters and dependency handling across compiler stages.',
    1493: 'Repair nested transition state across conditional branches and generated block lifecycles.',
    1529: 'Preserve input focus when nested transition lifecycles revisit existing DOM blocks.',
}
EXCLUDED = {
    1049: 'Previously inspected calibration candidate; keep separate from the main cohort.',
    1190: 'Scored calibration issue, with formatting-sensitive targets.',
    1428: 'Scored runtime calibration issue; not a main holdout.',
    1377: 'Issue proposes several incompatible current-state syntaxes without a settled contract.',
    1448: 'Issue proposes an initial-transition directive without settling its syntax.',
    1498: 'Issue only names another transition bug and links a REPL; no self-contained behavior.',
    1050: 'Warning-oriented change does not meet the multi-stage implementation rationale.',
    1052: 'Unused-symbol diagnostics do not meet the multi-stage implementation rationale.',
}
source = Path(sys.argv[1])
with source.open('rb') as handle:
    if hashlib.file_digest(handle, 'sha256').hexdigest() != CSV_SHA256:
        raise SystemExit('Pinned dataset content mismatch')
csv.field_size_limit(50 * 1024**2)
candidates = {category: [] for category in ['simple', 'cross-file', 'complex']}
with source.open(encoding='utf-8', newline='') as handle:
    for row in csv.DictReader(handle):
        if row['repo'] != 'sveltejs/svelte':
            continue
        number = int(float(row['pull_number']))
        if number in EXCLUDED or not (835 <= number <= 1700 or number in COMPLEX):
            continue
        targets = ast.literal_eval(row['F2P'] or '[]')
        runtime = [title for title in targets if title.startswith('runtime ')]
        if not runtime:
            continue
        paths = [path for path in re.findall(r'^diff --git a/\S+ b/(\S+)', row['patch'], re.M)
                 if path.startswith('src/') and not path.endswith('/__test__.js')]
        # Keep this first cohort within the audited production-source boundary.
        all_paths = re.findall(r'^diff --git a/\S+ b/(\S+)', row['patch'], re.M)
        if len(paths) != len(all_paths) or not paths:
            continue
        category = 'simple' if len(paths) == 1 else 'cross-file' if len(paths) <= 3 else 'complex'
        if category == 'complex' and number not in COMPLEX:
            continue
        row['FAIL_TO_PASS'] = targets
        row['PASS_TO_PASS'] = ast.literal_eval(row.pop('P2P') or '[]')
        row.pop('F2P')
        row['evaluation'] = {
            'category': category,
            'productionFiles': paths,
            'patchDiffLines': len(row['patch'].splitlines()),
            'runtimeTargets': runtime,
            'otherTargets': [title for title in targets if title not in runtime],
            'difficultyRationale': COMPLEX.get(number, 'Local production change in one file; semantic difficulty is not inferred from patch size.' if category == 'simple' else 'Coordinated production changes in two or three files; semantic difficulty is not inferred from patch size.'),
            'provenance': {'dataset': 'AmazonScience/SWE-PolyBench', 'revision': REVISION, 'csvSha256': CSV_SHA256},
        }
        candidates[category].append(row)

destination = Path('benchmarks/intelligence-real-v3')
destination.mkdir(parents=True, exist_ok=True)
tasks = []
for category, rows in candidates.items():
    rows.sort(key=lambda row: hashlib.sha256((SEED + row['instance_id']).encode()).hexdigest())
    if len(rows) < 8:
        raise SystemExit('Insufficient prospectively eligible tasks: ' + category)
    for row in rows[:8]:
        target = destination / (row['instance_id'] + '.json')
        payload = (json.dumps(row, indent=2, ensure_ascii=True) + '\n').encode()
        if target.exists() and target.read_bytes() != payload:
            raise SystemExit('Refusing to mutate frozen task: ' + str(target))
        target.write_bytes(payload)
        tasks.append({'id': row['instance_id'], 'category': category, 'record': target.name,
                      'recordSha256': hashlib.sha256(payload).hexdigest(), **row['evaluation']})
manifest = {
    'version': 1, 'phase': 'prospective-real-cohort', 'seed': SEED,
    'dataset': {'revision': REVISION, 'csvSha256': CSV_SHA256},
    'tasks': tasks,
    'excludedBeforeMainInference': EXCLUDED,
    'policy': [
        'Freeze all 24 tasks before any main model attempt; do not filter by model outcomes.',
        'Report failed empty/reference infrastructure or contract gates separately, preserving planned cells.',
        'Retain all official F2P and P2P titles; runtime target counts are supplemental diagnostics.',
        'One repository family and correlated issue clusters limit generalization and uncertainty estimates.',
        'Issue locality and upstream patch breadth are category proxies, not calibrated hardness measurements.',
        'Calibration cases and the earlier saturated synthetic suite are excluded.',
    ],
}
payload = (json.dumps(manifest, indent=2) + '\n').encode()
path = destination / 'cohort.json'
if path.exists() and path.read_bytes() != payload:
    raise SystemExit('Refusing to mutate frozen cohort')
path.write_bytes(payload)
print(json.dumps([{'id': task['id'], 'category': task['category']} for task in tasks]))
