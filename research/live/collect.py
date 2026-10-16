import json, subprocess, pathlib, datetime, concurrent.futures, base64
ROOT = pathlib.Path(__file__).parent
CANDIDATES = [('DirtyHairy/async-mutex',94),('DirtyHairy/async-mutex',88),('sindresorhus/p-queue',254),('sindresorhus/p-queue',177),('nodejs/undici',6013),('nodejs/undici',5981),('nodejs/undici',5974),('fastify/fastify',7090),('fastify/fastify',7043),('paulmillr/chokidar',1493),('piscinajs/piscina',1029),('piscinajs/piscina',1143),('vitest-dev/vitest',11571),('vitest-dev/vitest',11585)]
def gh(args):
    p = subprocess.run(['gh',*args],capture_output=True,text=True,encoding='utf-8')
    if p.returncode: return {'fetch_error':p.stderr, 'args':args}
    try: return json.loads(p.stdout)
    except ValueError: return {'raw':p.stdout}
def save(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
def issue(item):
    repo,n=item
    folder=ROOT/'snapshots'/repo.replace('/','__')/str(n)
    for name,args in [('issue',['api',f'repos/{repo}/issues/{n}']),('comments',['api','--paginate','--slurp',f'repos/{repo}/issues/{n}/comments?per_page=100']),('timeline',['api','--paginate','--slurp',f'repos/{repo}/issues/{n}/timeline?per_page=100'])]:
        save(folder/f'{name}.json',gh(args))
    obj=json.loads((folder/'issue.json').read_text(encoding='utf-8'))
    return (repo,n,obj.get('title'),obj.get('state'))
def metadata(repo):
    folder=ROOT/'snapshots'/repo.replace('/','__')
    meta=gh(['api',f'repos/{repo}']);save(folder/'repository.json',meta)
    branch=meta.get('default_branch','main')
    save(folder/'head.json',gh(['api',f'repos/{repo}/commits/{branch}']))
    save(folder/'root-contents.json',gh(['api',f'repos/{repo}/contents']))
    save(folder/'open-prs.json',gh(['pr','list','--repo',repo,'--state','open','--limit','100','--json','number,title,url,body,updatedAt,assignees,isDraft']))
    pkg=gh(['api',f'repos/{repo}/contents/package.json']);save(folder/'package-api.json',pkg)
    if 'content' in pkg: (folder/'package.json').write_bytes(base64.b64decode(pkg['content']))
    return (repo,meta.get('pushed_at'),meta.get('archived'),meta.get('license',{}))
if __name__=='__main__':
    save(ROOT/'provenance.json',{'collected_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'collector':'gh CLI REST/GraphQL read-only; no public communication, cloning, tests, or implementation','issues':CANDIDATES,'note':'Open status is point-in-time. PR timeline plus up to 100 open PRs per repository; not proof of absence of all unlinked work.'})
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        for x in ex.map(issue,CANDIDATES): print(x)
        for x in ex.map(metadata,sorted(set(r for r,n in CANDIDATES))): print(x)
