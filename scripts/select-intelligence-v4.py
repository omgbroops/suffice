"""Freeze a disjoint, three-family cohort without consulting model outcomes."""
import ast
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

REVISION = 'd56445f9940eae4e9d2974ec66820c2f1d7754e6'
CSV_SHA256 = '17ad661b20e9af1e2067fbbc2e2658a21137d56693570d1d07f966d8bc0408b7'
SEED = 'suffice-v4/20261109/'
QUOTAS = {
    'prettier/prettier': {'simple': 1, 'cross-file': 4, 'complex': 4},
    'serverless/serverless': {'simple': 1, 'cross-file': 5, 'complex': 4},
    'mrdoob/three.js': {'simple': 2, 'cross-file': 3, 'complex': 0},
}
EXCLUDED = {
    'serverless__serverless-6427': 'Near-overlapping credential-validation contract with the hash-selected simple issue 6977; reduce within-family duplication.',
    'serverless__serverless-6057': 'Original proposal suggests an API name different from the later accepted interface; no settled self-contained configuration contract.',
    'mrdoob__three.js-22404': 'Asks about a buffer-attribute alternative without specifying the later method name; avoid judging an unstated API choice.',
    'mrdoob__three.js-21826': 'Requests remove() with no arguments, while the reference adds a differently named API; underspecified acceptance contract.',
    'mrdoob__three.js-20478': 'Proposes removeAll or clear without settling the name.',
    'mrdoob__three.js-14566': 'Hysteresis proposal does not settle the new API or threshold units.',
}


def production(path):
    return (bool(re.search(r'\.(?:mjs|cjs|js|jsx|ts|tsx)$', path))
            and not re.search(r'(^|/)(?:test|tests|__tests__|fixtures|__snapshots__|docs|changelog_unreleased|scripts)(/|$)|\.(?:test|spec)\.|\.d\.ts$', path)
            and not path.startswith('.') and not path.endswith('.config.js'))


source = Path(sys.argv[1] if len(sys.argv) > 1 else '.suffice/hard-eval-research/poly-full.csv')
with source.open('rb') as stream:
    if hashlib.file_digest(stream, 'sha256').hexdigest() != CSV_SHA256:
        raise SystemExit('Pinned dataset bytes differ')
csv.field_size_limit(50 * 1024**2)
groups = {(repo, category): [] for repo in QUOTAS for category in QUOTAS[repo]}
with source.open(encoding='utf-8', newline='') as stream:
    for row in csv.DictReader(stream):
        repo, task = row['repo'], row['instance_id']
        if repo not in QUOTAS or task in EXCLUDED:
            continue
        number = int(task.rsplit('-', 1)[1])
        if repo == 'prettier/prettier' and not 7000 <= number <= 14000:
            continue
        if repo == 'serverless/serverless' and not 4000 <= number <= 10000:
            continue
        files = [path for path in re.findall(r'^diff --git a/\S+ b/(\S+)', row['patch'], re.M) if production(path)]
        if not files:
            continue
        category = 'simple' if len(files) == 1 else 'cross-file' if len(files) <= 3 else 'complex'
        targets, regressions = ast.literal_eval(row['F2P'] or '[]'), ast.literal_eval(row['P2P'] or '[]')
        if not targets or not regressions or not row['test_patch'].strip():
            continue
        if 'diff --git ' in row['problem_statement']:
            continue
        row['FAIL_TO_PASS'], row['PASS_TO_PASS'] = targets, regressions
        row['evaluation'] = {'category': category, 'productionFiles': files,
                             'patchDiffLines': len(row['patch'].splitlines())}
        groups[(repo, category)].append(row)

private = Path('.suffice/intelligence-v4/records')
public = Path('benchmarks/intelligence-v4')
private.mkdir(parents=True, exist_ok=True)
public.mkdir(parents=True, exist_ok=True)
tasks = []
for repo, categories in QUOTAS.items():
    for category, count in categories.items():
        rows = sorted(groups[(repo, category)], key=lambda row: hashlib.sha256((SEED + row['instance_id']).encode()).hexdigest())
        if len(rows) < count:
            raise SystemExit('Insufficient eligible tasks for ' + repo + '/' + category)
        for row in rows[:count]:
            task = row['instance_id']
            record = (json.dumps(row, indent=2, ensure_ascii=True) + '\n').encode()
            path = private / (task + '.json')
            if path.exists() and path.read_bytes() != record:
                raise SystemExit('Refusing to mutate sealed private record ' + task)
            path.write_bytes(record)
            tasks.append({'id': task, 'repo': repo, 'category': category, 'baseCommit': row['base_commit'],
                          'recordSha256': hashlib.sha256(record).hexdigest(), 'problemSha256': hashlib.sha256(row['problem_statement'].encode()).hexdigest(),
                          'testPatchSha256': hashlib.sha256(row['test_patch'].encode()).hexdigest(),
                          'referencePatchSha256': hashlib.sha256(row['patch'].encode()).hexdigest(),
                          'targetLabels': len(row['FAIL_TO_PASS']), 'regressionLabels': len(row['PASS_TO_PASS']),
                          'productionFiles': row['evaluation']['productionFiles'],
                          'patchDiffLines': row['evaluation']['patchDiffLines'], 'title': row['problem_statement'].splitlines()[0],
                          'sourceIssue': 'https://github.com/' + repo + '/pull/' + task.rsplit('-', 1)[1],
                          'limitations': ['Public historical issue; foundation-model training contamination cannot be ruled out.',
                                          'Category uses audited change breadth, not an established semantic difficulty scale.',
                                          'Held-out tests verify their named contracts, not complete behavioral correctness.',
                                          'Task families and central source files create correlations.']})
manifest = {'version': 1, 'phase': 'prospective-v4', 'seed': SEED,
            'dataset': {'name': 'AmazonScience/SWE-PolyBench', 'revision': REVISION, 'csvSha256': CSV_SHA256},
            'quotas': QUOTAS, 'exclusionsBeforeInference': EXCLUDED, 'tasks': tasks,
            'privateRecords': 'Not committed or copied into agent workspaces. Reconstruct from the SHA-pinned CSV in the host-only evaluator.',
            'selectionPolicy': 'Hash order within prespecified repository/category quotas, subject to public-contract and duplicate exclusions. No primary model outcomes used.'}
payload = (json.dumps(manifest, indent=2, ensure_ascii=True) + '\n').encode()
path = public / 'cohort.json'
if path.exists() and path.read_bytes() != payload:
    raise SystemExit('Refusing to replace frozen primary cohort')
path.write_bytes(payload)
print(json.dumps({'tasks': len(tasks), 'categories': {category: sum(t['category'] == category for t in tasks) for category in ['simple', 'cross-file', 'complex']},
                  'families': {repo: sum(t['repo'] == repo for t in tasks) for repo in QUOTAS}, 'ids': [t['id'] for t in tasks]}))
