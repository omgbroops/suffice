import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {SemanticGraph} from '../packages/cli/src/semantic/graph.mjs';

for(const [label,consumer]of [
  ['literal dynamic import','export async function consume() { return import("./a.js"); }'],
  ['import type','export function consume(value: import("./a.js").Value) { return value.count; }'],
  ['JSDoc import type','/** @type {import("./a.js").Value} */\nexport const value = {count: 1}; export function consume() { return value.count; }'],
])test(`freshness includes ${label} dependents`,async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-invalidation-')),graph=new SemanticGraph(root);
  t.after(async()=>{graph.dispose();assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});});
  await writeFile(resolve(root,'a.ts'),'export interface Value { count: number }');
  await writeFile(resolve(root,label==='JSDoc import type'?'b.js':'b.ts'),consumer);
  const b=label==='JSDoc import type'?'b.js':'b.ts';graph.refresh();graph.allAnalysis();const cached=graph.cache.get(resolve(root,b));assert.ok(cached);
  await writeFile(resolve(root,'a.ts'),'export interface Value { changed: string }');graph.refresh();
  assert.ok(graph.lastUpdate.invalidated.includes(b),JSON.stringify(graph.lastUpdate));
  assert.ok(!graph.cache.has(resolve(root,b)));graph.allAnalysis();assert.notEqual(graph.cache.get(resolve(root,b)),cached);
  assert.ok(graph.allAnalysis().edges.every(edge=>graph.nodes.has(edge.to)));
});

test('disposing an expanded graph releases compiler nodes and caches',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-dispose-')),graph=new SemanticGraph(root);
  t.after(async()=>{graph.dispose();assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});});
  await writeFile(resolve(root,'a.ts'),'export function value() { return 1; }');graph.refresh();graph.allAnalysis();graph.dispose();
  assert.equal(graph.declarations.size,0);assert.equal(graph.nodeIds.size,0);assert.equal(graph.cache.size,0);assert.equal(graph.service,null);
});
