"""Offline supplemental observer analysis. Never imports actor code or invokes providers.

Run after final receipt export and broad-report.py. Default refuses partial campaigns
and an existing analysis.json, so a live report is never silently overwritten.
"""
import argparse
import collections
import itertools
import json
import math
import pathlib
import statistics

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


def event_counts(events, native=False):
    requests = [e for e in events if e.get('type') == 'provider_request']
    assistants = [e for e in events if e.get('type') == 'assistant']
    usage = {}
    duplicates = conflicts = 0
    anonymous = 0
    for event in events:
        if event.get('type') != 'provider_usage':
            continue
        response_id = event.get('responseId')
        if not response_id:
            anonymous += 1
            continue
        key = response_id
        if key in usage:
            duplicates += 1
            conflicts += usage[key].get('usage') != event.get('usage')
        usage[key] = event
    error_rows = [e for e in assistants if e.get('error') or e.get('stopReason') in ['error', 'aborted']]
    return {
        'providerRequestAttempts': None if native else len(requests),
        'requestObservation': 'unobserved_native_cli' if native else 'before_provider_request_events',
        'rawUsageResponses': len(usage),
        'rawUsageEventRows': sum(e.get('type') == 'provider_usage' for e in events),
        'duplicateRawUsageRows': duplicates,
        'conflictingRawUsageRows': conflicts,
        'rawUsageRowsWithoutResponseId': anonymous,
        'assistantEventRows': len(assistants),
        'assistantErrorOrAbortedRows': len(error_rows),
        'assistantRowsMinusRawUsageResponses': len(assistants) - len(usage),
        'requestsWithoutUsageCountDifference': None if native else len(requests) - len(usage),
        'note': 'Assistant rows, including synthetic error rows, are not billed-call counts. A raw usage response may itself be failed or interrupted; usage does not establish completion. Missing usage never means zero charge.',
    }


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def capacity_failure(text):
    return any(word in text.lower() for word in ['at capacity', 'overload', 'model_capacity'])


def cost_summary(rows):
    known = [r.get('knownCostUsd') for r in rows]
    unknown = sum(bool(r.get('costUnknown')) or not numeric(r.get('totalCostUsd')) for r in rows)
    lower = sum(v for v in known if numeric(v))
    exact = None if unknown else sum(r['totalCostUsd'] for r in rows)
    success = sum(bool(r.get('success')) for r in rows)
    accepted = sum(bool(r.get('accepted')) for r in rows)
    return {
        'attempts': len(rows), 'rawAccepted': accepted, 'policySuccesses': success,
        'allAttemptKnownCostLowerBoundUsd': lower,
        'unknownCostAttempts': unknown,
        'missingKnownCostFields': sum(not numeric(v) for v in known),
        'allAttemptTotalCostUsd': exact,
        'costPerRawAcceptedTaskUsd': None if unknown or not accepted else exact / accepted,
        'costPerPolicySuccessUsd': None if unknown or not success else exact / success,
        'costPerRawAcceptedLowerBoundUsd': lower / accepted if accepted else None,
        'costPerPolicySuccessLowerBoundUsd': lower / success if success else None,
        'statusCounts': dict(collections.Counter(r.get('status', 'missing') for r in rows)),
        'budgetIneligibleAttempts': sum(r.get('budgetEligible') is not True for r in rows),
        'operationalFailureAttempts': sum(bool(r.get('operationalFailure')) for r in rows),
    }


