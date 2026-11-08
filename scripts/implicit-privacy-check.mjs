import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {parseEnv} from 'node:util';
const root=resolve(import.meta.dirname,'..'),secrets=[];
const collect=value=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(typeof item==='string'&&/^(?:access|refresh|key|apiKey|accessToken|refreshToken)$/i.test(key)&&item.length>=12)secrets.push(item);else if(item&&typeof item==='object')collect(item);}};
for(const p of [resolve(homedir(),'.suffice/auth.json'),resolve(root,'.suffice/pi/auth.json')])try{collect(JSON.parse(await readFile(p,'utf8')));}catch(e){if(e.code!=='ENOENT')throw new Error('Cannot inspect private credentials for in-memory comparison');}
try{const env=parseEnv(await readFile(resolve(root,'.env'),'utf8'));for(const name of ['OPENROUTER_API_KEY','JEV_API_KEY','OPENAI_API_KEY'])if(env[name]?.length>=12)secrets.push(env[name]);}catch(e){if(e.code!=='ENOENT')throw new Error('Cannot inspect private environment');}
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);let archiveEntries=0;
const check=(bytes,label)=>{if(secrets.some(s=>bytes.includes(Buffer.from(s))))throw new Error(`Credential match in ${label}`);};
for(const p of paths){if(p.startsWith('.suffice/')||/(?:^|\/)auth\.json$/.test(p)||p==='.env')throw new Error('Private path is tracked');const bytes=await readFile(resolve(root,p));check(bytes,p);if(p.startsWith('reports/implicit-')&&p.endsWith('/inputs.json.gz')){const data=gunzipSync(bytes);check(data,p+' decoded');for(const [key,file]of Object.entries(JSON.parse(data).files)){check(Buffer.from(file.base64,'base64'),key);archiveEntries++;}}}
const receipt={checkedFiles:paths.length,decodedArchiveEntries:archiveEntries,credentialLeaks:0,note:'Actual local subscription and repository credential values compared in memory; values and field contents are never printed.'};await writeFile(resolve(root,'reports/implicit-semantic-v1/privacy-verification.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
