import {SEMANTIC_PROTOCOL} from './semantic-benchmark.mjs';
import {hash} from './workspace.mjs';

export const ACTIVATED_PROTOCOL=Object.freeze({...SEMANTIC_PROTOCOL,version:2,
  arms:['baseline','ast-assisted','semantic-assisted','semantic-optional'],repetitions:2,
  capUsd:7.50,priorCampaignUsd:0.37040320000000015,combinedCapUsd:8,maxTurns:26,
  activation:{ast:'symbols + symbol_read in the first edited production file before first edit',semantic:'discovered production symbol/module + dependencies/callers + impact, same revision and epoch, covering every edit'},
});
export const ARM_INSTRUCTIONS=Object.freeze({
  baseline:'Use the ordinary file listing, read, search, edit and test tools available to you.',
  'ast-assisted':'Required initial investigation: before the first edit, use symbols to discover a production definition in the file you will edit, then symbol_read to inspect that exact definition. Print the returned navigation evidence. A successful lookup and source read must finish before editing; ordinary tools remain available afterward.',
  'semantic-assisted':'Required semantic investigation before EVERY edit: use semantic_symbols for the relevant production file, then symbol_dependencies or symbol_callers and impact_analysis for the SAME exact symbol at the current source revision. Print the returned graph/impact evidence and account for uncertainty. Select the symbol containing the edit. For file_write or edits spanning declarations/imports, use the module identity equal to the source path (for example src/order.mjs) after discovering declarations in that file. Use a truthful change category, small bounded results (for example depth 2, limit 6), and inspect further on demand. After any successful edit, refresh discovery and repeat graph inspection/impact before the next edit. Await inspection before edits; batching edits with their prerequisites will be rejected. These checks do not prove runtime behavior; independently verify the repair.',
  'semantic-optional':'Compiler semantic_symbols, symbol_dependencies, symbol_callers, impact_analysis and affected_tests are available alongside ordinary file tools. Choose naturally whether and when to use them; no navigation is required.',
});

