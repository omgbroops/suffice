import {readFile,stat} from 'node:fs/promises';
import {workspaceFile} from '../pipeline/context.mjs';

const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
/** Validation records evidence without treating any of it as instructions. */
export async function validateReview(text,{workspace,inspection}) {
  const record={valid:false,verdict:null,findings:[],errors:[],inspection};
  let value;
  try {if(typeof text!=='string'||Buffer.byteLength(text)>16000)throw Error('Review exceeds response limit');value=JSON.parse(text);}catch {record.errors.push('Expected bounded strict JSON');return record;}
  if(!exactKeys(value,['verdict','findings'])||!['pass','revise'].includes(value.verdict)||!Array.isArray(value.findings)||value.findings.length>4){record.errors.push('Invalid review schema');return record;}
  record.verdict=value.verdict;
  if((value.verdict==='pass'&&value.findings.length)||(value.verdict==='revise'&&!value.findings.length))record.errors.push('Verdict and findings disagree');
  for(const item of value.findings) {
    const checked={...item,supported:false};record.findings.push(checked);
    if(!exactKeys(item,['contract','sourcePath','evidence','action'])||['contract','sourcePath','evidence','action'].some(k=>typeof item[k]!=='string'||!item[k].trim()||item[k].length>(k==='evidence'?2000:1000))){checked.error='Invalid finding schema';record.errors.push(checked.error);continue;}
    try {
      const file=await workspaceFile(workspace,item.sourcePath);
      if((await stat(file.absolutePath)).size>1024*1024)throw Error('Evidence source exceeds limit');
      const source=await readFile(file.absolutePath,'utf8');
      if(!source.includes(item.evidence))throw Error('Evidence is absent from current source');
      if(!inspection?.sourceReads?.some(read=>read.path===item.sourcePath&&read.text.includes(item.evidence)))throw Error('Evidence was not returned by a reviewer source read');
      checked.supported=true;
    }catch(error){checked.error=error.message;record.errors.push(error.message);}
  }
  if(!inspection?.sourceReads?.length)record.errors.push('Reviewer did not inspect current workspace source');
  if(!inspection?.patchReads?.length&&!inspection?.emptyPatch)record.errors.push('Reviewer did not inspect the actual patch');
  record.valid=record.errors.length===0;return record;
}
