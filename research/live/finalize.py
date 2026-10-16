import json, pathlib, datetime, re, concurrent.futures
from collect import ROOT, gh, save
SNAP=ROOT/'snapshots'
def pages(path): return [x for page in json.loads(path.read_text(encoding='utf-8')) for x in page]
items=[]
for p in SNAP.glob('*/*/issue.json'):
    issue=json.loads(p.read_text(encoding='utf-8')); folder=p.parent
    refs=[]
    for t in pages(folder/'timeline.json'):
        obj=t.get('source',{}).get('issue',{})
        if obj.get('pull_request'): refs.append(obj['html_url'])
    texts=[issue.get('body') or '']+[c.get('body','') for c in pages(folder/'comments.json')]
    for text in texts:
        refs += re.findall(r'https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/\d+',text)
    items.append((p,issue,sorted(set(refs))))
urls=sorted(set(url for _,_,refs in items for url in refs))
def pull(url):
    owner,repo,_,num=url.split('github.com/')[1].split('/')
    obj=gh(['api',f'repos/{owner}/{repo}/pulls/{num}'])
    save(SNAP/f'{owner}__{repo}'/'linked-pr-details'/f'{num}.json',obj)
    return url, {'state':obj.get('state'),'merged_at':obj.get('merged_at'),'draft':obj.get('draft'),'updated_at':obj.get('updated_at'),'title':obj.get('title'),'fetch_error':obj.get('fetch_error')}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: details=dict(ex.map(pull,urls))
save(ROOT/'linked-pr-status.json',details)
records=[]
for p,issue,refs in items:
    repo=issue['repository_url'].split('repos/')[1]
    repository=json.loads((p.parent.parent/'repository.json').read_text(encoding='utf-8'))
    head=json.loads((p.parent.parent/'head.json').read_text(encoding='utf-8'))
    records.append({'repo':repo,'number':issue['number'],'url':issue['html_url'],'title':issue['title'],'state':issue['state'],'created_at':issue['created_at'],'updated_at':issue['updated_at'],'assignees':[a['login'] for a in issue['assignees']],'comment_count':issue['comments'],'author':issue['user']['login'],'repository_last_push':repository.get('pushed_at'),'repository_archived':repository.get('archived'),'snapshot_head':head.get('sha'),'raw_issue':str(p.relative_to(ROOT)).replace('\\','/'),'raw_comments':str((p.parent/'comments.json').relative_to(ROOT)).replace('\\','/'),'raw_timeline':str((p.parent/'timeline.json').relative_to(ROOT)).replace('\\','/'),'linked_prs':[{'url':u,**details[u]} for u in refs]})
save(ROOT/'all-screened-live-status.json',records)
save(ROOT/'provenance.json',{'collected_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'collector':'gh CLI REST/GraphQL read-only','issues_screened':len(records),'linked_prs_fetched':len(urls),'scope':'Issue body/comments/timeline; current repository metadata/default head/package/root listing; up to 100 open PRs per repository; direct current details for timeline/comment-linked PRs','limitations':['No reproductions executed; reported behavior remains independent-verification candidate.','No clones, installs, tests, code implementation, harness edits, or public communication.','Open status is point-in-time. Absence of linked work is not proof that unlinked/private work does not exist.','Repository pushes alone may be dependency automation; low-activity flags are retained.']})
print(f'{len(records)} issues, {len(urls)} linked PRs; snapshots complete')
