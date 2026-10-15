"""Derive a distinct loader-aware model-free audit; original audit stays intact."""
import pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=(ROOT/'scripts/audit-luna-safeguards-probes.mjs').read_text(encoding='utf8')
s=s.replace('luna-safeguards-probe-audit-v1','luna-safeguards-probe-audit-v2').replace('probe-control-audit.json','probe-control-audit-v2.json')
s=s.replace("reference-patch-completion/patch.json","reference-patch-completion/captured-production.json")
s=s.replace("command:['node','.suffice-checks/'+name+'.mjs']","command:['node',...t.nativeCommands.some(c=>c.includes('--import=tsx/esm'))?['--import=tsx/esm']:[],'.suffice-checks/'+name+'.mjs']")
(ROOT/'scripts/audit-luna-safeguards-probes-v2.mjs').write_text(s,encoding='utf8')
