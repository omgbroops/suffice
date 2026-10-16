import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hash,scopedPath} from './workspace.mjs';

// Checkpoints certify visible regression checks only, never hidden correctness.
export class RecoveryPolicy {
  constructor({workspace,sourceFiles,directory,enabled=false,threshold=2}) {
    this.workspace=workspace;this.sourceFiles=[...sourceFiles];this.directory=directory;
    this.enabled=enabled;this.threshold=threshold;this.epoch=0;this.lastTest=null;
    this.failures=[];this.ledger=[];this.rollbacks=0;this.checkpoints=0;
  }
  async snapshot(){const files={};for(const p of this.sourceFiles)files[p]=await readFile(await scopedPath(this.workspace,p),'utf8');return {files,digest:hash(JSON.stringify(files))};}
  edited(){this.epoch++;}
  async initialize(validation){if(validation.status!=='passed')throw new Error('Initial visible validation must pass');await mkdir(this.directory,{recursive:true});this.checkpoint=await this.snapshot();this.checkpoints++;this.lastTest={epoch:this.epoch,digest:this.checkpoint.digest,status:'passed',kind:'regression'};await writeFile(resolve(this.directory,'checkpoint-0.json'),JSON.stringify(this.checkpoint));}
  state(){return {epoch:this.epoch,lastTest:this.lastTest,testsCurrent:this.lastTest?.epoch===this.epoch,consecutiveFailedStates:this.failures.length,checkpoints:this.checkpoints,rollbacks:this.rollbacks,failedApproaches:this.ledger.map(({files,...e})=>e)};}
  async validated(validation,{kind='regression',diagnostics=''}={}) {
    const current=await this.snapshot();this.lastTest={epoch:this.epoch,digest:current.digest,status:validation.status,kind};
    if(validation.status==='passed') {
      if(kind==='regression') {this.checkpoint=current;this.checkpoints++;this.failures=[];await writeFile(resolve(this.directory,`checkpoint-${this.checkpoints-1}.json`),JSON.stringify(current));}
      return {action:'none',...this.state()};
    }
    // A repeated test without a source change cannot manufacture activation.
    if(validation.status!=='failed'||current.digest===this.checkpoint.digest||this.failures.some(e=>e.digest===current.digest))return {action:'none',...this.state()};
    const evidence={number:this.ledger.length+1,epoch:this.epoch,kind,digest:current.digest,checkpointDigest:this.checkpoint.digest,diagnostics:diagnostics.slice(0,3000),files:current.files};
    this.ledger.push(evidence);this.failures.push(evidence);await writeFile(resolve(this.directory,`failed-${evidence.number}.json`),JSON.stringify(evidence));
    if(!this.enabled||this.failures.length<this.threshold)return {action:'none',...this.state()};
    // Verify all destinations before writing; restore exactly the owned allowlist.
    const destinations=[];for(const p of this.sourceFiles)destinations.push([await scopedPath(this.workspace,p,{write:true}),this.checkpoint.files[p]]);
    for(const [p,content]of destinations)await writeFile(p,content);
    this.epoch++;this.rollbacks++;this.failures=[];
    return {action:'rollback',restoredDigest:this.checkpoint.digest,instruction:'The last visibly validated production state was restored. Tests are stale after restoration. Read current source before editing. Avoid the failed approaches recorded above; diagnose a different cause or invariant. All failure evidence and inference costs remain retained.',...this.state()};
  }
}
