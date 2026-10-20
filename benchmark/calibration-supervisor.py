"""Finite detached Windows supervisor; native report reads avoid WSL launch stalls."""
import json
import os
from pathlib import Path
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1]
LOCAL=ROOT/'.suffice/calibration-v1'
STATE='/home/eric_qin/suffice-calibration-v1'
PYTHON='/home/eric_qin/suffice-harnesstax-sol61/harbor-env/bin/python'

def main():
    LOCAL.mkdir(parents=True,exist_ok=True)
    with (LOCAL/'campaign.log').open('ab',buffering=0) as log:
        child=subprocess.Popen(['wsl.exe','-d','Ubuntu','--exec',PYTHON,STATE+'/runtime/benchmark/calibration-campaign.py','run'],stdin=subprocess.DEVNULL,stdout=log,stderr=log)
        started=time.time()
        while True:
            code=child.poll()
            try:
                report=subprocess.run(['python','-X','utf8',str(ROOT/'benchmark/calibration-report.py')],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=log,timeout=45)
                report_code=report.returncode
            except (OSError,subprocess.TimeoutExpired) as error:report_code=str(error)
            value={'pid':os.getpid(),'childPid':child.pid,'started':started,'heartbeat':time.time(),'controllerExitCode':code,'reportExitCode':report_code,'state':'running' if code is None else 'controller_exited'}
            tmp=LOCAL/'supervisor.tmp';tmp.write_text(json.dumps(value,indent=2)+'\n');tmp.replace(LOCAL/'supervisor.json')
            if code is not None:break
            time.sleep(25)
if __name__=='__main__':main()
