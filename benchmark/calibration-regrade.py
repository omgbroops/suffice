"""One official grading replay per ungraded HTML artifact; never invokes a model."""
import ast
import asyncio
import hashlib
import json
import os
from pathlib import Path
import sys
import time

STATE = Path('/home/eric_qin/suffice-calibration-v1')
DEST = STATE/'grading-replays/html-r1'
ARMS = ('v2-alone', 'v2-upfront', 'v2-selective')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2)+'\n', encoding='utf-8')


def reconstruct(arm):
    trial = STATE/'trials'/('filter-js-from-html-'+arm)
    events, inputs = [], []
    for path in sorted((trial/'agent/receipts').rglob('*.jsonl')):
        if 'events' not in path.parts:
            continue
        inputs.append({'path':str(path.relative_to(STATE)), 'sha256':sha(path)})
        events.extend(json.loads(line) for line in path.read_text(encoding='utf-8').split('\n') if line.strip())
    events.sort(key=lambda e:e.get('at',''))
    results = {e['callId']:e for e in events if e.get('type') == 'tool_result'}
    source, history, shell = None, [], []
    for event in events:
        if event.get('type') != 'tool_call':
            continue
        name, data = event.get('name'), event.get('input', {})
        result = results.get(event['callId'])
        if name == 'bash':
            command = data['command']
            shell.append({'callId':event['callId'], 'command':command,
                          'isError':None if result is None else result.get('isError')})
            if "s=open(p).read().replace(" not in command:
                continue
            assert arm == 'v2-upfront' and result and not result.get('isError')
            # Interpret only literal str.replace operations; never execute actor code.
            snippet = command.split("python3 - <<'PY'\n",1)[1].split('\nPY',1)[0]
            tree = ast.parse(snippet)
            assert len(tree.body) == 3
            assert ast.literal_eval(tree.body[0].value) == '/app/filter.py'
            expression = tree.body[1].value
            replacements = []
            while isinstance(expression, ast.Call) and isinstance(expression.func, ast.Attribute) and expression.func.attr == 'replace':
                assert len(expression.args) == 2 and not expression.keywords
                replacements.append(tuple(ast.literal_eval(x) for x in expression.args))
                expression = expression.func.value
            assert ast.unparse(expression) == 'open(p).read()'
            assert ast.unparse(tree.body[2]) == "open(p, 'w').write(s)"
            for old, new in reversed(replacements):
                source = source.replace(old, new)
            history.append({'callId':event['callId'], 'operation':'literal shell replacements',
                            'replacements':list(reversed(replacements))})
        elif name in ('write','edit'):
            assert data['path'] == '/app/filter.py', 'Unexpected product file'
            assert result is not None, 'Missing mutation result'
            if result.get('isError'):
                # Failed edit reports must not have applied any earlier block.
                if name == 'edit':
                    assert source.count(data['edits'][0]['oldText']) == 0
                history.append({'callId':event['callId'], 'operation':name, 'skippedFailed':True})
                continue
            if name == 'write':
                source = data['content']
            else:
                for edit in data['edits']:
                    assert source.count(edit['oldText']) == 1, 'Ambiguous edit'
                    source = source.replace(edit['oldText'], edit['newText'], 1)
            history.append({'callId':event['callId'], 'operation':name})
        else:
            continue
        if source is not None:
            history[-1]['sourceSha256'] = hashlib.sha256(source.encode()).hexdigest()
    assert source
    compile(source, '/app/filter.py', 'exec')
    readback = None
    if arm == 'v2-selective':
        call = next(e for e in events if e.get('type') == 'tool_call' and e.get('name') == 'bash'
                    and "sed -n '1,180p'" in e['input']['command'])
        observed = ''.join(c.get('text','') for c in results[call['callId']]['content'])
        assert observed.split('\n',1)[1] == source
        readback = call['callId']
    output = DEST/'artifacts'/arm/'filter.py'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(source.encode())
    evidence = {'arm':arm, 'originalResultSha256':sha(STATE/'results'/(trial.name+'.json')),
                'originalWorkerSha256':sha(trial/'agent/receipts/worker.json'),
                'sourceSha256':sha(output), 'eventInputs':inputs, 'mutations':history,
                'shellCallsReviewed':shell, 'finalReadbackCallId':readback,
                'limitation':'Reconstructed from successful recorded mutations; no original filesystem snapshot/hash exists.'}
    save(output.parent/'provenance.json', evidence)
    return evidence


