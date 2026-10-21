import {executePipeline} from '../pipeline/executor.mjs';
import {PIPELINE_POLICY} from '../pipeline/policy.mjs';
import {executeOrchestrated} from './orchestrated.mjs';

export const STRATEGIES=Object.freeze(['flexible','efficient','orchestrated','efficient-review']);
export function strategyRequest(request) {
  const strategy=request.strategy??'flexible';
  if (!STRATEGIES.includes(strategy)) throw Error('Unknown execution strategy');
  const review=strategy==='efficient-review';
  const efficient=strategy==='efficient'||review;
  const defaults=efficient?{outputControl:true,preparedContext:true,guidance:true,notices:true,advice:'on_failure',repairs:true,solTakeover:true}:{};
  const features={...defaults,...request.features};
  if(review){
    if(request.model&&request.model!==PIPELINE_POLICY.worker||request.effort&&request.effort!==PIPELINE_POLICY.workerEffort)throw Error('Review experiment pins Luna High');
    Object.assign(features,{postReview:true,advice:false,repairs:false,solTakeover:false,effortScheduling:false});
  }
  if(!review&&features.postReview)throw Error('Use efficient-review for post-implementation review');
  if (!efficient && (features.advice || features.solTakeover || features.effortScheduling))
    throw Error('Flexible does not route models or change effort; use Efficient for selective Sol assistance');
  return {...request,strategy,profile:efficient?'thin':'baseline',model:request.model??(efficient?PIPELINE_POLICY.worker:'gpt-6.1-sol'),
    effort:request.effort??(efficient||strategy==='orchestrated'?PIPELINE_POLICY.workerEffort:'low'),features};
}

// Both modes share output recovery, preparation, verification, notices and receipts.
// No CLI production defaults, automatic skills, or implicit paid planning change.
export async function executeStrategy(request,deps={}) {
  const r=strategyRequest(request);
  const result=await (r.strategy==='orchestrated'?executeOrchestrated:executePipeline)(r,deps);
  return {...result,strategy:r.strategy};
}
