import {hash} from './workspace.mjs';
export class TestExecutionPolicy {
  constructor(mode='unrestricted'){if(!['unrestricted','fixed','selective'].includes(mode))throw new Error('Unknown test policy');this.mode=mode;this.lastEdit=null;this.seen=new Set();this.events=[];}
  async run(state,execute,log=()=>{}){
    const key=hash(JSON.stringify([state.kind,state.source,state.test]));
    const allow=this.mode==='unrestricted'||(this.mode==='selective'?!this.seen.has(key):this.lastEdit===null||state.edits-this.lastEdit>=2);
    if(!allow){const receipt={status:'deferred',executed:false,reason:this.mode==='selective'?'identical source and test revision already executed':'fewer than two meaningful edits since last checkpoint',sourceRevision:state.source,testRevision:state.test,priorResultIsNotCurrentPass:true};const event={type:'test_policy',mode:this.mode,kind:state.kind,executed:false,edits:state.edits,key,...receipt};this.events.push(event);log(event);return receipt;}
    const checked=await execute();this.lastEdit=state.edits;this.seen.add(key);const event={type:'test_policy',mode:this.mode,kind:state.kind,executed:true,edits:state.edits,key,status:checked.status,latencyMs:checked.latencyMs??0};this.events.push(event);log(event);return {...checked,executed:true,sourceRevision:state.source,testRevision:state.test};
  }
  receipt(){return {mode:this.mode,requested:this.events.length,executed:this.events.filter(e=>e.executed).length,deferred:this.events.filter(e=>!e.executed).length,testWallMs:this.events.filter(e=>e.executed).reduce((a,e)=>a+e.latencyMs,0),events:this.events};}
}
