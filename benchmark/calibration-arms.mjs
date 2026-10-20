// Frozen before inference; no outcome-based policy selection.
const flexible={executionScope:'isolated-task',features:{repairs:true}};
const efficient=advice=>({executionScope:'isolated-task',features:{advice,repairs:true,solTakeover:advice!==false}});
export const CALIBRATION_ARMS={
  pi:{executionArm:'pi',execution:{}},
  'v1-original':{executionArm:'v1',baseline:true,execution:{features:{}}},
  'v1-refined':{executionArm:'v1',execution:flexible},
  'v1-concise':{executionArm:'v1',execution:{...flexible,communication:'concise'}},
  'v2-alone':{executionArm:'v2',execution:efficient(false)},
  'v2-upfront':{executionArm:'v2',execution:efficient('upfront')},
  'v2-selective':{executionArm:'v2',execution:efficient('on_failure')},
  'v2-concise':{executionArm:'v2',execution:{...efficient('on_failure'),communication:'concise'}},
};
