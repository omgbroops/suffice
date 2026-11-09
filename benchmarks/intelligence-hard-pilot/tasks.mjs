import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,stateDir} from '../../src/runtime.mjs';
import {hash} from '../../src/workspace.mjs';
export const pilotRoot=resolve(stateDir,'intelligence-hard-pilot');
export const record=JSON.parse(await readFile(resolve(root,'benchmarks/intelligence-hard-pilot/axios-5316.json'),'utf8'));
export const pilotTask={id:record.instance_id,category:'complex',kind:'upstream-native-pilot',repository:record.repo,revision:record.base_commit,family:'axios',record,
  baseline:resolve(pilotRoot,'baseline'),acceptanceHash:hash(record.test_patch),
  allowsChange:p=>p.startsWith('lib/')&&p.endsWith('.js')||/^index\.d\.(?:ts|cts)$/.test(p),
  acceptanceArgs:['test/unit/adapters/http.js','--grep','FormData'],
  regressionArgs:['test/unit/core/**/*.js','test/unit/helpers/**/*.js','test/unit/utils/**/*.js'],
  referenceFiles:[...record.patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map(m=>m[2]),
  prompt:`Resolve this upstream issue in the repository. Dependencies are already provisioned. Modify production JavaScript under lib/ or public index type declarations as needed, including new production helpers. Preserve tests, fixtures, documentation, configuration and dependency metadata. Do not install packages or use external network access. Use the existing upstream tests for verification; a useful command is node node_modules/mocha/bin/mocha.js 'test/unit/core/**/*.js' 'test/unit/helpers/**/*.js' 'test/unit/utils/**/*.js' --timeout 10000 --exit. Additional upstream acceptance tests are applied independently after your run.\n\n${record.problem_statement}`};
