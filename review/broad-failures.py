"""Offline grading-receipt interpretation; never reads actor sessions or calls providers."""
import argparse
import collections
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
STATE = ROOT / '.suffice/broad-bench-v1'
OUT = ROOT / 'reports/broad-bench-v1/failures.json'
MODES = ('codexSolMedium', 'v1SolMedium', 'v2LunaHigh', 'v1LunaHigh')
ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


def normalize(value, limit=500):
    text = ANSI.sub('', str(value))
    text = re.sub(r'\b(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+)', '[redacted]', text)
    return re.sub(r'\s+', ' ', text).strip()[:limit]


def first_error(stdout, stderr):
    """Prefer structured assertion evidence over incidental warning/header lines."""
    for text in (stdout, stderr):
        candidates = [text.strip(), *reversed(text.splitlines())]
        for candidate in candidates:
            try:
                value = json.loads(candidate)
            except (ValueError, TypeError):
                continue
            if not isinstance(value, dict):
                continue
            failures = value.get('outcomes', value.get('failures', value.get('results', [])))
            if not isinstance(failures, list):
                continue
            for item in failures:
                if not isinstance(item, dict):
                    continue
                if item.get('passed') is False or item.get('error') or item.get('err') or item.get('status') == 'failed':
                    detail = item.get('error', item.get('err', item.get('message', '')))
                    if isinstance(detail, dict):
                        detail = detail.get('message', detail.get('stack', detail))
                    return normalize(f"{item.get('name', item.get('fullTitle', item.get('title', '')))}: {detail}")
    lines = [line.strip() for line in ANSI.sub('', stderr + '\n' + stdout).splitlines() if line.strip()]
    marker = re.compile(r'AssertionError|(?:^|\s)(?:Error|TypeError|SyntaxError|ReferenceError):|^not ok\b|ERR_ASSERTION|\b(?:failed|failing)\b|^\s*[✘×]\s', re.I)
    for index, line in enumerate(lines):
        if marker.search(line):
            return normalize(' '.join(lines[index:index + 3]))
    return normalize(' '.join(lines[-3:])) if lines else None


def command_receipt(folder, fallback, phase_passed):
    file = folder / 'execution-result.json'
    missing = []
    if file.exists():
        execution = read(file)
    else:
        missing.append(file.name)
        execution = {}
    exit_code = execution.get('exitCode', fallback.get('exit'))
    resource = execution.get('resourceStop', fallback.get('resource'))
    limited = execution.get('outputLimited', False)
    if resource:
        category = 'resource_stop:' + normalize(resource, 100)
    elif limited:
        category = 'output_limit'
    elif exit_code is None:
        category = 'missing_exit_status'
    elif exit_code in (124, 137, -9, -15):
        category = 'timeout_or_signal_exit:' + str(exit_code)
    elif exit_code != 0:
        category = ('accepted_native_nonzero_exit:' if phase_passed else 'nonzero_exit:') + str(exit_code)
    elif phase_passed is False:
        category = 'semantic_native_verdict_failed'  # e.g. changed known Mocha failure set
    else:
        category = 'passed'
    failed = category != 'passed' and not category.startswith('accepted_native_nonzero_exit:')
    detail = None
    if failed:
        texts = []
        for name in ('process-stdout.txt', 'process-stderr.txt'):
            p = folder / name
            if p.exists():
                texts.append(p.read_text(encoding='utf8', errors='replace'))
            else:
                missing.append(name)
                texts.append('')
        detail = first_error(*texts)
    return {'receipt': folder.relative_to(STATE).as_posix(), 'exitCode': exit_code,
            'resourceStop': resource, 'outputLimited': limited, 'category': category,
            'failed': failed, 'firstError': detail, 'missingReceiptFiles': missing}


def build(state):
    global STATE
    STATE = state
    expected = {f'b{i:02d}-{mode}' for i in range(1, 16) for mode in MODES}
    found = {p.parent.name: p for p in (state / 'attempts').glob('*/result.json')}
    rows = []
    for name in sorted(found):
        result = read(found[name])
        grading_folder = state / 'grading' / name
        grade_file = grading_folder / 'grade.json'
        grade = read(grade_file) if grade_file.exists() else result.get('grading', {})
        native_passed = grade.get('nativePassed')
        native = [command_receipt(grading_folder / f'native-{i}', item, native_passed)
                  for i, item in enumerate(grade.get('native', []))]
        hidden = [command_receipt(grading_folder / f'hidden-{i}', item, None)
                  for i, item in enumerate(grade.get('hidden', []))]
        reasons = []
        if result.get('operationalFailure'):
            reasons.append('operational_failure')
        if result.get('resourceStop'):
            reasons.append('actor_resource_stop:' + normalize(result['resourceStop'], 100))
        if result.get('budgetEligible') is False:
            reasons.append('policy_ineligible')
        if result.get('costUnknown'):
            reasons.append('cost_unknown')
        if native_passed is False:
            reasons.append('public_checks_failed')
        if any(x['failed'] for x in hidden):
            reasons.append('hidden_checks_failed')
        if not grade_file.exists():
            reasons.append('missing_grade_receipt')
        if not hidden:
            reasons.append('missing_hidden_command_summary')
        rows.append({'attempt': name, 'id': result.get('id'), 'mode': result.get('mode'),
                     'repository': result.get('repository'), 'issue': result.get('issue'),
                     'status': result.get('status'), 'rawAcceptance': result.get('accepted'),
                     'success': result.get('success'), 'budgetEligible': result.get('budgetEligible'),
                     'operationalFailure': result.get('operationalFailure'),
                     'nativePassed': native_passed, 'gradeAccepted': grade.get('accepted'),
                     'attemptGradeAcceptanceMatches': result.get('accepted') == grade.get('accepted'),
                     'categories': reasons or ['accepted'], 'native': native, 'hidden': hidden,
                     'firstError': next((x['firstError'] for x in native + hidden if x['failed'] and x['firstError']), None)})
    return {'scope': 'Observer-only interpretation of downloaded attempt result and isolated grading receipts. No actor transcripts, provider calls, source edits, or causal claims.',
            'expectedAttempts': 60, 'completedAttempts': len(found), 'complete': set(found) == expected,
            'missingAttempts': sorted(expected - set(found)), 'unexpectedAttempts': sorted(set(found) - expected),
            'summaryByMode': {mode: {'attempts': sum(r['mode'] == mode for r in rows),
                'categories': dict(collections.Counter(category for r in rows if r['mode'] == mode for category in r['categories']))}
                for mode in MODES}, 'attempts': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-partial', action='store_true')
    args = parser.parse_args()
    report = build(STATE)
    if not report['complete'] and not args.allow_partial:
        raise SystemExit(f"Refusing incomplete export: {report['completedAttempts']}/60 results; pass --allow-partial explicitly.")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=True) + '\n', encoding='utf8')
    print(json.dumps({'completed': report['completedAttempts'], 'complete': report['complete'], 'output': str(OUT)}))


if __name__ == '__main__':
    main()
