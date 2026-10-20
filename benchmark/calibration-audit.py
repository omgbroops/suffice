"""Read-only integrity audit of completed calibration inputs and accounting."""
import hashlib
import json
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location

ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location('calibration_report', ROOT / 'benchmark/calibration-report.py')
report = module_from_spec(spec)
spec.loader.exec_module(report)
STATE, OUT = report.STATE, report.OUT


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    manifest = json.loads((STATE / 'manifest.json').read_text())
    data = json.loads((OUT / 'results.json').read_text())
    assert data['complete'] and (STATE / 'campaign-complete.json').exists()
    expected = {(job['task'], job['arm']) for job in manifest['jobs']}
    actual = {(row['task'], row['arm']) for row in data['attempts']}
    assert actual == expected and len(data['attempts']) == len(expected) == 32
    counts = {}
    for field, base in [('runtimeInputs', STATE / 'runtime'),
                        ('baselineInputs', STATE / 'baseline'),
                        ('publicInputs', STATE)]:
        for name, value in manifest[field].items():
            assert digest(base / name) == value, name
        counts[field] = len(manifest[field])
    dataset = STATE.parent / 'suffice-harnesstax-sol61/dataset'
    for task in manifest['tasks']:
        for name, field in [('instruction.md', 'instructionSha256'), ('task.toml', 'taskSha256')]:
            assert digest(dataset / task['id'] / name) == task[field]
    assert digest(ROOT / 'benchmark/calibration-plan.md') == manifest['planSha256']
    for row in data['attempts']:
        assert row['identity'], (row['task'], row['arm'])
        receipt_state = STATE / row.get('receiptStateRelative','')
        base = receipt_state / 'trials' / (row['task'] + '-' + row['arm'])
        assert digest(base / 'agent/receipts/worker.json') == row['workerSha256']
        assert digest(receipt_state / 'results' / (row['task'] + '-' + row['arm'] + '.json')) == row['trialResultSha256']
        if not row['costUnknown']:
            assert row['receiptsMatched'] and row['costUsd'] == row['knownCostUsd']
        else:
            assert row['costUsd'] is None
        if row['arm'] != 'pi':
            assert abs(sum(stage['usage']['estimatedApiUsd'] for stage in row['stages']) - row['knownCostUsd']) < 1e-9
    for row in data['excludedInfrastructureAttempts']:
        name = row['task']+'-'+row['arm']
        assert digest(STATE/'trials'/name/'agent/receipts/worker.json') == row['workerSha256']
        assert digest(STATE/'results'/(name+'.json')) == row['trialResultSha256']
    value = {
        'attempts': len(actual), 'allGraded': all(row['graded'] for row in data['attempts']),
        'ungradedAttempts': [row['task'] + '-' + row['arm'] for row in data['attempts'] if not row['graded']],
        'allModelIdentitiesMatched': True,
        'inputHashesMatched': counts, 'taskHashesMatched': len(manifest['tasks']),
        'knownCostUsd': sum(row['knownCostUsd'] for row in data['attempts']),
        'excludedKnownCostUsd': data['excludedKnownCostUsd'],
        'totalCampaignKnownSpendUsd': data['totalKnownSpendIncludingExcludedUsd'],
        'excludedOriginals': len(data['excludedInfrastructureAttempts']),
        'totalCampaignUnknownCosts': data['totalUnknownCostsIncludingExcluded'],
        'unknownWholeAttemptCosts': [row['task'] + '-' + row['arm'] for row in data['attempts'] if row['costUnknown']],
        'manifestSha256': digest(STATE / 'manifest.json'),
        'sourceHead': manifest['sourceHead'], 'baselineCommit': manifest['baselineCommit'],
        'note': 'No hidden grader content inspected. Unknown costs remain floors; this audit does not recover unreported provider usage.'
    }
    (OUT / 'completion-audit.json').write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(value))


if __name__ == '__main__':
    main()
