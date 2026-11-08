import {resolve} from 'node:path';
import {root,stateDir} from '../../src/runtime.mjs';
import {efficiencyTasks} from '../efficiency/tasks.mjs';
import {tasks} from '../tasks.mjs';

const historical=efficiencyTasks.find(t=>t.id==='prerelease-diff');
export const semanticTasks = [
  {...historical,provenance:'Real npm/node-semver historical repair, reused cohort; not a fresh holdout',prompt:`Repository: node-semver under src/. Read README.md. ${historical.prompt}`,role:'localized function repair'},
  ...['dependency-aliases','inventory-reservations'].map(id=>({...tasks.find(t=>t.id===id),base:'124e0e194d526064a6b66b951faf4c4d64853f5a',role:id==='dependency-aliases'?'exported function and caller, two files':'dependent behavioral contracts, fifteen modules'})),
].map(t=>({...t,originalWorkspace:t.workspaceDir,workspaceDir:resolve(stateDir,'semantic-tasks-v1',t.id,'workspace'),acceptancePath:resolve(t.acceptancePath)}));
export const semanticReportDirectory=resolve(root,'reports/semantic-graph-v1');
