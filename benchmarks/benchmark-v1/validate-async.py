"""Offline native-Node fixture validation; executes no upstream package scripts."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parent
TASKS = ['fastq-resume-window', 'emittery-iterator-lifecycle']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(spec):
    ident, workspace, suite = spec
    folder = ROOT / 'tasks' / ident
    fixture = 'tests/visible.test.mjs' if suite == 'visible' else str(folder / 'private/acceptance.test.mjs')
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=3000', fixture]
    result = subprocess.run(command, cwd=folder / workspace, capture_output=True, text=True, timeout=15)
    (folder / 'private' / f'{workspace}-{suite}.tap').write_text(result.stdout + result.stderr, newline='\n')
    return {
        'task': ident, 'workspace': workspace, 'suite': suite,
        'command': ['node', '--test', '--test-reporter=tap', '--test-timeout=3000',
                    'tests/visible.test.mjs' if suite == 'visible' else '../private/acceptance.test.mjs'],
        'exitCode': result.returncode,
        'passed': len(re.findall(r'^ok ', result.stdout, re.M)),
        'failed': len(re.findall(r'^not ok ', result.stdout, re.M)),
        'failedNames': re.findall(r'^not ok \d+ - (.*)', result.stdout, re.M),
    }


def main():
    checks = []
    archive_bytes = 0
    artifact_bytes = 0
    for ident in TASKS:
        folder = ROOT / 'tasks' / ident
        task = json.loads((folder / 'task.json').read_text())
        actor = folder / task['workspaceDir']
        reference = folder / task['referenceDir']
        assert not any(p.is_symlink() for p in folder.rglob('*'))
        for source in task['provenance']['sourceArchives']:
            archive = folder / source['path']
            assert sha(archive) == source['sha256']
            archive_bytes += archive.stat().st_size
        # All upstream paths must exist unchanged except declared production edits.
        with tarfile.open(folder / 'sources/upstream.tar.gz') as tar:
            source_files = 0
            for member in tar.getmembers():
                if not member.isfile():
                    continue
                parts = Path(*Path(member.name).parts[1:])
                original = tar.extractfile(member).read()
                actor_path = actor / 'src' / parts
                reference_path = reference / 'src' / parts
                assert actor_path.is_file() and reference_path.is_file()
                source_files += 1
                if parts.as_posix() != ('queue.js' if ident.startswith('fastq') else 'index.js'):
                    assert actor_path.read_bytes() == original
                    assert reference_path.read_bytes() == original
        assert not any(p.name in {'private', 'reference', 'acceptance.test.mjs', 'task.json', 'integrity.json'}
                       for p in actor.rglob('*'))
        assert (folder / task['visiblePath']).read_bytes() == (folder / 'public/visible.test.mjs').read_bytes()
        for fixture in [folder / task['acceptancePath'], folder / task['visiblePath']]:
            text = fixture.read_text()
            names = re.findall(r"test\('([^']+)'", text)
            assertions = re.findall(r'assert\.(?:deepEqual|equal)\(', text)
            assert len(names) == len(assertions)
            assert all(name in task['assertionMap'] for name in names)
            assert all(set(task['assertionMap'][name]) <= {r['id'] for r in task['requirements']} for name in names)
        files = {}
        for subdir in ['actor', 'reference', 'public', 'sources']:
            for path in sorted((folder / subdir).rglob('*')):
                if path.is_file():
                    files[path.relative_to(folder).as_posix()] = sha(path)
        files[task['acceptancePath']] = sha(folder / task['acceptancePath'])
        files['task.json'] = sha(folder / 'task.json')
        pinned_manifest = json.loads((folder / 'private/integrity.json').read_text())
        assert pinned_manifest['files'] == files, f'Frozen evaluator/fixture content changed: {ident}'
        artifact_bytes += sum(p.stat().st_size for p in folder.rglob('*') if p.is_file())
        checks.append({'task': ident, 'completeUpstreamSourceFiles': source_files,
                       'actorHasNoPrivateArtifacts': True, 'assertionMappingComplete': True,
                       'allowedEditPaths': task['allowedEditPaths'], 'scopeTier': task['scopeTier']})
    assert archive_bytes <= 5 * 1024 * 1024
    assert artifact_bytes <= 20 * 1024 * 1024
    specs = [(i, w, s) for i in TASKS for w in ['actor', 'reference'] for s in ['visible', 'hidden']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(run, specs))
    for result in results:
        expected_failure = result['workspace'] == 'actor' and result['suite'] == 'hidden'
        assert (result['exitCode'] != 0) == expected_failure, result
        if expected_failure:
            assert result['failed'] > 0 and result['passed'] + result['failed'] == (16 if result['task'].startswith('fastq') else 18)
        else:
            assert result['failed'] == 0 and result['passed'] > 0
    report = {'nodeVersion': subprocess.check_output(['node', '--version'], text=True).strip(),
              'status': 'validated', 'noInferencePerformed': True,
              'archiveBytes': archive_bytes, 'artifactBytesBeforeLogs': artifact_bytes,
              'structuralChecks': checks, 'results': results,
              'limitations': ['Both tasks are scope tier 1 single-component repairs; they do not establish long-task performance.',
                              'Defects are disclosed synthetic injections into pinned real upstream code.',
                              'Native authored regression/acceptance suites ran; upstream development-dependency suites did not.']}
    (ROOT / 'async-validation.json').write_text(json.dumps(report, indent=2) + '\n', newline='\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
