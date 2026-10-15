import pathlib,json,subprocess,shutil,concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[1]
def linux(p):return '/mnt/c/'+str(p.resolve()).replace('\\','/')[3:]
def install(id):
    dest=ROOT/'.suffice/field-campaign-v1/tasks'/id
    deps=dest/'dependencies';deps.mkdir(exist_ok=True)
    shutil.copy2(dest/'base/package.json',deps/'package.json')
    cmd=['wsl.exe','-d','Ubuntu','--','env','PATH=/home/mohammed/suffice-general-runtime/bin:/usr/bin:/bin','npm','install','--ignore-scripts','--no-audit','--no-fund','--prefix',linux(deps)]
    r=subprocess.run(cmd,capture_output=True,text=True)
    ev=ROOT/'research/field-campaign-v1/integration'/id
    (ev/'dependency-install.log').write_text(r.stdout+'\n'+r.stderr,encoding='utf-8')
    if r.returncode:raise RuntimeError(id+r.stderr[-1000:])
    shutil.copy2(deps/'package-lock.json',dest/'base/package-lock.json')
    subprocess.run(['wsl.exe','-d','Ubuntu','--','ln','-s',linux(deps/'node_modules'),linux(dest/'base/node_modules')],check=True)
    print(id,'installed',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as e:list(e.map(install,['i01','i02','i03','i04']))
