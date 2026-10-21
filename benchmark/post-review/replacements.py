"""Two explicitly authorized timeout replacements, once each, after the main queue drains."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time

spec=importlib.util.spec_from_file_location('campaign',Path(__file__).with_name('campaign.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

def select(originals,replacements,plan):
    superseded={j['original'] for j in plan['jobs']}
    excluded=[r for r in originals if r['trialName'] in superseded]
    selected=[r for r in originals if r['trialName'] not in superseded]+replacements
    return selected,excluded

def publish(plan):
    manifest=json.loads((c.STATE/'manifest.json').read_text())
    originals=[r for job in manifest['jobs'] if (r:=c.read_attempt(job,job['task']+'-'+job['arm']))]
    replacements=[r for job in plan['jobs'] if (r:=c.read_attempt({'task':job['task'],'arm':job['arm']},job['replacement']))]
    selected,excluded=select(originals,replacements,plan)
    summary=[]
    for arm in ['alone','review','pi']:
        rows=[r for r in selected if r['arm']==arm];cost=sum(r['knownCostUsd'] for r in rows);accepted=sum(r['accepted'] for r in rows)
        summary.append({'arm':arm,'finished':len(rows),'accepted':accepted,'policyValidSuccesses':sum(r['policyValid'] and r['accepted'] for r in rows),
            'knownCostUsd':cost,'unknownCosts':sum(r['costUnknown'] for r in rows),'knownUsdPerAccepted':cost/accepted if accepted else None})
    result={'asOf':time.time(),'complete':len(selected)==18,'summary':summary,'selectedAttempts':selected,'excludedTimeoutOriginals':excluded,
        'allExecutedKnownCostUsd':sum(r['knownCostUsd'] for r in originals+replacements),
        'allExecutedUnknownCosts':sum(r['costUnknown'] for r in originals+replacements),'replacementPlan':plan}
    c.save(c.OUT/'primary-results.json',result)
    text='# Primary comparison: authorized timeout replacements\n\nThe two original 600-second timeouts are excluded from primary accuracy, latency, and cost totals. Their receipts and spend remain in the audit below. Each replacement is selected regardless of its outcome; no retry-until-pass.\n\n'
    text+='| Arm | Finished | Accepted | Policy-valid successes | Known USD | Unknown costs |\n| --- | ---: | ---: | ---: | ---: | ---: |\n'
    for r in summary:
        text+=f"| {r['arm']} | {r['finished']}/6 | {r['accepted']} | {r['policyValidSuccesses']} | {'at least ' if r['unknownCosts'] else ''}{r['knownCostUsd']:.6f} | {r['unknownCosts']} |\n"
    text+='\n## Excluded timeout originals\n\n'
    for r in excluded:text+=f"- {r['trialName']}: {r['exceptionType']}, known cost floor ${r['knownCostUsd']:.8f}.\n"
    text+=f"\nAll executed attempts, including excluded originals: known cost floor ${result['allExecutedKnownCostUsd']:.8f}; {result['allExecutedUnknownCosts']} incomplete cost records.\n"
    text+='\nThe completed Luna-alone attempt on the first issue retains its original 600-second cap (finished in 325.198 seconds); all other primary attempts use 1,800 seconds. The remaining five issues are the fully matched time-budget cohort. These are issue-contract checks, not proof of complete correctness.\n'
    (c.OUT/'PRIMARY-RESULTS.md').write_text(text)
    return result

async def run():
    c.validate();plan=json.loads((c.STATE/'replacement-plan.json').read_text())
    assert len(plan['jobs'])==2 and c.amendment()['agentTimeoutSec']==1800
    for job in plan['jobs']:
        original=c.STATE/'results'/(job['original']+'.json')
        assert hashlib.sha256(original.read_bytes()).hexdigest()==job['originalResultSha256']
        assert json.loads(original.read_text())['exception_info']['exception_type']=='AgentTimeoutError'
        assert not (c.STATE/'trials'/job['replacement']).exists(),'Replacement already attempted; no implicit rerun'
    # The running original controller owns both slots. Never interrupt it or
    # silently increase total concurrency for the replacement queue.
    while json.loads((c.STATE/'status.json').read_text())['state'] in ('running','draining'):
        publish(plan)
        c.save(c.STATE/'replacement-status.json',{'state':'queued','reason':'Waiting for original controller to drain','pending':2,'at':time.time()})
        await asyncio.sleep(10)
    quota=c.load('replacement_quota',c.ROOT/'benchmark/harnesstax-quota.py');active={};pending=list(plan['jobs'])
    try:
        while pending or active:
            for name,proc in list(active.items()):
                if proc.returncode is None:continue
                del active[name];print(json.dumps({'finishedReplacement':name,'exitCode':proc.returncode}),flush=True)
                if proc.returncode or not (c.STATE/'results'/(name+'.json')).exists():raise RuntimeError('Replacement stopped without receipt: '+name)
            while pending and len(active)<2:
                data=publish(plan);q=await asyncio.to_thread(quota.read_quota)
                if q['remainingPercent']<=40 or data['allExecutedKnownCostUsd']>=10:raise RuntimeError('Quota/spend admission stop')
                available=int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))/1024
                if available<1536:break
                job=pending.pop(0);name=job['replacement']
                proc=await asyncio.create_subprocess_exec(sys.executable,str(Path(__file__).with_name('campaign.py')),'one-replacement',job['task'],job['arm'])
                active[name]=proc;asyncio.create_task(proc.wait())
                print(json.dumps({'admittedReplacement':name,'timeoutSec':1800,'weeklyRemaining':q['remainingPercent']}),flush=True)
            if pending and not active:raise RuntimeError('Insufficient available memory')
            publish(plan);c.save(c.STATE/'replacement-status.json',{'state':'running','active':list(active),'pending':len(pending),'at':time.time()})
            if active:await asyncio.sleep(3)
        publish(plan);c.save(c.STATE/'replacement-status.json',{'state':'complete','at':time.time()})
    except Exception as error:
        await asyncio.gather(*(p.wait() for p in active.values()),return_exceptions=True)
        publish(plan);c.save(c.STATE/'replacement-status.json',{'state':'stopped','error':str(error),'at':time.time()});raise

if __name__=='__main__':
    if sys.argv[1]=='run':asyncio.run(run())
    elif sys.argv[1]=='report':print(json.dumps(publish(json.loads((c.STATE/'replacement-plan.json').read_text()))['summary']))
    else:raise ValueError('run | report')
