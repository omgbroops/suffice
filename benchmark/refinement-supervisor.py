"""Detached finite Windows runner for the explicitly authorized 20 attempts."""
import json
import os
from pathlib import Path
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1]
LOCAL=ROOT/'.suffice/refinement-pilot'
STATE='/home/eric_qin/suffice-refinement-pilot'
PYTHON='/home/eric_qin/suffice-harnesstax-sol61/harbor-env/bin/python'
REMOTE='/mnt/c/Users/Eric Qin/Documents/GitHub/suffice'

def main():
    LOCAL.mkdir(parents=True,exist_ok=True)
    with (LOCAL/'campaign.log').open('ab',buffering=0) as log:
        child=subprocess.Popen(['wsl.exe','-d','Ubuntu','--exec',PYTHON,STATE+'/runtime/benchmark/refinement-pilot.py','run'],
            stdin=subprocess.DEVNULL,stdout=log,stderr=log)
        started=time.time()
        while True:
            code=child.poll()
            try:
                report=subprocess.run(['wsl.exe','-d','Ubuntu','--exec','env',
                    'HARNESS_TAX_REPORT_STATE='+STATE,'HARNESS_TAX_REPORT_OUT='+REMOTE+'/reports/refinement-pilot-v1',
                    PYTHON,REMOTE+'/benchmark/harnesstax-report.py'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=log,timeout=60)
                report_code=report.returncode
            except (OSError,subprocess.TimeoutExpired) as error:report_code=str(error)
            value={'pid':os.getpid(),'childPid':child.pid,'started':started,'heartbeat':time.time(),
                'controllerExitCode':code,'reportExitCode':report_code,'state':'running' if code is None else 'controller_exited'}
            temp=LOCAL/'supervisor.tmp';temp.write_text(json.dumps(value,indent=2)+'\n');temp.replace(LOCAL/'supervisor.json')
            if code is not None:break
            time.sleep(30)
if __name__=='__main__':main()
