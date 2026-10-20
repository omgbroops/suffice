"""Read subscription quota through the local native CLI; never start a turn."""
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time


def read_quota(timeout=30, command=None):
    if command is None:
        node=shutil.which('node.exe' if os.name!='nt' else 'node')
        if not node: raise RuntimeError('Windows Node executable unavailable for quota check')
        launcher=Path(node).parent/'node_modules/@openai/codex/bin/codex.js'
        if not launcher.exists(): raise RuntimeError('Native Codex launcher not found next to Windows Node')
        if os.name!='nt':
            launcher_name=subprocess.check_output(['wslpath','-w',str(launcher)],text=True).strip()
        else: launcher_name=str(launcher)
        command=[node,launcher_name,'app-server']
    p=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
      stderr=subprocess.DEVNULL,text=True,bufsize=1)
    lines=queue.Queue()
    def pump():
        for line in p.stdout: lines.put(line)
        lines.put(None)
    threading.Thread(target=pump,daemon=True).start()
    def send(value): p.stdin.write(json.dumps(value)+'\n');p.stdin.flush()
    deadline=time.monotonic()+timeout
    try:
        send({'id':1,'method':'initialize','params':{'clientInfo':{'name':'suffice-benchmark-quota','version':'1'},'capabilities':{}}})
        while time.monotonic()<deadline:
            line=lines.get(timeout=max(.1,deadline-time.monotonic()))
            if line is None: raise RuntimeError('Quota reader exited')
            try: row=json.loads(line)
            except json.JSONDecodeError: continue
            if row.get('id')==1:
                if 'error' in row: raise RuntimeError('Quota initialization failed')
                send({'method':'initialized','params':{}})
                send({'id':2,'method':'account/rateLimits/read','params':{}})
            if row.get('id')==2:
                if 'error' in row: raise RuntimeError('Native quota request failed')
                result=row['result']; buckets=result.get('rateLimitsByLimitId') or {'codex':result.get('rateLimits')}
                weekly=[]
                for key,bucket in buckets.items():
                    if not bucket: continue
                    for name in ['primary','secondary']:
                        window=bucket.get(name)
                        if window and window.get('windowDurationMins')==10080:
                            weekly.append({'limitId':key,'usedPercent':window['usedPercent'],
                              'remainingPercent':max(0,100-window['usedPercent']),'resetsAt':window.get('resetsAt')})
                if not weekly: raise RuntimeError('Weekly usage window unavailable')
                return {'at':time.time(),'windows':weekly,
                        'remainingPercent':min(w['remainingPercent'] for w in weekly),
                        'source':'native account/rateLimits/read; no model turn'}
        raise RuntimeError('Quota request timed out')
    finally:
        p.terminate()
        try: p.wait(timeout=5)
        except subprocess.TimeoutExpired: p.kill();p.wait()


if __name__=='__main__': print(json.dumps(read_quota()))