def compare(left, right):
    pairs = [(left[k], right[k]) for k in sorted(left.keys() & right.keys())]
    complete_cost = all(not a.get('costUnknown') and not b.get('costUnknown') and numeric(a.get('totalCostUsd')) and numeric(b.get('totalCostUsd')) for a, b in pairs)
    a_cost = sum(a['knownCostUsd'] for a, b in pairs if numeric(a.get('knownCostUsd')))
    b_cost = sum(b['knownCostUsd'] for a, b in pairs if numeric(b.get('knownCostUsd')))
    exact_a = sum(a['totalCostUsd'] for a, b in pairs) if complete_cost else None
    exact_b = sum(b['totalCostUsd'] for a, b in pairs) if complete_cost else None
    def outcomes(key):
        return dict(collections.Counter(('both_pass' if a.get(key) and b.get(key) else 'left_only' if a.get(key) else 'right_only' if b.get(key) else 'both_fail') for a, b in pairs))
    return {
        'pairedIssues': len(pairs), 'ids': sorted(left.keys() & right.keys()),
        'rawAcceptance': outcomes('accepted'), 'policySuccess': outcomes('success'),
        'leftAllAttemptCostLowerBoundUsd': a_cost, 'rightAllAttemptCostLowerBoundUsd': b_cost,
        'exactPairedCostsKnown': complete_cost,
        'leftToRightExactCostRatio': exact_a / exact_b if pairs and complete_cost and exact_b else None,
        'medianLeftMinusRightLatencySeconds': statistics.median((a['latencyMs'] - b['latencyMs']) / 1000 for a, b in pairs) if pairs else None,
        'latencyNote': 'Includes every observed attempt, including provider failures and budget stops; not a completed-success-only speed comparison.',
    }


def analyze(state, reports, allow_partial=False):
    manifest = read(state / 'manifest.json')
    if not (reports / 'export-manifest.json').exists():
        raise RuntimeError('Final filtered receipt export required')
    rows, malformed = [], []
    for job in manifest['jobs']:
        name = job['id'] + '-' + job['mode']
        folder = state / 'attempts' / name
        if not (folder / 'result.json').exists():
            continue
        result = read(folder / 'result.json')
        worker = read(folder / 'worker/worker.json')
        events = []
        for path in sorted((folder / 'worker').rglob('*.jsonl')):
            if path.name != 'events.live.jsonl' and path.parent.name != 'events':
                continue
            for number, line in enumerate(path.read_text(encoding='utf8').splitlines(), 1):
                if not line:
                    continue
                try:
                    events.append({**json.loads(line), '_file': str(path.relative_to(folder))})
                except ValueError:
                    malformed.append({'attempt': name, 'file': str(path.relative_to(folder)), 'line': number})
        counts = event_counts(events, native=job['mode'] == 'codexSolMedium')
        # Count failed attempts, not duplicated CLI error + turn.failed messages.
        strings = json.dumps({'errors': worker.get('errors'), 'stages': worker.get('stages'), 'notes': worker.get('notes'), 'error': worker.get('error'), 'assistantErrors': [e.get('error') for e in events if e.get('type') == 'assistant']}).lower()
        capacity = capacity_failure(strings)
        reasons = [worker.get('status'), worker.get('stopReason'), worker.get('reason'), result.get('resourceStop')]
        reasons += [x.get('stopReason') or x.get('error') for x in worker.get('stages', [])]
        reasons += [x.get('error') for x in worker.get('notes', [])]
        budget_reasons = sorted({str(x) for x in reasons if x and any(term in str(x).lower() for term in ['cost_limit', 'turn_limit', 'tool_limit', 'timeout', 'budget', 'allowance'])})
        rows.append({**result, 'attempt': name, 'receiptCounts': counts, 'providerCapacityFailure': capacity, 'budgetStopReasons': budget_reasons})
    if len(rows) != len(manifest['jobs']) and not allow_partial:
        raise RuntimeError(f'Campaign incomplete: {len(rows)}/{len(manifest["jobs"])}; no report written')
    arms = {}
    for mode in manifest['arms']:
        selected = [r for r in rows if r['mode'] == mode]
        counts = [r['receiptCounts'] for r in selected]
        native = mode == 'codexSolMedium'
        arms[mode] = {
            **cost_summary(selected),
            'providerRequestAttempts': None if native else sum(c['providerRequestAttempts'] for c in counts),
            'rawUsageResponses': sum(c['rawUsageResponses'] for c in counts),
            'assistantEventRows': sum(c['assistantEventRows'] for c in counts),
            'assistantErrorOrAbortedRows': sum(c['assistantErrorOrAbortedRows'] for c in counts),
            'providerCapacityFailureAttempts': sum(r['providerCapacityFailure'] for r in selected),
            'observedBudgetStopAttempts': sum(bool(r['budgetStopReasons']) for r in selected),
            'budgetStopReasons': dict(collections.Counter(reason for r in selected for reason in r['budgetStopReasons'])),
        }
    pairs = {}
    for a, b in itertools.combinations(manifest['arms'], 2):
        left = {r['id']: r for r in rows if r['mode'] == a}
        right = {r['id']: r for r in rows if r['mode'] == b}
        pairs[a + '__vs__' + b] = compare(left, right)
    previous = {}
    for name in ['summary.json', 'audit.json']:
        path = reports / name
        if path.exists():
            value = read(path)
            previous[name] = {'completed': value.get('completed'), 'allChecksPassed': value.get('allChecksPassed'), 'auditMatches': value.get('auditMatches')}
    return {
        'schema': 'broad-observer-analysis-v1', 'planned': len(manifest['jobs']), 'observedAttempts': len(rows),
        'scope': manifest.get('scope'), 'allAttempts': cost_summary(rows), 'arms': arms,
        'pairedComparisons': pairs, 'malformedReceiptLines': malformed, 'priorReports': previous,
        'attempts': rows,
        'interpretation': 'All observed attempts retained. Historical public issues are not claimed training-unseen. One attempt per issue/arm; paired results are descriptive, not population accuracy estimates. Unknown whole-attempt costs remain unknown even where recorded response usage is exactly priced.',
    }


