"""Verify a candidate changes only explicitly permitted existing production files.

Usage: python check-async-candidate.py TASK_DIRECTORY CANDIDATE_WORKSPACE
Run this before native tests, then run it again afterward. Does not rewrite hashes.
"""
from pathlib import Path
import hashlib
import json
import sys


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    task_dir, candidate = map(lambda text: Path(text).resolve(), sys.argv[1:])
    task = json.loads((task_dir / 'task.json').read_text())
    manifest = json.loads((task_dir / 'private/integrity.json').read_text())
    expected_actor = {key.removeprefix('actor/'): value for key, value in manifest['files'].items()
                      if key.startswith('actor/')}
    actual = {p.relative_to(candidate).as_posix(): p for p in candidate.rglob('*') if p.is_file()}
    assert set(actual) == set(expected_actor), 'Candidate added or removed files'
    assert not any(p.is_symlink() for p in candidate.rglob('*')), 'Candidate contains symlinks'
    changes = []
    for name, path in actual.items():
        if digest(path) != expected_actor[name]:
            assert name in task['allowedEditPaths'], f'Forbidden candidate edit: {name}'
            changes.append(name)
    for name, expected in manifest['files'].items():
        if not name.startswith('actor/'):
            assert digest(task_dir / name) == expected, f'Evaluator/reference/fixture changed: {name}'
    print(json.dumps({'task': task['id'], 'status': 'integrity-verified', 'productionEdits': sorted(changes)}))


if __name__ == '__main__':
    main()
