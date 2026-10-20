"""Windows detached supervisor for this finite campaign, without model retries.

Launch with Start-Process -WindowStyle Hidden. The WSL controller owns admission
and quota checks; this process updates reports and records its exit for inspection.
"""
import json
import os
from pathlib import Path
import subprocess
import time
import sys

ROOT=Path(__file__).resolve().parents[1]
LOCAL=ROOT/'.suffice/harnesstax-sol61'
STATE='/home/eric_qin/suffice-harnesstax-sol61'
PYTHON=STATE+'/harbor-env/bin/python'


def main():
    LOCAL.mkdir(parents=True,exist_ok=True)
    status=LOCAL/'supervisor.json'
    command=['wsl.exe','-d','Ubuntu','--exec',PYTHON,STATE+'/runtime/benchmark/harnesstax-campaign.py','run']
    if '--replacements-first' in sys.argv:
        command=['wsl.exe','-d','Ubuntu','--exec',PYTHON,STATE+'/replacement-runtime/harnesstax-replacements.py','run']
    with (LOCAL/'detached-campaign.log').open('ab',buffering=0) as log:
        child=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=log,stderr=log)
        started=time.time()
        while True:
            code=child.poll()
            # Reports consume receipts only. They never feed actor prompts.
            try:
                report=subprocess.run(['wsl.exe','-d','Ubuntu','--exec',PYTHON,
                    '/mnt/c/Users/Eric Qin/Documents/GitHub/suffice/benchmark/harnesstax-report.py'],
                    stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=log,timeout=60)
                report_code=report.returncode
            except (OSError,subprocess.TimeoutExpired) as error:
                report_code=str(error)
            value={'pid':os.getpid(),'childPid':child.pid,'started':started,'heartbeat':time.time(),
                'controllerExitCode':code,'reportExitCode':report_code,
                'state':'running' if code is None else 'controller_exited'}
            temp=status.with_suffix('.tmp');temp.write_text(json.dumps(value,indent=2)+'\n');temp.replace(status)
            if code is not None: break
            time.sleep(30)


if __name__=='__main__': main()