async def run():
    from harbor.models.trial.config import TrialConfig, TaskConfig, AgentConfig, EnvironmentConfig, VerifierConfig
    from harbor.trial.trial import Trial
    from harbor.agents.installed.base import BaseInstalledAgent

    class ArtifactReplayAgent(BaseInstalledAgent):
        @staticmethod
        def name():return 'saved-artifact-no-inference'

        async def install(self, environment):
            pass

        async def run(self, instruction, environment, context):
            artifact = Path(os.environ['CALIBRATION_REPLAY_ARTIFACT'])
            await environment.upload_file(artifact, '/app/filter.py')
            result = await environment.exec(command='sha256sum /app/filter.py', user='root', timeout_sec=15)
            assert result.return_code == 0 and result.stdout.split()[0] == sha(artifact)
            context.cost_usd = 0
            context.n_input_tokens = context.n_output_tokens = context.n_cache_tokens = 0
            context.metadata = {'inference':False, 'sourceSha256':sha(artifact)}
            save(self.logs_dir/'restoration.json', context.metadata)

    globals()['ArtifactReplayAgent'] = ArtifactReplayAgent
    sys.modules['calibration_regrade'] = sys.modules[__name__]
    # Drain the independently running replacement before using browser resources.
    while not (STATE/'replacements/provider-interruptions-r1/campaign-complete.json').exists():
        if (STATE/'replacements/provider-interruptions-r1/controller-error.json').exists():
            raise RuntimeError('Replacement needs review before regrading')
        save(DEST/'status.json', {'state':'waiting for replacement drain', 'at':time.time()})
        await asyncio.sleep(10)
    for arm in ARMS:
        name = 'filter-js-from-html-'+arm
        target = DEST/'results'/(name+'.json')
        if target.exists():continue
        assert not (DEST/'trials'/name).exists(), 'Partial replay requires review'
        artifact = DEST/'artifacts'/arm/'filter.py'
        evidence = json.loads((artifact.parent/'provenance.json').read_text())
        assert sha(artifact) == evidence['sourceSha256']
        os.environ['CALIBRATION_REPLAY_ARTIFACT'] = str(artifact)
        save(DEST/'status.json', {'state':'grading', 'arm':arm, 'at':time.time()})
        original = json.loads((STATE/'trials'/name/'config.json').read_text())
        cfg = TrialConfig(task=TaskConfig(**original['task']), trial_name=name, trials_dir=DEST/'trials',
                         agent=AgentConfig(import_path='calibration_regrade:ArtifactReplayAgent', override_setup_timeout_sec=120),
                         environment=EnvironmentConfig(type='docker', delete=True), verifier=VerifierConfig())
        trial = await Trial.create(cfg)
        result = await trial.run()
        save(target, result.model_dump(mode='json'))
        print(json.dumps({'arm':arm, 'inference':False,
                          'reward':result.verifier_result.model_dump(mode='json') if result.verifier_result else None,
                          'exceptionType':result.exception_info.exception_type if result.exception_info else None}), flush=True)
    save(DEST/'status.json', {'state':'complete', 'at':time.time(), 'inference':False})


if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        assert not (DEST/'plan.json').exists(), 'Replay plan already frozen'
        evidence = [reconstruct(arm) for arm in ARMS]
        save(DEST/'plan.json', {'inference':False, 'attemptsPerArtifact':1,
             'originalGradesPreserved':True, 'runnerSha256':sha(Path(__file__)),
             'artifacts':[{k:e[k] for k in ('arm','sourceSha256','originalResultSha256')} for e in evidence]})
        print(json.dumps({'prepared':len(evidence), 'inference':False}))
    elif sys.argv[1] == 'run':
        plan = json.loads((DEST/'plan.json').read_text())
        assert plan['runnerSha256'] == sha(Path(__file__))
        asyncio.run(run())
    else:raise ValueError('prepare | run')
