import {readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'../..');
const output=resolve(root,'docs/rust-migration/feature-parity.json'), markdown=resolve(root,'docs/rust-migration/feature-parity.md');
const check=process.argv.slice(2).includes('--check');
const update=process.argv.slice(2).includes('--update');
if((check&&update)||process.argv.slice(2).some(a=>!['--check','--update'].includes(a))) throw Error('Usage: node scripts/rust-migration/inventory.mjs [--check|--update]');
const read=async p=>readFile(resolve(root,p),'utf8');
async function paths(dir) {let out=[]; for(const d of (await readdir(resolve(root,dir),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {const p=dir+'/'+d.name;if(d.isDirectory())out.push(...await paths(p));else if(d.isFile())out.push(p);}return out;}
const testPaths=(await Promise.all(['tests','packages/cli/test','apps/desktop/test'].map(paths))).flat().filter(p=>/\.test\.mjs$/.test(p));
const tests=await Promise.all(testPaths.map(async path=>({path,text:await read(path)})));
const rows=[];
function add(category,id,source,opts={}) {
 const refs=tests.filter(t=>id.length>=4 && t.text.toLowerCase().includes(id.toLowerCase())).map(t=>t.path);
 rows.push({category,id,classification:opts.classification??'product',source:Array.isArray(source)?source:[source],testReferences:opts.tests??refs,testReferenceBasis:opts.tests?'manually identified; coverage not established':'literal name matches only; possible false positives and omissions',proposedRustModule:opts.module??'host',compatibility:opts.compatibility??'Preserve current inputs, outputs, errors, ordering, security and lifecycle behavior; inspect implementation for detailed contract.',verification:opts.verification??'Add targeted differential fixtures against current implementation; inspect matched tests and cover missing cases.',migrationStatus:opts.status??'retained-js-pending',...(opts.detail?{detail:opts.detail}:{})});
}
const main=await read('apps/desktop/electron/main.cjs');
for(const m of main.matchAll(/\bhandle\(\s*['"]([^'"]+)['"]/g)) add('desktop-ipc-handler',m[1],'apps/desktop/electron/main.cjs');
const preload=await read('apps/desktop/electron/preload.cjs');
for(const m of preload.matchAll(/^\s{2}([A-Za-z][\w]*):/gm)) add('preload-member',m[1],'apps/desktop/electron/preload.cjs');
const {settingsSections}=await import(pathToFileURL(resolve(root,'apps/desktop/src/settings-data.js')).href);
for(const section of settingsSections)add('settings-page',section.id,'apps/desktop/src/settings-data.js',{module:'ui/settings',detail:{title:section.title,category:section.category},compatibility:'Preserve navigation and actual dynamic content; empty or informational pages remain inventoried rather than implying unimplemented functionality.'});
for(const section of settingsSections) for(const group of section.groups) for(const row of group.rows) add('settings',row.id??`${section.id}/${group.title}/${row.label}`,'apps/desktop/src/settings-data.js',{module:'ui/settings',detail:{section:section.id,group:group.title,id:row.id??null,label:row.label,type:row.type,default:row.value??null,options:row.options??[]},compatibility:'Preserve displayed value, choices, persistence, validation and actual host behavior; a displayed setting does not itself prove implementation.'});
const options=await read('packages/cli/src/options.mjs');
const help=options.slice(options.indexOf('Options:'),options.indexOf('Interactive:'));
for(const name of [...new Set([...help.matchAll(/--[a-z][a-z-]+|-[hpv]\b/g)].map(m=>m[0]))]) add('cli-option',name,'packages/cli/src/options.mjs',{module:'cli/options'});
for(const name of ['login','doctor','setup-automation','/project','/cd','/usage','/login','/model','/settings','/resume']) add('cli-command',name,['packages/cli/src/options.mjs','packages/cli/src/interactive.mjs'],{module:'cli/interactive'});
const nav=await read('packages/cli/src/navigation.mjs'); for(const m of nav.matchAll(/\bmake\(['"]([^'"]+)['"]/g))add('navigation-tool',m[1],'packages/cli/src/navigation.mjs',{module:'tools/navigation'});
for(const name of ['read','edit','write','bash','powershell']) add('native-tool',name,'packages/cli/src/tools.mjs',{module:'tools/repository'});
const automation=await read('packages/cli/src/automation.mjs'); for(const m of automation.matchAll(/\b(?:resultTool|imageTool)\(['"]([^'"]+)['"]/g))add('automation-tool',m[1],'packages/cli/src/automation.mjs',{module:'tools/automation',classification:'optional'});
const pkg=JSON.parse(await read('package.json')); for(const [name,command] of Object.entries(pkg.scripts)) add('package-script',name,'package.json',{module:'build',detail:{command},classification:name.startsWith('desktop')||name==='test:desktop'?'product':'experimental'});
for(const p of (await paths('scripts')).filter(p=>/\.(mjs|py|sh)$/.test(p)&&!p.startsWith('scripts/rust-migration/')))add('script-entrypoint',p,p,{module:p.startsWith('scripts/desktop/')?'build/package':'bench',classification:p.startsWith('scripts/desktop/')?'product':'experimental',verification:'Inspect arguments, side effects, provider/network use and output artifacts before running; compare only in isolated environments.'});
const broad=[
 ['Markdown and streaming',['apps/desktop/src/desktop.js','apps/desktop/test/message-presentation.test.mjs'],'ui/presentation'],['KaTeX math rendering',['apps/desktop/src/message-markdown.js','apps/desktop/test/message-presentation.test.mjs'],'ui/presentation'],['Mermaid diagrams',['apps/desktop/src/mermaid-diagrams.js','apps/desktop/test/message-presentation.test.mjs'],'ui/presentation'],['Code blocks syntax highlighting and copy',['apps/desktop/src/message-markdown.js','apps/desktop/test/message-presentation.test.mjs'],'ui/presentation'],['Terminal PTY shell resize and scrollback',['apps/desktop/electron/terminals.cjs','apps/desktop/src/terminal-view.js'],'process/terminal'],['Keyboard navigation and shortcuts',['apps/desktop/src/settings-data.js','apps/desktop/test/navigation.test.mjs'],'ui/input'],['Accessibility semantics and screen readers',['apps/desktop/src/desktop.js','apps/desktop/test/navigation.test.mjs'],'ui/accessibility'],['Attachments clipboard limits and retention',['apps/desktop/electron/attachments.cjs','apps/desktop/src/attachments.js','apps/desktop/test/attachments.test.mjs'],'ui/attachments'],['Thread JSONL Pi sessions and migrations',['apps/desktop/electron/threads.mjs','packages/cli/src/session.mjs'],'storage/sessions'],['Preferences and view-state storage',['apps/desktop/electron/settings-store.mjs','apps/desktop/electron/view-state-store.cjs'],'storage/preferences'],['Credential and provider authentication',['apps/desktop/electron/provider-settings.mjs','packages/cli/src/model-runtime.mjs'],'auth'],['Projects worktrees Git and diffs',['apps/desktop/electron/workspace-files.cjs','apps/desktop/electron/branches.cjs'],'host/workspace'],['Worker lifecycle concurrent sessions abort and recovery',['apps/desktop/electron/worker.mjs','apps/desktop/electron/thread-router.mjs'],'runtime/sessions'],['Pi streaming retry compaction token accounting',['packages/cli/src/session.mjs','packages/cli/src/model-runtime.mjs'],'runtime/pi'],['Pi extensions resource trust MCP and codemode',['packages/cli/src/session.mjs','packages/cli/src/mcp-config.mjs'],'runtime/extensions'],['Approval controls and command gate',['apps/desktop/electron/worker.mjs','packages/cli/src/command-gate.mjs'],'host/approvals'],['Platform Windows x64 and macOS arm64 packaging',['.github/workflows/desktop.yml','scripts/desktop/package.mjs'],'platform/package'],['Repository traversal filesIn',['packages/cli/src/workspace.mjs','crates/suffice-fs/src/lib.rs'],'tools/workspace'],['Frozen historical research data',['benchmarks/README.md','docs/rust-migration/measurements/baseline-manifest.json'],'bench/evidence']
];
for(const [name,src,module] of broad) add('capability',name,src,{module,classification:name.startsWith('Frozen')?'historical':'product',status:name==='Repository traversal filesIn'?'candidate-under-measurement':'retained-js-pending',compatibility:name.startsWith('Frozen')?'Preserve every original tracked historical file byte-for-byte; consult baseline-manifest.json for paths and SHA-256 hashes.':'Inspect source contracts, retained Pi behavior and platform-specific handling; preserve output, security and failure semantics.',verification:name.startsWith('Frozen')?'Run scripts/rust-migration/verify-preservation.mjs against the baseline manifest.':'Perform targeted differential and integration tests; include negative cases, and manual platform/accessibility checks where relevant.'});
const traversal=rows.find(row=>row.category==='capability'&&row.id==='Repository traversal filesIn');
const latency=JSON.parse(await read('docs/rust-migration/measurements/walk-final.json'));
const memory=JSON.parse(await read('docs/rust-migration/measurements/addon-memory-final.json'));
const packaged=JSON.parse(await read('docs/rust-migration/measurements/packaged-smoke-win32.json'));
if(latency.gate.pass&&memory.gate.pass&&packaged.nativeTraversal){
 traversal.migrationStatus='rust-optional-verified-windows';
 traversal.source.push('crates/suffice-fs-addon/src/lib.rs','packages/cli/src/native-files.mjs');
 traversal.testReferences=['packages/cli/test/native-files.test.mjs','scripts/rust-migration/verify-installed.mjs','scripts/desktop/smoke.mjs'];
 traversal.testReferenceBasis='Direct differential, concurrency, fallback, installed tools and packaged addon checks; Windows only.';
 traversal.compatibility='Rust traversal preserves original ordered path outputs and filesystem error behavior through JavaScript fallback. Acorn/TypeScript parsing and the rest of the engine remain JavaScript. Other platforms remain unverified.';
 traversal.verification='Rebuild locked release addon; run native-files tests, verify-installed, packaged smoke, compare-walk, measure-addon and verify-rollback; retain raw outputs. See delivery.md for measured CPU/memory tradeoffs.';
}
for(const row of rows)if(row.category==='package-script'&&row.id==='native:build')row.classification='product';
rows.sort((a,b)=>a.category.localeCompare(b.category,'en')||a.id.localeCompare(b.id,'en'));
const counts=Object.fromEntries([...new Set(rows.map(x=>x.category))].sort().map(c=>[c,rows.filter(x=>x.category===c).length]));
const doc={schema:1,method:'Static source inventory; settings imported from pure data; handlers, preload members and tool names use literal regex, not a complete JS parser. Dynamic, aliased, generated or indirectly registered members may be missed. Test references are literal name matches or manually identified, not coverage evidence. Existing sources are authoritative.',counts,rows};
const json=JSON.stringify(doc,null,2)+'\n';
const esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
let md='# Feature parity inventory\n\nGenerated by `scripts/rust-migration/inventory.mjs`. This is an inventory, not a claim of full Rust parity. Literal source extraction may miss dynamically registered features; matched tests are leads, not proof of coverage. Existing JS features remain; optional Rust traversal has Windows verification. Detailed tests, options, compatibility obligations and verification procedures are in the JSON.\n\n## Counts\n\n';
for(const [k,v] of Object.entries(counts))md+=`- ${k}: ${v}\n`;
md+='\n## Matrix\n\n| Category | Feature | Classification | Existing source | Candidate Rust module | Status |\n| --- | --- | --- | --- | --- | --- |\n';
for(const r of rows) md+=`| ${esc(r.category)} | ${esc(r.id)} | ${r.classification} | ${r.source.map(p=>`\`${p}\``).join(', ')} | ${r.proposedRustModule} | ${r.migrationStatus} |\n`;
md+='\nHistorical paths and SHA-256 hashes are in `measurements/baseline-manifest.json`. Never regenerate historical evidence to claim parity. See `engine-inventory.md`, `desktop-inventory.md`, and `evidence-inventory.md` for contracts and verification gaps.\n';
for(const [path,data] of [[output,json],[markdown,md]]) {if(check){if(await readFile(path,'utf8')!==data)throw Error(`Inventory differs: ${relative(root,path)}`);}else await writeFile(path,data,{flag:update?'w':'wx'});}
console.log(JSON.stringify({check,counts,total:rows.length}));
