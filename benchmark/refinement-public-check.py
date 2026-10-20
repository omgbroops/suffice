"""Small public contract checks. No evaluator/solution files are read.

The fixture mount contains only initial environment source/data from the task.
These checks are visible to all three actors and do not certify full correctness.
"""
import asyncio
import csv
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

APP=Path('/app')
FIXTURES=Path('/public-fixtures')


def run(argv, cwd=APP, timeout=20):
    result=subprocess.run(argv,cwd=cwd,capture_output=True,text=True,timeout=timeout)
    assert result.returncode==0, f'{argv[0]} exit {result.returncode}: {(result.stdout+result.stderr)[-3500:]}'
    return result.stdout


def cancellation():
    spec=importlib.util.spec_from_file_location('candidate',APP/'run.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    async def scenario():
        active=0;peak=0;completed=[];cleaned=[];started=asyncio.Event()
        async def job(i,block=False):
            nonlocal active,peak
            active+=1;peak=max(peak,active)
            if active==2:started.set()
            try:
                await asyncio.sleep(20 if block else .01)
                completed.append(i)
            finally:
                await asyncio.sleep(.01)
                cleaned.append(i);active-=1
        await asyncio.wait_for(module.run_tasks([lambda i=i:job(i) for i in range(5)],2),2)
        assert sorted(completed)==list(range(5)) and peak<=2 and active==0, 'Jobs or concurrency contract failed'
        completed.clear();cleaned.clear();started.clear()
        controller=asyncio.create_task(module.run_tasks([lambda i=i:job(i,True) for i in range(4)],2))
        await asyncio.wait_for(started.wait(),2)
        controller.cancel()
        try:await asyncio.wait_for(controller,2)
        except asyncio.CancelledError:pass
        assert active==0 and len(cleaned)==2 and not completed, 'Cancellation returned before active jobs cleaned up'
    asyncio.run(scenario())


def cobol():
    assert (APP/'program.py').is_file(), 'Missing /app/program.py'
    fixture=FIXTURES/'cobol-modernization'
    with tempfile.TemporaryDirectory(prefix='public-cobol-') as folder:
        ref=Path(folder)
        shutil.copytree(fixture/'data',ref/'data');shutil.copytree(fixture/'src',ref/'src')
        run(['cobc','-x','-o',str(ref/'reference'),str(ref/'src/program.cbl')],cwd=ref)
        run([str(ref/'reference')],cwd=ref)
        names=['ACCOUNTS.DAT','BOOKS.DAT','TRANSACTIONS.DAT']
        paths=[APP/'data'/n for n in names]+[APP/'src/INPUT.DAT']
        original={p:p.read_bytes() if p.exists() else None for p in paths}
        try:
            for p in paths:
                p.parent.mkdir(parents=True,exist_ok=True)
                p.write_bytes((fixture/p.relative_to(APP)).read_bytes())
            run(['python3',str(APP/'program.py')])
            for name in names:
                assert (APP/'data'/name).read_bytes()==(ref/'data'/name).read_bytes(), f'Public fixture differs: {name}'
        finally:
            for p,data in original.items():
                if data is None:p.unlink(missing_ok=True)
                else:p.write_bytes(data)


def heap():
    fixture=FIXTURES/'custom-memory-heap-crash/program'
    for name in ['main.cpp','user.h']:
        assert (APP/name).read_bytes()==(fixture/name).read_bytes(), f'Forbidden edit: {name}'
    for mode,flags in [('release',['-O2','-DNDEBUG']),('debug',['-g','-O0'])]:
        exe=APP/mode
        run(['g++','-std=c++17','-o',str(exe),str(APP/'main.cpp'),str(APP/'user.cpp'),*flags,
             f'-L/usr/local/gcc-custom-{mode}/lib64','-Wl,-Bstatic','-lstdc++','-Wl,-Bdynamic','-lm'])
        run([str(exe)])
        run(['valgrind','--leak-check=full','--show-leak-kinds=all','--errors-for-leak-kinds=all','--error-exitcode=42',str(exe)])


def climate():
    fixture=FIXTURES/'modernize-scientific-stack/climate_analyzer'
    legacy=APP/'climate_analyzer/analyze_climate.py'
    assert legacy.read_bytes()==(fixture/'analyze_climate.py').read_bytes(), 'Legacy source was modified'
    source=(APP/'analyze_climate_modern.py').read_text()
    assert 'pathlib' in source and 'pandas' in source, 'Missing public pathlib/pandas requirement'
    deps=[p.read_text().lower() for p in [APP/'requirements.txt',APP/'pyproject.toml'] if p.exists()]
    assert any(all(re.search(r'\b'+n+r'\b[^\n]*?(?:>=|==|~=)',d) for n in ['numpy','pandas'])
               and any(re.search(r'\b'+n+r'\b[^\n]*?(?:>=|==|~=)',d) for n in ['matplotlib','scipy']) for d in deps), 'Missing version-constrained dependencies'
    rows=list(csv.DictReader((APP/'climate_analyzer/sample_data/climate_data.csv').open(encoding='utf-8')))
    output=run(['python3',str(APP/'analyze_climate_modern.py')])
    for station in ['101','102']:
        values=[float(r['temperature']) for r in rows if r['station_id']==station]
        expected=f'Station {station} mean temperature: {sum(values)/len(values):.1f}°C'
        assert expected in output, f'Missing expected public output: {expected}'


def polyglot():
    source=APP/'polyglot/main.py.c'
    with tempfile.TemporaryDirectory(prefix='public-polyglot-') as folder:
        executable=Path(folder)/'cmain'
        run(['gcc',str(source),'-o',str(executable)])
        a,b=0,1
        for n in range(13):
            expected=str(a)
            assert run(['python3',str(source),str(n)]).strip()==expected, f'Python Fibonacci({n}) differs'
            assert run([str(executable),str(n)]).strip()==expected, f'C Fibonacci({n}) differs'
            a,b=b,a+b


CHECKS={'cancel-async-tasks':cancellation,'cobol-modernization':cobol,
        'custom-memory-heap-crash':heap,'modernize-scientific-stack':climate,'polyglot-c-py':polyglot}
if __name__=='__main__':
    try:
        if sys.argv[1]=='cancel-async-tasks' and '--system-python' not in sys.argv:
            # The task explicitly asks for system Python. The independent check
            # launcher must not change the interpreter used for this candidate.
            print(run(['python3',__file__,'cancel-async-tasks','--system-python']),end='')
            sys.exit(0)
        CHECKS[sys.argv[1]]()
        print(json.dumps({'status':'passed','coverage':'public smoke contracts only'}))
    except Exception as error:
        print(json.dumps({'status':'failed','error':str(error)}));sys.exit(1)
