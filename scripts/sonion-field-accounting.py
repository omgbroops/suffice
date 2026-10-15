"""Independent, provisional receipt accounting. Run on Sonion, never calls a model.

Reads immutable v1/v2 attempts without importing either evaluator. Writes its own
normalized dataset and report; it never rewrites an attempt, grade, or verdict.
Pricing comes from the model metadata recorded at worker startup, not a web price
guess. Amounts are API-equivalent estimates for subscription-backed inference.
"""
import argparse
import collections
import datetime as dt
from decimal import Decimal
import hashlib
import json
import pathlib
import re

COMPONENTS = ('input', 'cacheRead', 'cacheWrite', 'output')
TOKENS = (*COMPONENTS, 'totalTokens')
EXPECTED_MODEL = 'gpt-6.1-sol'
V1_RETAIN = {'s02', 's03', 'q01', 'q02'}
V2_RETAIN = {'i01', 'i02', 'i03', 'i04', 's01', 'l01', 'l02', 'l03', 'q04'}
V1_INVALID_ENVIRONMENT = {'i01', 'i02', 'i04'}
SETUP_PATTERN = re.compile(r'Cannot find module|ERR_MODULE_NOT_FOUND|ERR_WORKER_INIT_FAILED|bwrap:|Missing trusted launcher|ENOENT[^\n]*(?:node_modules|/runtime|/node|SUFFICE_BOUNDARY)')


def dec(value):
    return Decimal(str(value))


def number(value):
    return float(value) if isinstance(value, Decimal) else value


class Audit:
    def __init__(self, root):
        self.root = root.resolve()
        self.inputs = {}

    def bytes(self, path):
        try:
            data = path.read_bytes()
        except FileNotFoundError:
            return None
        self.inputs[str(path.relative_to(self.root))] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        return data

    def json(self, path):
        data = self.bytes(path)
        if data is None:
            return None
        try:
            return json.loads(data)
        except (ValueError, UnicodeDecodeError):
            return {'_parseError': True}

    def events(self, path):
        data = self.bytes(path)
        if data is None:
            return [], []
        events, errors = [], []
        lines = data.splitlines()
        for index, line in enumerate(lines, 1):
            if not line.strip():
                continue
            try:
                event = json.loads(line)
                event['_line'] = index
                events.append(event)
            except (ValueError, UnicodeDecodeError):
                errors.append({'line': index, 'lastLine': index == len(lines), 'bytes': len(line)})
        return events, errors

    def grade_indicators(self, run, grade):
        found = []
        for category in ('native', 'acceptance'):
            for index, result in enumerate((grade or {}).get(category, [])):
                if result.get('exitCode') == 0:
                    continue
                for stream in ('stderr', 'stdout'):
                    path = run / 'grade' / f'{category}-{index}' / f'process-{stream}.txt'
                    data = self.bytes(path)
                    if data is None:
                        continue
                    text = data.decode('utf8', errors='replace')
                    matches = [line[:500] for line in text.splitlines() if SETUP_PATTERN.search(line)]
                    if matches:
                        found.append({'category': category, 'index': index, 'stream': stream, 'matches': matches[:8]})
        return found


def raw_tokens(usage):
    if not isinstance(usage, dict) or not all(isinstance(usage.get(k), (int, float)) for k in ('input_tokens', 'output_tokens')):
        return None
    details = usage.get('input_tokens_details') or {}
    read, write = details.get('cached_tokens', 0), details.get('cache_write_tokens', 0)
    values = {'input': usage['input_tokens'] - read - write, 'cacheRead': read,
              'cacheWrite': write, 'output': usage['output_tokens'],
              'totalTokens': usage.get('total_tokens', usage['input_tokens'] + usage['output_tokens']),
              'reasoning': (usage.get('output_tokens_details') or {}).get('reasoning_tokens', 0)}
    return values if all(isinstance(x, (int, float)) and x >= 0 for x in values.values()) else None


def price(tokens, pricing):
    if not tokens or not pricing or not all(isinstance(pricing.get(k), (int, float)) for k in COMPONENTS):
        return None
    rates = {k: pricing[k] for k in COMPONENTS}
    total_input = sum(tokens[k] for k in ('input', 'cacheRead', 'cacheWrite'))
    tier = None
    for item in sorted(pricing.get('tiers', []), key=lambda x: x.get('inputTokensAbove', 0)):
        if total_input > item.get('inputTokensAbove', float('inf')):
            rates.update({k: item[k] for k in COMPONENTS if k in item})
            tier = item.get('inputTokensAbove')
    costs = {k: dec(tokens[k]) * dec(rates[k]) / Decimal(1_000_000) for k in COMPONENTS}
    return {'components': costs, 'total': sum(costs.values()), 'ratesPerMillion': rates, 'tierInputTokensAbove': tier}


