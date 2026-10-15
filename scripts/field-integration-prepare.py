import pathlib, json, subprocess, urllib.request, tarfile, io, shutil, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
TASKS=ROOT/'.suffice/field-campaign-v1/tasks'
RESEARCH=ROOT/'research/field-campaign-v1/integration'
OLD=ROOT.parent/'github-field-test/research/historical'
def gh(endpoint):
    return json.loads(subprocess.check_output(['gh','api',endpoint]))
def save(p,data):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
def raw(repo,sha,name):
    return urllib.request.urlopen(f'https://raw.githubusercontent.com/{repo}/{sha}/{name}').read()
def prepare(id,repo,number,fix,prod):
    dest=TASKS/id; evidence=RESEARCH/id
    evidence.mkdir(parents=True,exist_ok=True)
    issue=gh(f'repos/{repo}/issues/{number}')
    commit=gh(f'repos/{repo}/commits/{fix}')
    base=commit['parents'][0]['sha']
    save(evidence/'issue.json',issue);save(evidence/'fix-commit.json',commit)
    (evidence/'original-issue-body.md').write_text(issue['body'],encoding='utf-8')
    archive=evidence/'base.tar.gz'
    if not archive.exists():
        archive.write_bytes(urllib.request.urlopen(f'https://codeload.github.com/{repo}/tar.gz/{base}').read())
    source=dest/'base'
    if not source.exists():
        source.mkdir(parents=True)
        with tarfile.open(archive) as tar:
            for item in tar:
                parts=pathlib.PurePosixPath(item.name).parts[1:]
                if not parts: continue
                item.name=str(pathlib.PurePosixPath(*parts))
                tar.extract(item,source,filter='data')
    refs=[]
    for name in prod:
        p=evidence/'reference'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw(repo,fix,name))
        refs.append({'source':str(p),'target':name})
    pkg=json.loads((source/'package.json').read_text())
    meta={'id':id,'cohort':'historical','repository':repo,'issue':number,'url':issue['html_url'],'title':issue['title'],'publicBody':issue['body'],'baseCommit':base,'fixCommit':fix,'baseDir':str(source),'dependencyDir':str(dest/'dependencies'),'nativeCommands':[],'acceptanceCommands':[['node','--unhandled-rejections=strict','field-acceptance.mjs']],'graderOverlay':[{'source':str(evidence/'field-acceptance.mjs'),'target':'field-acceptance.mjs'}],'referenceFiles':refs,'controls':{'baselineAccepted':None,'referenceAccepted':None,'knownNativeFailures':[]},'receipt':str(evidence/'controls.json'),'provenance':str(evidence/'provenance.json'),'ready':False}
    save(dest/'task.json',meta)
    save(evidence/'provenance.json',{'issue':issue['html_url'],'fix':commit['html_url'],'base':base,'baseArchiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'originalBodySha256':hashlib.sha256(issue['body'].encode()).hexdigest(),'selection':'Chosen by public API/state/async scope before actor execution. Source archive is pre-fix only; reference production files evaluator-private.','package':pkg})
    print(id,base,pkg.get('scripts'),flush=True)
if __name__=='__main__':
    import sys
    rows=[('i01','node-fetch/node-fetch',1386,'6e4c1e4f67b7b6b8de13bbbf88991894dc003245',['src/index.js']),('i02','node-fetch/node-fetch',1442,'dd2cea4672c5519b1ab91009541e00f0ab74520b',['src/index.js']),('i03','sindresorhus/p-limit',110,'9df0d27f82ab3cb6d7e1087f5bda94ce911d33ca',['index.js','index.d.ts'])]
    pr=gh('repos/mcollina/fastq/pulls/81');save(RESEARCH/'i04/fix-pr.json',pr)
    rows.append(('i04','mcollina/fastq',80,pr['merge_commit_sha'],['queue.js']))
    for row in rows:
        if len(sys.argv)==1 or row[0] in sys.argv[1:]:prepare(*row)
