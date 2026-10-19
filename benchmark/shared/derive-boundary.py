"""Mechanical derivation keeps the historical boundary unchanged and reviewable."""
from pathlib import Path
root = Path(__file__).resolve().parents[2]
text = (root / 'benchmark/broad-execution.mjs').read_text()
text = text[:text.index('const OLD=')] + """const OLD='/home/eric_qin/suffice-field-v1';
export const canonicalState=OLD+'/.suffice/pi';
const NODE_RUNTIME='/home/eric_qin/suffice-general-runtime';
const LINUX_RUNTIME=ROOT;
const MODEL='gpt-6.1-sol',EFFORT='medium';
const inside=(parent,child)=>{const r=relative(parent,child);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('../'));};
""" + text[text.index('export async function executeIsolated'):]
text = text.replace("resolve(import.meta.dirname,'..')", "resolve(import.meta.dirname,'../..')")
text = text.replace("LINUX_RUNTIME+'/app'", "LINUX_RUNTIME")
text = text.replace("'--ro-bind',NODE_RUNTIME+'/app/node_modules','/runtime/node_modules',", "")
text = text.replace("'--bind',canonicalState,'/runtime/.suffice/pi'", "'--tmpfs','/runtime/.suffice','--dir','/runtime/.suffice/pi',...(network?['--bind',canonicalState,'/runtime/.suffice/pi']:[])")
text = text.replace("'.suffice/broad-bench-v1/dependencies'", "'.suffice/shared-core-v1/dependencies'")
text = text.replace("'--tmpfs','/runtime/.suffice/pi/events');", "'--tmpfs','/runtime/.suffice/pi/events','--ro-bind',resolve(ROOT,'benchmark/shared/public'),'/public-contracts','--tmpfs','/runtime/benchmark');")
text = text.replace('// Remote Linux host binding only. Frozen general-v1 agent/tools/config are unchanged.', '// Shared-core campaign boundary derived from broad-execution; original stays unchanged.')
(root / 'benchmark/shared/execution.mjs').write_text(text)