def tools_of(event):
    return [x.get('name') or (x.get('function') or {}).get('name') for x in event.get('tools', [])]


def effective_limits(execution):
    args = (execution or {}).get('args', [])
    try:
        return json.loads(args[args.index('SUFFICE_OBSERVER_LIMITS') + 1])
    except (ValueError, IndexError, TypeError):
        return None


def response_audit(events, arm):
    startup = next((e for e in events if e.get('type') == 'startup'), {})
    model = startup.get('model') or {}
    pricing = model.get('cost')
    requests = [e for e in events if e.get('type') == 'provider_request']
    replies = [e for e in events if e.get('type') == 'assistant']
    raw_events = [e for e in events if e.get('type') == 'provider_usage']
    unique_raw = {}
    for event in raw_events:
        key = event.get('responseId') or f"missing-response-id-line-{event['_line']}"
        unique_raw[key] = event
    windows, current = [], None
    for event in events:
        if event.get('type') == 'provider_request':
            current = {'request': event, 'events': []}
            windows.append(current)
        elif current is not None:
            current['events'].append(event)
    responses, ledger, claimed_raw, claimed_replies = [], [], set(), set()
    expected_tools = ['codemode'] if arm == 'suffice' else ['read', 'bash', 'edit', 'write']
    for ordinal, window in enumerate(windows, 1):
        request = window['request']
        assistants = [e for e in window['events'] if e.get('type') == 'assistant']
        raw = {e.get('responseId') or f"missing-response-id-line-{e['_line']}": e
               for e in window['events'] if e.get('type') == 'provider_usage'}
        usages = [e.get('usage') or {} for e in assistants]
        tokens = {k: sum(u.get(k, 0) for u in usages) for k in TOKENS}
        tokens['reasoning'] = sum(u.get('reasoning', 0) for u in usages)
        per_raw = [raw_tokens(e.get('usage')) for e in raw.values()]
        raw_sums = {k: sum(u[k] for u in per_raw if u) for k in TOKENS}
        covered = len(assistants) == 1 and len(raw) == 1 and all(per_raw)
        token_match = covered and all(tokens[k] == raw_sums[k] for k in TOKENS)
        reported_components = {k: sum((dec((u.get('cost') or {}).get(k, 0)) for u in usages), Decimal(0)) for k in COMPONENTS}
        reported_total = sum((dec((u.get('cost') or {}).get('total', 0)) for u in usages), Decimal(0))
        recomputed = price(raw_sums, pricing) if covered else None
        component_match = recomputed is not None and all(abs(reported_components[k] - recomputed['components'][k]) < Decimal('0.000000001') for k in COMPONENTS)
        total_match = component_match and abs(reported_total - recomputed['total']) < Decimal('0.000000001') and abs(sum(reported_components.values()) - reported_total) < Decimal('0.000000001')
        tool_names = tools_of(request)
        tool_match = tool_names == expected_tools if arm == 'suffice' else sorted(tool_names) == sorted(expected_tools)
        identity = request.get('model') == EXPECTED_MODEL and (request.get('reasoning') or {}).get('effort') == 'low' and tool_match and bool(assistants) and all(e.get('model') == EXPECTED_MODEL for e in assistants)
        if any(e.get('model') not in (None, EXPECTED_MODEL) for e in raw.values()):
            identity = False
        statuses = [e.get('status') for e in window['events'] if e.get('type') == 'provider_response']
        responses.append({'ordinal': ordinal, 'requestLine': request['_line'], 'at': request.get('at'),
            'requestModel': request.get('model'), 'effort': (request.get('reasoning') or {}).get('effort'),
            'requestTools': tool_names, 'toolsHash': request.get('toolsHash'), 'identityAndToolMatch': identity,
            'assistantModels': [e.get('model') for e in assistants], 'rawModels': [e.get('model') for e in raw.values()],
            'rawModelObservationNote': 'null means this observer did not emit model identity on the raw event; request/reply model evidence remains separate',
            'rawResponseIds': list(raw), 'httpStatusesObserved': statuses,
            'assistantLines': [e['_line'] for e in assistants], 'stopReasons': [e.get('stopReason') for e in assistants],
            'assistantUsage': tokens, 'rawUsage': raw_sums if per_raw and all(per_raw) else None,
            'requestReplyRawOneToOne': bool(covered), 'tokenMatch': bool(token_match),
            'reportedCostComponents': reported_components, 'reportedCostTotal': reported_total,
            'recomputedCost': recomputed, 'componentAndTotalCostMatch': bool(total_match)})
        for key in raw:
            claimed_raw.add(key)
        claimed_replies.update(e['_line'] for e in assistants)
        # Raw provider usage is the independent primary cost ledger. It is never
        # added to assistant cost for the same response.
        for key, event in raw.items():
            if key not in unique_raw or unique_raw[key]['_line'] != event['_line']:
                continue
            calculated = price(raw_tokens(event.get('usage')), pricing)
            ledger.append({'source': 'raw-provider-usage', 'responseId': key, 'line': event['_line'], 'requestOrdinal': ordinal,
                'cost': calculated['total'] if calculated else None,
                'components': calculated['components'] if calculated else None})
        if not raw:
            for event in assistants:
                cost = (event.get('usage') or {}).get('cost') or {}
                ledger.append({'source': 'assistant-reported-unverified-no-raw', 'line': event['_line'], 'requestOrdinal': ordinal,
                    'cost': dec(cost['total']) if isinstance(cost.get('total'), (int, float)) else None,
                    'components': {k: dec(cost[k]) for k in COMPONENTS} if all(k in cost for k in COMPONENTS) else None})
    for key, event in unique_raw.items():
        if key not in claimed_raw:
            calculated = price(raw_tokens(event.get('usage')), pricing)
            ledger.append({'source': 'orphan-raw-provider-usage', 'responseId': key, 'line': event['_line'],
                'cost': calculated['total'] if calculated else None, 'components': calculated['components'] if calculated else None})
    for event in replies:
        if event['_line'] not in claimed_replies:
            cost = (event.get('usage') or {}).get('cost') or {}
            ledger.append({'source': 'orphan-assistant-unverified', 'line': event['_line'],
                'cost': dec(cost['total']) if isinstance(cost.get('total'), (int, float)) else None,
                'components': {k: dec(cost[k]) for k in COMPONENTS} if all(k in cost for k in COMPONENTS) else None})
    failed = []
    for event in events:
        typ = event.get('type')
        is_failure = (typ == 'assistant' and event.get('stopReason') in ('error', 'aborted')) or (typ == 'provider_response' and isinstance(event.get('status'), int) and event['status'] >= 400) or (typ == 'provider_usage' and any(word in str(event.get('status', '')).lower() for word in ('failed', 'incomplete', 'error'))) or typ in ('provider_error', 'response_error')
        if is_failure:
            failed.append({k: event.get(k) for k in ('_line', 'at', 'type', 'model', 'responseId', 'status', 'stopReason', 'error', 'usage') if k in event})
    complete = bool(requests) and len(requests) == len(replies) == len(unique_raw) and all(x['tokenMatch'] and x['componentAndTotalCostMatch'] for x in responses)
    totals = {k: sum((item['components'][k] for item in ledger if item.get('components')), Decimal(0)) for k in COMPONENTS}
    assistant_tokens = {k:sum((e.get('usage') or {}).get(k,0) for e in replies) for k in TOKENS}
    all_raw_tokens = [raw_tokens(e.get('usage')) for e in unique_raw.values()]
    return {'startup': {'model': model, 'activeTools': startup.get('activeTools'), 'at': startup.get('at')},
        'recordedRequestIntents': len(requests), 'assistantReplies': len(replies), 'uniqueRawResponses': len(unique_raw),
        'rawUsageEventCount': len(raw_events), 'duplicateRawUsageSnapshots': len(raw_events) - len(unique_raw),
        'receiptVerificationComplete': complete, 'perResponseIdentityVerified': bool(responses) and all(x['identityAndToolMatch'] for x in responses),
        'responses': responses, 'costLedger': ledger, 'knownApiEquivalentUsd': sum((x['cost'] for x in ledger if x['cost'] is not None), Decimal(0)),
        'knownCostComponents': totals, 'costComplete': complete and all(x['cost'] is not None for x in ledger),
        'normalizedAssistantTokenTotals': assistant_tokens,
        'rawTokenTotals': {k:sum(t[k] for t in all_raw_tokens if t) for k in TOKENS},
        'rawTokenTotalsComplete': all(t is not None for t in all_raw_tokens),
        'failedAssistantReplies': sum(e.get('type') == 'assistant' and e.get('stopReason') in ('error', 'aborted') for e in events),
        'failedResponseEvents': failed, 'failedResponseEventCount': len(failed),
        'toolErrors': sum(e.get('type') == 'tool_result' and bool(e.get('isError')) for e in events),
        'toolCalls': sum(e.get('type') == 'tool_call' for e in events),
        'primitiveCalls': sum(e.get('type') == 'tool_call' and e.get('name') != 'codemode' for e in events),
        'lifecycleErrors': [{k:e.get(k) for k in ('type','at','reason','error') if k in e} for e in events if e.get('type') in ('harness_error','benchmark_stop')]}