def self_test():
    events = [{'type': 'provider_request'}, {'type': 'provider_usage', 'responseId': 'r1', 'usage': {'output_tokens': 1}}, {'type': 'provider_usage', 'responseId': 'r1', 'usage': {'output_tokens': 1}}, {'type': 'assistant'}, {'type': 'provider_request'}, {'type': 'assistant', 'stopReason': 'error', 'error': 'capacity'}]
    value = event_counts(events)
    assert (value['providerRequestAttempts'], value['rawUsageResponses'], value['assistantEventRows'], value['assistantErrorOrAbortedRows'], value['duplicateRawUsageRows']) == (2, 1, 2, 1, 1)
    assert event_counts(events, native=True)['providerRequestAttempts'] is None
    duplicated = [{'type': 'provider_usage', 'responseId': 'global1', 'usage': {'output_tokens': 2}, '_file': file} for file in ['solve/events.jsonl', 'duplicate/events.jsonl']]
    assert event_counts(duplicated)['rawUsageResponses'] == 1
    assert event_counts(duplicated)['duplicateRawUsageRows'] == 1
    assert capacity_failure('Our servers are currently overloaded')
    assert capacity_failure('Selected model is at capacity. Please try a different model.')
    assert not capacity_failure('Malformed JSON response')
    row = {'knownCostUsd': 0.03, 'totalCostUsd': None, 'costUnknown': True, 'accepted': True, 'success': False, 'latencyMs': 1000}
    assert cost_summary([row])['allAttemptTotalCostUsd'] is None
    assert cost_summary([row])['allAttemptKnownCostLowerBoundUsd'] == 0.03
    assert compare({'b01': row}, {'b01': row})['leftToRightExactCostRatio'] is None
    print('PASS supplemental observer edge cases: cross-file duplicate usage, actual capacity messages, synthetic error, unobserved native requests, unknown cost, paired ratio')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=pathlib.Path, default=ROOT / '.suffice/broad-bench-v1')
    parser.add_argument('--reports', type=pathlib.Path, default=ROOT / 'reports/broad-bench-v1')
    parser.add_argument('--allow-partial', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        output = args.reports / 'analysis.json'
        if output.exists():
            raise SystemExit('Existing analysis.json preserved; choose another --reports directory')
        value = analyze(args.state, args.reports, args.allow_partial)
        args.reports.mkdir(parents=True, exist_ok=True)
        with output.open('x', encoding='utf8') as stream:
            stream.write(json.dumps(value, indent=2) + '\n')
        print(json.dumps({'output': str(output), 'observedAttempts': value['observedAttempts'], 'arms': value['arms']}))
