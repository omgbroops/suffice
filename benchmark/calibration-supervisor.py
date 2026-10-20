"""Finite detached Windows supervisor; native report reads avoid WSL launch stalls."""
import json
import os
from pathlib import Path
import subprocess
import time


def wait_for_predecessor(pid):
    """Wait for the existing finite supervisor; never interrupt its live actor."""
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x100000, False, pid)
    if not handle:
        if ctypes.get_last_error() == 87:  # The process has already exited.
            return
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        if kernel.WaitForSingleObject(handle, 3600000) != 0:
            raise RuntimeError('Predecessor did not exit within the finite recovery wait')
    finally:
        kernel.CloseHandle(handle)


def validate_review(path, state=None, report_path=None):
    """Resume only reviewed interruptions, retaining grades and unknown costs."""
    import hashlib
    state = state or Path(r'\\wsl.localhost\Ubuntu\home\eric_qin\suffice-calibration-v1')
    review = json.loads(Path(path).read_text(encoding='utf-8'))
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    assert sha(state/'manifest.json') == review['manifestSha256']
    assert review['replaceCompletedAttempts'] is False and review['concurrency'] == 2
    reviewed = {item['attempt']: item for item in review['interruptions']}
    for trial in (state/'trials').iterdir():
        if trial.is_dir():
            assert (state/'results'/(trial.name+'.json')).exists(), 'Partial attempt needs review: '+trial.name
    report = json.loads((report_path or ROOT/'reports/calibration-v1/results.json').read_text())
    for row in report['attempts']:
        if (row['costUnknown'] or not row.get('graded') or row.get('exceptionType')
                or row['status'] in ['operational_failure','budget_stopped']):
            name = row['task']+'-'+row['arm']
            assert name in reviewed, 'New interruption needs review: '+name
            worker = state/'trials'/name/'agent/receipts/worker.json'
            assert sha(worker) == reviewed[name]['workerSha256'], 'Reviewed receipt changed: '+name

ROOT=Path(__file__).resolve().parents[1]
LOCAL=ROOT/'.suffice/calibration-v1'
STATE='/home/eric_qin/suffice-calibration-v1'
PYTHON='/home/eric_qin/suffice-harnesstax-sol61/harbor-env/bin/python'

def main():
    LOCAL.mkdir(parents=True,exist_ok=True)
    if os.environ.get('CALIBRATION_WAIT_PID'):
        wait_for_predecessor(int(os.environ['CALIBRATION_WAIT_PID']))
    if os.environ.get('CALIBRATION_REVIEW'):
        subprocess.run(['python','-X','utf8',str(ROOT/'benchmark/calibration-report.py')],check=True,stdout=subprocess.DEVNULL)
        validate_review(os.environ['CALIBRATION_REVIEW'])
    with (LOCAL/'campaign.log').open('ab',buffering=0) as log:
        resume=os.environ.get('CALIBRATION_RESUME')=='1'
        replacements=os.environ.get('CALIBRATION_REPLACEMENTS')=='1'
        script='/mnt/c/Users/Eric Qin/Documents/GitHub/suffice/benchmark/calibration-replacements.py' if replacements else '/mnt/c/Users/Eric Qin/Documents/GitHub/suffice/benchmark/calibration-resume.py' if resume else STATE+'/runtime/benchmark/calibration-campaign.py'
        child=subprocess.Popen(['wsl.exe','-d','Ubuntu','--exec',PYTHON,script,*([] if resume and not replacements else ['run'])],stdin=subprocess.DEVNULL,stdout=log,stderr=log)
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
