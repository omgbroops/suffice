import hashlib,json,math,statistics,collections
from pathlib import Path
base=Path('.ci-logs/macos-pairs-12')
out=Path('.ci-logs')
j=lambda p: json.loads(p.read_text())
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        while chunk:=f.read(1<<20): h.update(chunk)
    return h.hexdigest()
c=j(base/'campaign.json');rr=j(base/'renderers.json')
assert c['complete'] and not c['errors'] and len(c['pairs'])==10 and c['options']['pairs']==5
assert c['environment']['meetsPackageOSFloor'] is False and c['environment']['minimumMacOS']=='27.0'
assert c['inputFingerprint']==c['finalInputFingerprint'] and c['sameRenderer'] and rr['electron']==rr['wry']
assert len(c['fixture']['sessionFiles'])==30 and c['fixture']['largeMessageCount']==1000
for v in c['artifacts'].values(): assert Path(v['file']).stat().st_size==v['bytes'] and sha(Path(v['file']))==v['sha256'],v
assert sha(base/'macos-accounting')==c['observer']['sha256']==c['observer']['finalSha256']
phases=['ready','select','settings','pty'];checks={}; samplevals={}; rawhash={}; seenCoal=set();seenJet=set(); roots=set(); wkIds=set(); runGroups=[]
def numeric(x): return isinstance(x,(int,float)) and math.isfinite(x)
def close(x,y): assert math.isclose(x,y,rel_tol=1e-11,abs_tol=1e-8),(x,y)
for i,p in enumerate(c['pairs']):
    pair=i//2+1; host=(['electron','wry'] if pair%2 else ['wry','electron'])[i%2]; key=f'{pair:02}-{host}'
    assert (pair,host)==(p['pair'],p['host']) and p['receipt']==key+'/receipt.json'
    path=base/p['receipt'];r=j(path);rawhash[key]=sha(path); assert not r['errors'] and not p['errors']
    assert r['pair']==pair and r['host']==host and r['job']['pid']==r['pid'] and r['exit']['exit']=='0'
    assert r['fixtureBefore']==r['fixtureAfter']==c['fixture']['sessionFiles']
    assert r['projectBefore']==r['projectAfter']==c['fixture']['projectStamp']
    cleanup=r['cleanup'];assert all(cleanup[k] for k in ['complete','bootedOut','processesRetired','storesResolved','sharedProjectIntact','scratchRemoved','scratchResolved'])
    assert cleanup['members']==[] and not Path(r['scratch']).exists()
    ledger=cleanup['ledger'];assert ledger['error']==3 or (ledger['error']==0 and ledger['tasksStarted']==ledger['tasksExited'])
    assert list(r['phases'])==phases+['finish']; ready=r['phases']['ready']['receipt']; sel=r['phases']['select']['receipt']
    assert [ready[k] for k in ['width','height','devicePixelRatio','threadCount']]==[1440,900,2,30]
    assert sel['threadCount']==30 and sel['transcriptCharacters']==p['selectedCharacters']==29389 and sel['marker']=='Rust host fixture message 999'
    assert r['phases']['settings']['receipt']['marker']=='Configure OpenAI'
    pt=r['phases']['pty']['receipt'];assert pt['terminalVisible'] and pt['marker']=='SUFFICE_MACOS_PTY_READY'
    assert all(numeric(x['elapsedMs']) and x['elapsedMs']>=0 for x in r['phases'].values())
    coal=r['job']['resource'];jet=r['job']['jetsam'];assert coal==p['resource'] and jet==p['jetsam'] and coal not in seenCoal and jet not in seenJet
    seenCoal.add(coal);seenJet.add(jet)
    if host=='electron':
        v=r['viewportAdjustment']; assert v['inspectorClosed'] and v['owner']['pid']==r['pid'] and v['owner']['profile']==v['expectedOwner']['profile'] and v['owner']['type']=='browser'
        assert v['window']['windowId']>0 and v['window']['webContentsId']>0 and v['window']['devToolsTargetId']
        assert len(v['steps'][-1]['frames'])==3 and all([f['width'],f['height'],f['devicePixelRatio']]==[1440,900,2] for f in v['steps'][-1]['frames'])
        assert v['elapsedMs']<r['phases']['ready']['elapsedMs']<r['snapshots'][0]['observerElapsedMs']
    else:
        st=cleanup['webkit']; assert st['receipt'] and st['existed'] and st['removedOrAbsent'] and st['id'] not in wkIds;wkIds.add(st['id'])
    assert len(r['snapshots'])==12 and [s['phase'] for s in r['snapshots']]==[phase for phase in phases for _ in range(3)]
    rootStart=None;memberIds=set();roleNames=set(); valid=collections.defaultdict(list); prev=None
    for s in r['snapshots']:
        raw=s['raw'];before=raw['before'];after=raw['after'];members=raw['members'];summary=s['summary']
        assert not summary['errors'] and s['attempt']==1 and before['error']==after['error']==0 and before['physicalBytes']>0 and after['physicalBytes']>0
        assert before['tasksStarted']==after['tasksStarted'] and before['tasksExited']==after['tasksExited'] and after['tasksStarted']-after['tasksExited']==len(set(m['pid'] for m in members))==len(members)
        assert raw['resource']==coal and raw['jetsam']==jet and all(m['resource']==coal and m['jetsam']==jet and m['error']==0 and int(m['start'])>0 for m in members)
        assert any(m['pid']==r['pid'] and m['start']==raw['rootStart'] for m in members)
        if rootStart is None:rootStart=raw['rootStart']
        assert rootStart==raw['rootStart'] and int(rootStart)>0
        assert sum(m['rssBytes'] for m in members)==summary['rssBytes'] and sum(m['physicalBytes'] for m in members)==summary['memberPhysicalBytes'] and after['physicalBytes']==summary['physicalBytes']
        assert int(before['ticks'])<=int(after['ticks']) and int(before['cpuTicks'])<=int(after['cpuTicks'])
        coeff=raw['numer']/raw['denom']/1e6
        if prev:
            dc=int(after['cpuTicks'])-int(prev['after']['cpuTicks']);dt=int(after['ticks'])-int(prev['after']['ticks']);assert dc>=0 and dt>0
            close(s['interval']['cpuMs'],dc*coeff);close(s['interval']['wallMs'],dt*coeff);close(s['interval']['percentOfOneCore'],100*dc/dt)
        valid[s['phase']].append((s, int(after['cpuTicks'])*coeff,int(after['ticks'])*coeff));prev=raw
        for m in members: memberIds.add((m['pid'],m['start']));roleNames.add(m['name'])
    assert (r['pid'],rootStart) not in roots;roots.add((r['pid'],rootStart))
    retired={(a['pid'],a['start']) for a in cleanup['identities'] if a['status'] in ('exited','pid-reused')};assert retired==memberIds
    if host=='wry': assert all(n in roleNames for n in ['com.apple.WebKit.WebContent','com.apple.WebKit.GPU','com.apple.WebKit.Networking','node'])
    else:assert any('Renderer' in n for n in roleNames)
    metrics={f'{phase}.latencyMs':r['phases'][phase]['elapsedMs'] for phase in phases+['finish']}
    metrics['shutdownFromFinishMs']=r['shutdownFromFinishMs']; metrics['adjustmentMs']=r.get('viewportAdjustment',{}).get('elapsedMs',0)
    for k,phase in enumerate(phases):
        snaps=valid[phase]; first,last=snaps[0],snaps[-1]
        for name in ['physicalBytes','rssBytes']:metrics[f'{phase}.{name}']=statistics.median(s[0]['summary'][name] for s in snaps)
        metrics[f'{phase}.settledCpuPercentOneCore']=100*(last[1]-first[1])/(last[2]-first[2])
        metrics[f'{phase}.cpuWindowMs']=last[1]-(valid[phases[k-1]][-1][1] if k else 0)
        metrics[f'{phase}.cumulativeCpuMs']=last[1]
    samplevals[key]=metrics; runGroups.append({'sample':key,'rootPid':r['pid'],'rootStart':rootStart,'resource':coal,'jetsam':jet,'attributedIdentities':len(memberIds),'reconciledSnapshots':12,'retired':len(retired),'names':sorted(roleNames)})