def analyze(audit, version, run):
    result = audit.json(run / 'result.json')
    grade = audit.json(run / 'grade.json') or (result or {}).get('grade') or {}
    execution = audit.json(run / 'worker/execution.json')
    execution_result = audit.json(run / 'worker/execution-result.json')
    worker = audit.json(run / 'worker/worker.json')
    evaluator_error = audit.json(run / 'evaluator-error.json')
    events, parse_errors = audit.events(run / 'worker/events.live.jsonl')
    task = (result or {}).get('task') or run.name.rsplit('-', 2)[0]
    # IDs are task-arm; stock-pi contains an additional hyphen.
    if result is None:
        task = run.name.removesuffix('-stock-pi').removesuffix('-suffice')
    arm = (result or {}).get('arm') or ('stock-pi' if run.name.endswith('-stock-pi') else 'suffice')
    frozen = audit.json(audit.root / '.suffice' / f'field-campaign-{version}' / 'frozen' / f'{task}.json') or {}
    metadata = frozen.get('task') or {}
    preflight = audit.json(audit.root / '.suffice/field-campaign-v2/preflight' / task / 'validated.json') if version == 'v2' else None
    accounting = response_audit(events, arm)
    observer_unknown = bool((worker or {}).get('usageCostUnknown'))
    if observer_unknown:
        accounting['costComplete'] = False
    no_worker_launched = not (run / 'worker').exists()
    if no_worker_launched and not events:
        accounting['costComplete'] = True
        accounting['noWorkerLaunchEvidence'] = True
    indicators = audit.grade_indicators(run, grade)
    if version == 'v1' and task in V1_INVALID_ENVIRONMENT:
        operational = 'invalid-environment-dependency-container-link'
    elif task == 'q03':
        operational = 'held-contract-and-setup-failure'
    elif result is None:
        operational = 'pre-inference-preparation-partial' if no_worker_launched else 'partial-or-running'
    elif evaluator_error or result.get('operationalFailure') or result.get('status') != 'completed':
        operational = 'recorded-operational-failure'
    elif any(any('bwrap:' in value for value in x['matches']) for x in indicators):
        operational = 'grading-boundary-failure'
    else:
        operational = 'no-established-operational-error'
    selected_policy = task in (V1_RETAIN if version == 'v1' else V2_RETAIN)
    preflight_valid = bool(preflight and preflight.get('actorNativeValid') and not (preflight.get('baseline') or {}).get('accepted') and (metadata.get('cohort') != 'historical' or (preflight.get('reference') or {}).get('accepted'))) if version == 'v2' else True
    # Environment/accuracy validity and complete cost verification are distinct.
    # Recovered provider errors with missing usage do not silently remove a
    # completed, correctly graded attempt from the accuracy cohort.
    eligible = bool(result and selected_policy and operational == 'no-established-operational-error' and accounting['perResponseIdentityVerified'] and preflight_valid and not parse_errors)
    stored_cost = (result or {}).get('knownEstimatedUsd')
    stored_cost_match = stored_cost is None or abs(accounting['knownApiEquivalentUsd'] - dec(stored_cost)) < Decimal('0.000000001')
    stored_counts_match = not result or all(result.get(k) == accounting[v] for k,v in [('requests','recordedRequestIntents'),('turns','assistantReplies'),('rawResponses','uniqueRawResponses'),('failedResponses','failedAssistantReplies')])
    event_totals = {k: sum(x['assistantUsage'][k] for x in accounting['responses']) for k in TOKENS}
    stored_tokens_match = not result or all((result.get('usage') or {}).get(k) == event_totals[k] for k in TOKENS)
    receipt_limits = effective_limits(execution)
    latency = (result or {}).get('latencyMs')
    budget_checks = {'knownEstimateWithinIndividualTenDollarCeiling': accounting['knownApiEquivalentUsd'] <= 10,
        'replyCountWithin60': accounting['assistantReplies'] <= 60,
        'toolCallCountWithin240': accounting['toolCalls'] <= 240,
        'recordedLatencyWithin600000ms': isinstance(latency,(int,float)) and latency <= 600000,
        'recordedBudgetEligible': (result or {}).get('budgetEligible') is True}
    budget_verified = bool(accounting['receiptVerificationComplete'] and accounting['costComplete'] and
        stored_cost_match and stored_counts_match and stored_tokens_match and all(budget_checks.values()))
    # Accounting disagreement is reported and prevents budget certification; it
    # does not rewrite a source patch's independently recorded behavioral grade.
    return {'key': f'{version}/{run.name}', 'evaluatorVersion': version, 'attempt': run.name, 'task': task, 'arm': arm,
        'cohort': (result or {}).get('cohort') or metadata.get('cohort'), 'repository': (result or {}).get('repository') or metadata.get('repository'),
        'status': (result or {}).get('status') or 'partial-no-result', 'resultPresent': result is not None,
        'recordedAccepted': (result or {}).get('accepted'), 'recordedCodingFailure': (result or {}).get('codingFailure'),
        'codingFailureInValidScoringSet': bool(eligible and not result.get('accepted')) if result else False,
        'recordedBudgetEligible': (result or {}).get('budgetEligible'), 'operationalClassification': operational,
        'selectionPolicyCandidate': selected_policy, 'v2ExactPathPreflightValidated': preflight_valid if version == 'v2' else None,
        'scoringEligible': eligible, 'knownApiEquivalentUsd': accounting['knownApiEquivalentUsd'],
        'totalApiEquivalentUsd': accounting['knownApiEquivalentUsd'] if accounting['costComplete'] and not parse_errors and (result is not None or no_worker_launched) else None,
        'knownCostComponents': accounting['knownCostComponents'], 'storedCostMatchesIndependentLedger': stored_cost_match,
        'storedCountsMatchIndependentEvents': stored_counts_match, 'storedUsageTokensMatchIndependentEvents': stored_tokens_match,
        'effectiveObserverLimits': receipt_limits, 'independentBudgetChecks': budget_checks,
        'costAndBudgetEligibilityVerified': budget_verified,
        'budgetEligibleSuccess': bool(eligible and budget_verified and result.get('accepted')) if result else False,
        'recordedCostTotalUnknown': (result or {}).get('totalEstimatedUsd') is None if result else None,
        'workerReportedUsageCostUnknown': (worker or {}).get('usageCostUnknown'), 'workerExecution': execution_result,
        'recoveredFailedAssistantReplies': accounting['failedAssistantReplies'] if (result or {}).get('status') == 'completed' else 0,
        'evaluatorError': evaluator_error, 'grade': grade, 'gradeSetupIndicators': indicators,
        'gradeSetupIndicatorCaveat': 'Indicators alone do not establish infrastructure fault: actor-introduced missing imports can be coding errors. Known v1 container defect and boundary errors are classified separately.',
        'eventParseErrors': parse_errors, 'accounting': accounting}


