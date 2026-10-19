"""Independent fake-only continuation checks. Never calls SSH or a model."""
import contextlib, hashlib, importlib.util, io, json, pathlib, tempfile, threading, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'review/broad-resume.py'
MODES = ['codexSolMedium', 'v1SolMedium', 'v2LunaHigh', 'v1LunaHigh']
IDS = [f'b{i:02}' for i in range(1, 16)]
JOBS = [{'id': ident, 'mode': MODES[(i+j) % 4]} for i, ident in enumerate(IDS) for j in range(4)]

def load():
    spec = importlib.util.spec_from_file_location('resume_under_test', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def row(job, cost=.01, unknown=False, identity=True):
    return {**job, 'accepted': True, 'success': not unknown, 'knownCostUsd': cost,
            'costUnknown': unknown, 'identity': identity, 'totalCostUsd': None if unknown else cost}

def write_result(folder, value, errors=()):
    folder.mkdir(parents=True, exist_ok=True)
    (folder/'result.json').write_text(json.dumps(value), encoding='utf8')
    worker = folder/'worker'; worker.mkdir(exist_ok=True)
    (worker/'worker.json').write_text(json.dumps({'errors': list(errors)}), encoding='utf8')

def scenario(kind):
    d = load()
    with tempfile.TemporaryDirectory(prefix='suffice-resume-check-') as temp:
        d.ROOT = pathlib.Path(temp); d.STATE = d.ROOT/'state'; d.STATE.mkdir()
        manifest = {'tasks': {i: {} for i in IDS}, 'jobs': JOBS,
                    'limits': {'maxCostUsd': .25}, 'maxConcurrency': 4,
                    'minAvailableMemoryBytes': 1, 'maxCampaignCostUsd': 16}
        (d.STATE/'manifest.json').write_text(json.dumps(manifest), encoding='utf8')
        for ident in IDS:
            p = d.STATE/'controls'/ident; p.mkdir(parents=True)
            (p/'result.json').write_text('{"passed": true}', encoding='utf8')
        saved = JOBS[:9] if kind not in ['ceiling', 'partial'] else []
        original_bytes = {}
        for i, job in enumerate(saved):
            name = job['id']+'-'+job['mode']; p = d.STATE/'attempts'/name
            value = row(job, unknown=i in [1, 4])
            errors = ['Selected model is at capacity.'] if value['costUnknown'] else []
            if kind == 'saved-unknown' and i == 1: errors = ['Unexpected stream disconnect']
            if kind == 'saved-invalid' and i == 1: value['knownCostUsd'] = float('nan')
            write_result(p, value, errors)
            for file in p.rglob('*'):
                if file.is_file(): original_bytes[file] = file.read_bytes()
        if kind == 'ceiling':
            job = JOBS[-1]; write_result(d.STATE/'attempts'/(job['id']+'-'+job['mode']), row(job, 15.9))
        if kind == 'partial':
            p = d.STATE/'attempts'/(JOBS[-1]['id']+'-'+JOBS[-1]['mode']); p.mkdir(parents=True)
        calls = []; active = 0; peak = 0; per_issue = set(); mutex = threading.Lock()
        def fake(args, name):
            nonlocal active, peak
            if args == ['freeze']: return 0
            assert args[0] == 'attempt'
            with mutex:
                assert args[1] not in per_issue
                per_issue.add(args[1]); active += 1; peak = max(peak, active); calls.append(name)
            try:
                time.sleep(.003)
                job = {'id': args[1], 'mode': args[2]}; p = d.STATE/'attempts'/name
                assert not p.exists(), 'Attempt rerun or overwrite'
                unknown = kind in ['new-capacity', 'mixed-error', 'new-unknown']
                errors = ['Selected model is at capacity.'] if kind in ['new-capacity', 'mixed-error'] else []
                if kind in ['new-unknown', 'mixed-error']: errors += ['Unexpected stream disconnect']
                value = row(job, unknown=unknown, identity=kind != 'new-identity')
                write_result(p, value, errors)
                return 2 if unknown or not value['identity'] else 0
            finally:
                with mutex: active -= 1; per_issue.remove(args[1])
        d.invoke = fake; d.original.memory_available = lambda: 8*1024**3
        error = None
        try:
            with contextlib.redirect_stdout(io.StringIO()): d.main()
        except RuntimeError as e: error = str(e)
        assert all(file.read_bytes() == value for file, value in original_bytes.items())
        assert not (d.STATE/'driver.lock').exists()
        assert peak <= 4
        stopped = kind in ['saved-unknown', 'saved-invalid', 'partial', 'ceiling', 'new-identity', 'new-unknown', 'mixed-error']
        if kind in ['saved-unknown', 'saved-invalid', 'partial', 'ceiling']: assert not calls
        if kind == 'mixed-error':
            return {'scenario': kind, 'passed': error is not None, 'newDispatches': len(calls),
                    'finding': None if error else 'Mixed capacity and unrelated errors were accepted'}
        assert bool(error) == stopped, (kind, error)
        if not stopped:
            result = json.loads((d.STATE/'continuation-complete.json').read_text(encoding='utf8'))
            assert len(calls) == 51 and result['attempts'] == 60 and result['newAttempts'] == 51
            assert result['unknownCosts'] == (53 if kind == 'new-capacity' else 2)
            assert not result['exactTotalCostAvailable']
            first = json.loads((d.STATE/'continuation-admissions.jsonl').read_text().splitlines()[0])
            assert abs(first['accountedPlusUnknownReservationsUsd'] - .57) < 1e-9
        return {'scenario': kind, 'passed': True, 'newDispatches': len(calls), 'peakFakeActors': peak}

if __name__ == '__main__':
    results = [scenario(k) for k in ['complete', 'new-capacity', 'saved-unknown', 'saved-invalid',
                                    'partial', 'ceiling', 'new-identity', 'new-unknown', 'mixed-error']]
    print(json.dumps({'inferenceCalls': 0, 'passed': all(r['passed'] for r in results), 'scenarios': results}, indent=2))
    raise SystemExit(0 if all(r['passed'] for r in results) else 1)