def diff(a,b):return None if a==0 else 100*(b-a)/a
metrics={}
for name in samplevals['01-electron']:
    e=[samplevals[f'{i:02}-electron'][name] for i in range(1,6)];w=[samplevals[f'{i:02}-wry'][name] for i in range(1,6)]
    me=statistics.median(e);mw=statistics.median(w);d=[b-a for a,b in zip(e,w)];pct=[diff(a,b) for a,b in zip(e,w)]
    metrics[name]={'electron':e,'wry':w,'electronMedian':me,'wryMedian':mw,'hostMedianDifferencePct':diff(me,mw),'pairedDifferences':d,'pairedDifferenceMedian':statistics.median(d),'pairedDifferencePcts':pct,'pairedPercentMedian':statistics.median(pct) if all(x is not None for x in pct) else None}
result={'campaign':'macos-pairs-12','rawCampaignSha256':sha(base/'campaign.json'),'rawReceiptHashes':rawhash,'fixtureHashCount':len(c['fixture']['sessionFiles']),'matchingRendererFiles':len(rr['electron']),'runtimeFingerprint':c['inputFingerprint'],'observerSha256':c['observer']['sha256'],'currentArtifactHashesRechecked':list(c['artifacts']),'runEvidence':runGroups,'sampleCounts':{'hosts':10,'pairs':5,'validSnapshots':120,'rejectedAttempts':0},'platform':c['environment'],'calculation':'Per host-run per phase median of three adjacent physical/RSS snapshots, then median over five runs. Paired difference=Wry-Electron; paired percent=100*(Wry/Electron-1); host median ratio is separate. Each cpuWindowMs is cumulative coalition CPU through final ready snapshot or final-snapshot-to-final-snapshot difference across later phases. Settled CPU is delta CPU / delta wall over the first-to-third snapshot of each phase.','metrics':metrics}
(out/'perf-results-12-summary.json').write_text(json.dumps(result,indent=2)+'\n')
for name,m in metrics.items(): print(f"{name:33} {m['electronMedian']:>13,.2f} {m['wryMedian']:>13,.2f} {m['hostMedianDifferencePct']!s:>13.12} {m['pairedPercentMedian']!s:>13.12}")