def summarize(rows):
    components = {k: sum((row['knownCostComponents'][k] for row in rows), Decimal(0)) for k in COMPONENTS}
    known = sum((row['knownApiEquivalentUsd'] for row in rows), Decimal(0))
    unknown = sum(row['totalApiEquivalentUsd'] is None for row in rows)
    return {'attempts': len(rows), 'knownApiEquivalentUsd': known, 'totalApiEquivalentUsd': None if unknown else known,
        'unknownCostAttempts': unknown, 'costComponents': components,
        'recordedRequestIntents': sum(row['accounting']['recordedRequestIntents'] for row in rows),
        'assistantReplies': sum(row['accounting']['assistantReplies'] for row in rows),
        'uniqueRawResponses': sum(row['accounting']['uniqueRawResponses'] for row in rows),
        'observedTokenTotalsComplete': all(row['accounting']['receiptVerificationComplete'] for row in rows),
        'failedAssistantReplies': sum(row['accounting']['failedAssistantReplies'] for row in rows),
        'failedResponseEvents': sum(row['accounting']['failedResponseEventCount'] for row in rows),
        'recoveredFailedAssistantReplies': sum(row['recoveredFailedAssistantReplies'] for row in rows),
        'toolCalls': sum(row['accounting']['toolCalls'] for row in rows),
        'primitiveCalls': sum(row['accounting']['primitiveCalls'] for row in rows),
        'normalizedAssistantTokenTotals': {k:sum(row['accounting']['normalizedAssistantTokenTotals'][k] for row in rows) for k in TOKENS},
        'rawTokenTotals': {k:sum(row['accounting']['rawTokenTotals'][k] for row in rows) for k in TOKENS},
        'partialAttempts': sum(not row['resultPresent'] for row in rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
    parser.add_argument('--out', type=pathlib.Path)
    args = parser.parse_args()
    audit = Audit(args.root)
    rows, manifests = [], {}
    for version in ('v1', 'v2'):
        campaign = audit.root / '.suffice' / f'field-campaign-{version}'
        manifests[version] = audit.json(campaign / 'manifest.json')
        if (campaign / 'attempts').exists():
            rows.extend(analyze(audit, version, run) for run in sorted((campaign / 'attempts').iterdir()) if run.is_dir())
    eligible = [r for r in rows if r['scoringEligible']]
    grouped = collections.defaultdict(list)
    for row in eligible:
        grouped[(row['task'], row['arm'])].append(row)
    duplicates = {f'{task}/{arm}':[x['key'] for x in values] for (task,arm),values in grouped.items() if len(values)>1}
    # Never choose a repeated attempt by success/cost. Ambiguous duplicate cells
    # remain outside paired comparisons until the parent adjudicates them.
    unique = [values[0] for values in grouped.values() if len(values)==1]
    paired_tasks = sorted({r['task'] for r in unique if r['cohort']=='historical' and all(any(x['task']==r['task'] and x['arm']==a for x in unique) for a in ('suffice','stock-pi'))})
    paired = [r for r in unique if r['task'] in paired_tasks]
    complete_cost_tasks = [task for task in paired_tasks if all(r['totalApiEquivalentUsd'] is not None for r in paired if r['task'] == task)]
    complete_cost_pairs = [r for r in paired if r['task'] in complete_cost_tasks]
    arm_totals = {arm:summarize([r for r in paired if r['arm']==arm]) for arm in ('suffice','stock-pi')}
    sf_total, pi_total = arm_totals['suffice']['totalApiEquivalentUsd'], arm_totals['stock-pi']['totalApiEquivalentUsd']
    bounds = {'tasks':paired_tasks, 'sufficeTotalApiEquivalentUsd':sf_total,'stockPiTotalApiEquivalentUsd':pi_total,
        'sufficeKnownLowerBoundUsd':arm_totals['suffice']['knownApiEquivalentUsd'],
        'stockPiKnownLowerBoundUsd':arm_totals['stock-pi']['knownApiEquivalentUsd'],
        'allSufficeCostsComplete':sf_total is not None,'allStockPiCostsComplete':pi_total is not None,
        'sufficeTotalBelowStockPiKnownLowerBound':sf_total is not None and bool(paired_tasks) and sf_total < arm_totals['stock-pi']['knownApiEquivalentUsd'],
        'caveat':'A nonnegative missing API-equivalent charge can only increase a known lower bound. This does not certify an unknown-cost attempt as within budget and is not subscription cash savings.'}
    selected_summary = {}
    for arm in ('suffice','stock-pi'):
        arm_rows = [r for r in paired if r['arm']==arm]
        entry = summarize(arm_rows)
        entry['accepted'] = sum(bool(r['recordedAccepted']) for r in arm_rows)
        entry['budgetEligibleSuccesses'] = sum(r['budgetEligibleSuccess'] for r in arm_rows)
        entry['codingFailures'] = sum(r['codingFailureInValidScoringSet'] for r in arm_rows)
        entry['costPerAcceptedApiEquivalentUsd'] = entry['totalApiEquivalentUsd']/entry['accepted'] if entry['accepted'] and entry['totalApiEquivalentUsd'] is not None else None
        selected_summary[arm] = entry
    out = args.out or audit.root / 'reports/field-accounting'
    out.mkdir(parents=True, exist_ok=True)
    dataset = {'schema':'sonion-field-accounting-v1','provisional':True,'asOf':dt.datetime.now(dt.timezone.utc).isoformat(),
        'scriptSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        'scope':'Benchmark attempt inference receipts only; excludes engineering/evaluator assistant usage, installs, tests, and any unrecorded inference.',
        'billing':'API-equivalent estimates from startup-observed model metadata. Inference used subscription access; these are not subscription invoice charges, incremental cash spend, or measured energy costs.',
        'selectionPolicy':{'v1Retain':sorted(V1_RETAIN),'v2Retain':sorted(V2_RETAIN),'v1EnvironmentInvalid':sorted(V1_INVALID_ENVIRONMENT),'heldTask':'q03','duplicatePolicy':'Do not select by outcome; duplicate scoring cells require adjudication.'},
        'manifests':manifests,'attempts':rows,'allAttemptSpend':summarize(rows),
        'independentPatchReplayDiagnosticReport':audit.json(audit.root/'reports/field-adjudication-v1/summary.json'),
        'independentEnvironmentEvidenceReport':audit.json(audit.root/'reports/field-adjudication-v1/environment-evidence.json'),
        'independentPatchReplayAssessment':audit.json(audit.root/'reports/field-adjudication-v1/assessment.json'),
        'patchReplayPolicy':'Deterministic patch replay is supplementary diagnostic evidence. It never makes a v1 environment-invalid model attempt valid and never silently replaces an original attempt grade.',
        'spendByArm':{a:summarize([r for r in rows if r['arm']==a]) for a in ('suffice','stock-pi')},
        'spendByOperationalClassification':{k:summarize([r for r in rows if r['operationalClassification']==k]) for k in sorted({r['operationalClassification'] for r in rows})},
        'scoringEligibleSpend':summarize(eligible),'pairedHistoricalTasks':paired_tasks,'pairedHistorical':selected_summary,
        'completeCostMatchedTasks':complete_cost_tasks,
        'completeCostMatchedPairs':{a:summarize([r for r in complete_cost_pairs if r['arm']==a]) for a in ('suffice','stock-pi')},
        'pairedHistoricalCostBounds':bounds,
        'scoringEligibilityMeaning':'Completed environment-valid attempts with recorded model/tool identity. Cost/budget verification and stored accounting-summary disagreements are reported separately. Unknown failed-response usage does not select the accuracy cohort by cost observability.',
        'liveScoringEligible':[r['key'] for r in unique if r['cohort']=='live'], 'duplicateScoringCells':duplicates,
        'liveOutcomeMeaning':'Local independent acceptance only; no upstream patch acceptance, maintainer validation, PR submission or deployment is implied.',
        'failedResponseEvents':[{'attempt':r['key'],**e} for r in rows for e in r['accounting']['failedResponseEvents']],
        'selfChecks':{
            'allKnownComponentSumsMatchKnownLedgerTotal':all(abs(sum(r['knownCostComponents'].values())-r['knownApiEquivalentUsd'])<Decimal('0.000000001') for r in rows),
            'allStoredKnownCostsMatchIndependentLedger':all(r['storedCostMatchesIndependentLedger'] for r in rows),
            'allStoredCountsMatchEvents':all(r['storedCountsMatchIndependentEvents'] for r in rows),
            'allStoredUsageTokensMatchEvents':all(r['storedUsageTokensMatchIndependentEvents'] for r in rows),
            'allSufficeCompletedScoringCostUnknownFlagsFalse':all(r['workerReportedUsageCostUnknown'] is False for r in eligible if r['arm']=='suffice'),
            'completedWithRecoveredProviderFailures':[r['key'] for r in rows if r['recoveredFailedAssistantReplies']]},
        'inputSnapshots':audit.inputs,'limitsCaveat':'Observer limits are read per execution receipt. Startup pricing is recorded per attempt. Missing raw model fields are explicitly unobserved, not inferred as provider verification.',
        'noFinalVerdict':'Ongoing/partial records are retained. No unseen patch is graded by this accounting script.'}
    (out/'normalized.json').write_text(json.dumps(dataset,indent=2,default=number)+'\n')
    def money(value): return 'unknown' if value is None else f'${value:.6f}'
    lines=['# Provisional independent field accounting','',f"Snapshot: {dataset['asOf']}. No final efficacy verdict.",'',dataset['billing'],'',
        f"All observed attempts: {len(rows)}; known API-equivalent estimate {money(dataset['allAttemptSpend']['knownApiEquivalentUsd'])}; unknown-total attempts {dataset['allAttemptSpend']['unknownCostAttempts']}.",
        f"Valid paired historical tasks currently present: {', '.join(paired_tasks) or 'none'}. V1 environment-invalid attempts remain in inclusive spend and are not coding failures.",'',
        '## Current valid historical pairs','',
        '| Arm | Attempts | Accepted patches | Budget-certified accepted | Request intents | Failed replies recovered | Known API-equivalent | Complete total |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for arm,summary in selected_summary.items():
        lines.append(f"| {arm} | {summary['attempts']} | {summary['accepted']} | {summary['budgetEligibleSuccesses']} | {summary['recordedRequestIntents']} | {summary['recoveredFailedAssistantReplies']} | {money(summary['knownApiEquivalentUsd'])} | {money(summary['totalApiEquivalentUsd'])} |")
    lines += ['', 'Accepted means the recorded independent behavioral grade, not a budget certificate. Unknown failed-response usage is never treated as a known zero charge. Request intents include failed/retried requests; observed token totals are incomplete where raw usage is missing. Live outcomes are local acceptance only, not upstream acceptance.', '',
        '## All attempt records','',
        '| Attempt | Operational classification | Scoring eligible | Recorded accepted | Known API-equivalent | Requests/replies/raw |','| --- | --- | --- | --- | --- | --- |']
    for row in rows:
        a=row['accounting'];lines.append(f"| {row['key']} | {row['operationalClassification']} | {row['scoringEligible']} | {row['recordedAccepted']} | {money(row['knownApiEquivalentUsd'])} | {a['recordedRequestIntents']}/{a['assistantReplies']}/{a['uniqueRawResponses']} |")
    lines += ['', '## Cost components and evidence', '', '| Scope | Input | Cache read | Cache write | Output | Known total |', '| --- | --- | --- | --- | --- | --- |']
    for name,summary in [('all attempts',dataset['allAttemptSpend']),('scoring eligible',dataset['scoringEligibleSpend']),*dataset['spendByArm'].items()]:
        c=summary['costComponents'];lines.append(f"| {name} | {money(c['input'])} | {money(c['cacheRead'])} | {money(c['cacheWrite'])} | {money(c['output'])} | {money(summary['knownApiEquivalentUsd'])} |")
    lines += ['', 'Raw usage is deduplicated by response ID and priced independently. Assistant and raw estimates for the same response are never added together. Per-response token/component/model/effort/tool checks, failed response events, HTTP observations, partial records, effective limits and source hashes are in normalized.json.', '',
        'Accuracy/environment validity is separate from complete cost and budget verification. Completed attempts with recovered provider errors remain in the accuracy cohort when model/tool identity and grading are valid; missing raw usage leaves their total estimate unknown and budget-eligible success unverified.', '',
        'Failed response events can contain multiple observations of the same failed response; failed assistant replies are counted separately. A recorded request is a provider-request intent, not proof an HTTP transaction completed. Tool errors are not model-response errors.', '',
        'A grading module-load indicator is diagnostic, not automatically an infrastructure exclusion: an actor can introduce a bad import. The documented v1 integration dependency-container defect is explicitly invalid regardless of provisional v1 codingFailure labels. Q03 remains held. Unpaired or incomplete cells are not pooled into paired comparisons.', '',
        'Independent deterministic replay summaries and their interpretation layer are retained in normalized.json. A replay never makes an invalid original environment valid or silently rewrites a recorded grade. Timing-limited replay observations must be read with their unchanged-baseline controls and assessment.', '',
        'Source snapshot hashes make the current inputs auditable; later reruns may include newly appended receipts and will produce a new provisional snapshot.']
    lines += ['', '## Paired cost observability', '',
        f"Pairs with complete cost on both sides: {', '.join(complete_cost_tasks) or 'none'}. This is a labeled subset; it does not replace the full valid accuracy cohort.",
        f"Across all current valid pairs, Suffice total: {money(sf_total)}; native Pi known lower bound: {money(bounds['stockPiKnownLowerBoundUsd'])}; native Pi complete total: {money(pi_total)}.",
        f"Suffice complete total below native Pi known lower bound: {bounds['sufficeTotalBelowStockPiKnownLowerBound']}. This is a provisional arithmetic bound, not a final efficacy verdict or a budget certificate for unknown-cost Pi attempts."]
    (out/'report.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({'asOf':dataset['asOf'],'attempts':len(rows),'knownApiEquivalentUsd':number(dataset['allAttemptSpend']['knownApiEquivalentUsd']),'unknownCostAttempts':dataset['allAttemptSpend']['unknownCostAttempts'],'scoringEligible':len(eligible),'pairedHistoricalTasks':paired_tasks,'failedResponseEvents':len(dataset['failedResponseEvents']),'duplicates':duplicates,'output':str(out)}))


if __name__ == '__main__':
    main()
