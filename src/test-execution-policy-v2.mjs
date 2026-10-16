import {TestExecutionPolicy} from './test-execution-policy.mjs';
// Post-campaign engineering fix. The scored agent still imports v1.
export class SerializedTestExecutionPolicy extends TestExecutionPolicy {
  constructor(mode='unrestricted'){super(mode);this.queue=Promise.resolve();}
  run(state,execute,log=()=>{}){
    if(this.mode==='unrestricted')return super.run(state,execute,log);
    const result=this.queue.then(()=>super.run(state,execute,log));
    this.queue=result.catch(()=>{});
    return result;
  }
}
