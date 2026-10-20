"""No-inference public-contract replay of frozen, reconstructed actor sources."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

def inside():
    def run(argv):return subprocess.run(argv,capture_output=True,timeout=30)
    source=Path('/artifacts/main.py.c')
    built=run(['gcc',str(source),'-o','/tmp/replay-main'])
    out={'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'compileExit':built.returncode,'compilerDiagnostics':built.stderr.decode(errors='replace')[:2000],'defaultPythonAvailable':False,'cases':[]}
    try:out['defaultPythonAvailable']=run(['python3','--version']).returncode==0
    except FileNotFoundError:pass
    if built.returncode==0:
        cases=set(range(31))|{50,92,93,100,1000,10000,21000}
        sys.set_int_max_str_digits(0);a,b=0,1
        for n in range(max(cases)+1):
            if n in cases:
                expected=(str(a)+'\n').encode()
                checks=[]
                for argv in [['/public-python/bin/python3',str(source)],['/tmp/replay-main']]:
                    result=run(argv+[str(n)])
                    checks.append({'mode':'python' if argv[0].endswith('python3') else 'c','exitCode':result.returncode,'matches':result.returncode==0 and result.stdout==expected,'stderr':result.stderr.decode(errors='replace')[:500]})
                out['cases'].append({'n':n,'checks':checks})
            a,b=b,a+b
    print(json.dumps(out))

def main():
    if '--inside' in sys.argv:inside();return
    root=Path('/home/eric_qin');state=root/'suffice-calibration-v1/artifact-audit'
    manifest=json.loads((root/'suffice-refinement-pilot/manifest.json').read_text())
    python_root=manifest['publicPython']['root'];results=[]
    for arm in ['pi','v1','v2','v3']:
        proc=subprocess.run(['docker','run','--rm','--network','none','--memory','2g','--cpus','1',
            '-v',str(state/arm)+':/artifacts:ro','-v',python_root+':/public-python:ro',
            '-v',str(Path(__file__).resolve())+':/audit.py:ro','--entrypoint','/public-python/bin/python3',
            'alexgshaw/polyglot-c-py:20251031','/audit.py','--inside'],capture_output=True,text=True,timeout=120)
        assert proc.returncode==0,(arm,proc.stderr)
        result={'arm':arm,**json.loads(proc.stdout)};results.append(result)
        print(json.dumps({'arm':arm,'compileExit':result['compileExit'],'publicCases':len(result['cases']),'allPass':bool(result['cases']) and all(c['matches'] for case in result['cases'] for c in case['checks'])}),flush=True)
    (state/'replay.json').write_text(json.dumps({'inference':False,'hiddenEvaluatorAccess':False,'results':results},indent=2)+'\n')
if __name__=='__main__':main()