/** Deterministic pre-edit enforcement, using only evidence visible to the worker. */
export class InvestigationGate {
  constructor({arm,sourceFiles,readSource,log=()=>{}}){
    if(!ACTIVATED_PROTOCOL.arms.includes(arm))throw new Error('Unknown activated arm');
    this.arm=arm;this.sources=new Set(sourceFiles);this.readSource=readSource;this.log=log;this.epoch=0;this.discovered=new Map();this.astFound=new Set();this.astReads=new Map();this.inspected=new Map();this.impacts=new Map();this.edits=[];this.blocked=[];this.calls=[];
  }
  async observe(tool,args,data,{callId,startEpoch=this.epoch}={}){
    if(!data||data.error||startEpoch!==this.epoch)return;
    const record={tool,callId,epoch:this.epoch,revision:data.revision??null};
    if(tool==='symbols')for(const n of data.matches??[])if(this.sources.has(n.path))this.astFound.add(`${n.path}:${n.name}`);
    if(tool==='symbol_read'&&typeof data.text==='string'&&data.text.length&&this.sources.has(data.path)&&this.astFound.has(`${data.path}:${data.name}`)){
      this.astReads.set(data.path,{...record,path:data.path,name:data.name,sourceHash:hash(await this.readSource(data.path))});
    }
    if(tool==='semantic_symbols'&&typeof data.revision==='string')for(const n of data.matches??[])if(this.sources.has(n.path)){
      this.discovered.set(n.id,{...n,...record});
      // File nodes are genuine graph identities; module-level changes need them.
      this.discovered.set(n.path,{id:n.path,path:n.path,kind:'file',...record});
    }
    if(['symbol_dependencies','symbol_callers'].includes(tool)){
      const known=this.discovered.get(args.symbol);
      if(known?.epoch===this.epoch&&known.revision===data.revision&&data.symbol===args.symbol&&Array.isArray(data.matches))this.inspected.set(args.symbol,{...record,symbol:args.symbol,path:known.path,relationships:data.matches.length,unresolved:data.unresolvedCount??0,limited:!!(data.analysisLimited||data.incomplete)});
    }
    if(tool==='impact_analysis'){
      const known=this.discovered.get(args.symbol),inspection=this.inspected.get(args.symbol);
      if(known?.epoch===this.epoch&&inspection?.epoch===this.epoch&&inspection.revision===data.revision&&known.revision===data.revision&&data.symbol===args.symbol&&Array.isArray(data.affected)&&data.verification?.targets?.includes(known.path))this.impacts.set(args.symbol,{...record,symbol:args.symbol,path:known.path,change:args.change,inspection,affected:data.affected.length,unresolved:data.unresolvedCount??0,limited:!!(data.analysisLimited||data.incomplete)});
    }
    this.calls.push(record);this.log({type:'activation_evidence',...record,symbol:args.symbol??null});
  }
  async authorize(tool,args){
    if(!this.sources.has(args.path))throw new Error('Only existing production source may be changed');
    const source=await this.readSource(args.path),base={path:args.path,epoch:this.epoch,tool,beforeHash:hash(source)};
    let evidence=null,problem;
    if(this.arm==='ast-assisted'&&!this.edits.length){
      const read=this.astReads.get(args.path);
      if(!read||read.epoch!==this.epoch||read.sourceHash!==base.beforeHash)problem='Before the first edit, complete symbols and symbol_read on a production definition in this file.';else evidence={ast:read};
    }
    if(this.arm==='semantic-assisted'){
      let start=0,end=source.length;
      if(tool==='file_edit'){
        start=source.indexOf(args.oldText);end=start+String(args.oldText).length;
        if(!args.oldText||start<0||source.indexOf(args.oldText,start+1)!==-1)throw new Error('oldText must match exactly once');
      }
      for(const impact of this.impacts.values()){
        const declaration=this.discovered.get(impact.symbol);
        if(impact.epoch!==this.epoch||impact.path!==args.path||declaration?.epoch!==this.epoch)continue;
        if(declaration.kind==='file'||tool==='file_edit'&&start>=declaration.start&&end<=declaration.start+declaration.length){evidence={semantic:impact,span:{start,end},target:declaration.id};break;}
      }
      if(!evidence)problem='Before this edit, discover a relevant symbol/module with semantic_symbols, inspect its dependencies/callers, then run impact_analysis on the SAME identity/revision. Use the source path as module ID for file_write or cross-declaration edits. Repeat after every edit.';
    }
    if(problem){const blocked={...base,reason:problem};this.blocked.push(blocked);this.log({type:'activation_blocked',...blocked});throw new Error(problem);}
    const authorization={...base,evidence};this.log({type:'edit_authorized',...authorization});return authorization;
  }
  completed(authorization,result){
    const entry={...authorization,afterHash:result.version??null,index:this.edits.length+1};this.edits.push(entry);this.epoch++;this.log({type:'activated_edit',...entry});
  }
  summary(){
    const required=['ast-assisted','semantic-assisted'].includes(this.arm),covered=this.edits.filter(e=>this.arm==='ast-assisted'?e.index!==1||!!e.evidence?.ast:this.arm==='semantic-assisted'?!!e.evidence?.semantic:true).length;
    return {arm:this.arm,required,compliant:!required||this.edits.length>0&&covered===this.edits.length,edits:this.edits,coveredEdits:covered,blockedEdits:this.blocked.length,evidenceCalls:this.calls.length,astCalls:this.calls.filter(c=>['symbols','symbol_read','symbol_references'].includes(c.tool)).length,semanticCalls:this.calls.filter(c=>['semantic_symbols','symbol_dependencies','symbol_callers','impact_analysis','affected_tests'].includes(c.tool)).length,impactCalls:this.calls.filter(c=>c.tool==='impact_analysis').length};
  }
}
