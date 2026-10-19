"""Read-only upstream discovery; archives are unpacked only into new campaign state."""
import importlib.util, json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
STATE = ROOT / '.suffice/shared-core-v1'
spec = importlib.util.spec_from_file_location('source_preparation', ROOT / 'benchmark/broad/prepare.py')
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)
selections = [
    ('b01', 'p-debounce', 34, '2888240f61e983e46a7f9d0ef91f6cdf89e49877'),
    ('b02', 'p-memoize', 62, 'a8cec6126e39752f3aea09bb2ee4825cc9ea58a3'),
    ('b03', 'p-timeout', 45, 'ed58372c62d3dddfe6f58de37558fb132e1a4e9b'),
    ('b04', 'p-retry', 97, '2aba573c0fdca165c4d95262f51ae56902f2f892'),
]
for ident, name, number, fix in selections:
    folder = STATE / 'discovery' / ident
    folder.mkdir(parents=True, exist_ok=True)
    def fetch(endpoint, target):
        path = folder / target
        if not path.exists():
            request = urllib.request.Request('https://api.github.com/repos/sindresorhus/' + name + endpoint,
                                             headers={'User-Agent': 'Suffice-public-contract-evaluation'})
            with urllib.request.urlopen(request, timeout=40) as response:
                path.write_bytes(response.read())
        return json.loads(path.read_text())
    commit = fetch('/commits/' + fix, 'commit.json')
    issue = fetch('/issues/' + str(number), 'issue.json')
    base = commit['parents'][0]['sha']
    for label, sha in [('base', base), ('reference', fix)]:
        if not (folder / label / 'package.json').exists():
            prep.download('sindresorhus/' + name, sha, folder / label, STATE / 'archives' / (name + '-' + sha + '.tgz'))
    print(json.dumps({'id': ident, 'repository': name, 'base': base, 'fix': fix,
                      'title': issue['title'], 'package': json.loads((folder / 'base/package.json').read_text()),
                      'changedPaths': [f['filename'] for f in commit['files']]}))
