import json, urllib.request, zipfile, io, pathlib, shutil
root=pathlib.Path('.suffice/retrieval')
if shutil.disk_usage('.').free < 1024**3: raise RuntimeError('disk floor')
for r in json.loads((root/'repositories.json').read_text()):
    target=root/'corpus'/r['revision']; target.mkdir(parents=True,exist_ok=True)
    data=urllib.request.urlopen('https://codeload.github.com/'+r['repo']+'/zip/'+r['revision']).read()
    if len(data)>20*1024**2: raise RuntimeError('archive cap')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for n in z.namelist():
            rel='/'.join(n.split('/')[1:])
            if rel.startswith(('src/','lib/')) and rel.endswith(('.js','.ts','.mjs','.cjs')) and not rel.endswith('.d.ts'):
                p=target/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(n))
    print(r['repo'],r['revision'],sum(p.stat().st_size for p in target.rglob('*') if p.is_file()),flush=True)
