"""Preserve failed zero-call setup manifest; correct only evaluator inventory guard."""
import pathlib,json,hashlib,shutil,datetime
root=pathlib.Path('/home/eric_qin/suffice-field-v1');state=root/'.suffice/luna-evidence-v1';here=root/'experiments/luna-evidence-v1'
assert not (state/'attempts').exists(), 'No amendment after actor preparation'
for path in (state/'setup').rglob('events.live.jsonl'):
 for line in path.read_text().splitlines():assert json.loads(line).get('type')!='provider_request'
old=state/'manifest.json';backup=state/'setup/pre-inference-manifest-1.json';assert not backup.exists();shutil.copyfile(old,backup)
m=json.loads(old.read_text());m['inputs']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in here.rglob('*') if p.is_file()};m['preInferenceAmendment']={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reason':'Correct pilot evaluator assertion to unchanged startup underlying tool inventory; provider requests still codemode-only','providerCalls':0,'previousManifestSha256':hashlib.sha256(backup.read_bytes()).hexdigest()};old.write_text(json.dumps(m,indent=2)+'\n');(state/'setup/pre-inference-amendment.json').write_text(json.dumps(m['preInferenceAmendment'],indent=2)+'\n');print(json.dumps(m['preInferenceAmendment']))
