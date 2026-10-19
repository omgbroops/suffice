"""Repeat frozen-input checks and verify immutable starting receipts after continuation."""
import importlib.util,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('initial_postflight',ROOT/'review/broad-postflight.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
extra="""
policy=json.loads((state/'continuation-v1.json').read_text())
preserved={rel:hashlib.sha256((state/rel).read_bytes()).hexdigest()==h for rel,h in policy['preservedReceiptHashes'].items()}
controller=hashlib.sha256((root/'review/broad-resume.py').read_bytes()).hexdigest()==policy['controllerSha256']
out['startingReceiptsUnchanged']={'files':len(preserved),'allMatch':all(preserved.values())}
out['continuationControllerMatchesPolicy']=controller
out['valid']=out['valid'] and all(preserved.values()) and controller
"""
code=m.code.replace("p=state/'postflight.json'",extra+"\np=state/'continuation-postflight.json'")
if __name__=='__main__':
 r=m.module.transport.run("python3 - <<'CONTINUATION_POSTFLIGHT'\n"+code+"\nCONTINUATION_POSTFLIGHT",180)
 sys.stdout.buffer.write(r.stdout);sys.stderr.buffer.write(r.stderr)
 if r.returncode:raise SystemExit(r.returncode)
