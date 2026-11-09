import {resolve,dirname} from 'node:path';
import {tasks as synthetic} from '../tasks.mjs';
import {realTasks,baseRevision} from '../real/tasks.mjs';
import {efficiencyTasks} from '../efficiency/tasks.mjs';
import {workflowTasks} from '../workflow/tasks.mjs';
import {root,stateDir} from '../../src/runtime.mjs';
const simple=new Set(['numeric-xrange','caret-prerelease','prerelease-diff','dotted-prerelease','build-metadata','exponent-integers','window-scheduler','layered-config']);
const cross=new Set(['numeric-prerelease','prerelease-subset','mapping-boundaries','folded-tabs','dependency-aliases','cursor-pagination','tenant-cache','streaming-utf8']);
const compounds=[
  {id:'fulfillment-workflow',parts:['inventory-reservations','retry-idempotency','atomic-ledger']},
  {id:'event-routing-workflow',parts:['tenant-event-feed','layered-routing','tenant-cache']},
  {id:'streaming-catalog-workflow',parts:['streaming-utf8','cursor-pagination','dependency-aliases','layered-config']}
];
export const suite=[
  ...synthetic.map(t=>({...t,kind:'synthetic',revision:'124e0e194d526064a6b66b951faf4c4d64853f5a',repository:'sufficelabs/suffice',family:t.id})),
  ...[...realTasks,...efficiencyTasks].map(t=>({...t,kind:'upstream',revision:t.base??baseRevision,repository:'npm/node-semver',family:'node-semver',referenceFiles:t.referenceFiles??[t.referenceFile]})),
  ...workflowTasks.map(t=>({...t,kind:'upstream',revision:t.base,repository:'nodeca/js-yaml',family:'js-yaml'})),
  ...compounds.map(t=>({...t,kind:'compound',revision:'124e0e194d526064a6b66b951faf4c4d64853f5a',repository:'sufficelabs/suffice',family:t.parts.join('+')}))
].map(t=>({...t,category:simple.has(t.id)?'simple':cross.has(t.id)?'cross-file':'complex',
  difficultyRationale:simple.has(t.id)?'Localized public behavior with a bounded production repair; simple is a prospective stratum, not observed success.':cross.has(t.id)?'Multiple public APIs or producer/consumer contracts must remain consistent across source boundaries.':'Multiple state transitions/invariants or compound subsystems must all pass; longer work horizon, not merely a larger prompt.',
  baseline:resolve(stateDir,'intelligence-eval-v2/tasks',t.id,'baseline'),reference:resolve(stateDir,'intelligence-eval-v2/tasks',t.id,'reference'),
  preparedAcceptance:resolve(stateDir,'intelligence-eval-v2/acceptance',t.id+'.test.mjs'),
  prompt:`Read README.md for the complete task contract. Repair existing production files under src/ and preserve public APIs. Run node --test tests/visible.test.mjs. Tests, fixtures, metadata and docs are immutable. Do not install dependencies or use network access. Acceptance is evaluated separately.`}));
if(suite.length!==24||['simple','cross-file','complex'].some(c=>suite.filter(t=>t.category===c).length!==8))throw new Error('Dataset must contain 8 tasks per category');
export const suiteRoot=resolve(stateDir,'intelligence-eval-v2');
