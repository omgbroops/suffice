import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUnifiedDiff,splitDiffRows,filterFileTreeRows} from '../src/panel-content.js';

test('split diffs pair replacements and preserve unequal additions and hunk boundaries',()=>{
 const rows=parseUnifiedDiff('@@ -2,3 +2,4 @@\n-old\n+new\n+extra\n context\n tail\n@@ -30,1 +31,0 @@\n-deleted\n');
 const pairs=splitDiffRows(rows);assert.equal(pairs[0].hunk.kind,'hunk');assert.equal(pairs[1].left.text,'old');assert.equal(pairs[1].right.text,'new');assert.equal(pairs[2].left,null);assert.equal(pairs[2].right.text,'extra');assert.deepEqual([pairs[3].left.old,pairs[3].right.new],[3,4]);assert.equal(pairs.at(-1).left.old,30);assert.equal(pairs.at(-1).right,null);
});

test('diff presentation retains source line numbers across multiple hunks',()=>{
 const rows=parseUnifiedDiff('diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -3,2 +3,2 @@\n-old\n+new\n context\n@@ -20,0 +21,1 @@\n+added\n\\ No newline at end of file\n');
 assert.deepEqual(rows.filter(row=>row.kind==='deletion'),[{kind:'deletion',text:'old',old:3,new:null}]);
 assert.deepEqual(rows.filter(row=>row.kind==='addition').map(row=>[row.text,row.new]),[['new',3],['added',21]]);
 assert.equal(rows.find(row=>row.kind==='context').old,4);
 assert.equal(rows.find(row=>row.kind==='context').new,4);
 assert.ok(!rows.some(row=>row.text.startsWith('diff --git')));
});

const treeRows=paths=>paths.map(path=>({dataset:{path},disabled:false,hidden:false,tabIndex:-1}));
const visiblePaths=rows=>rows.filter(row=>!row.hidden).map(row=>row.dataset.path);

test('file filtering retains exact matches and ancestors, not similarly prefixed siblings',()=>{
 const rows=treeRows(['src','src/lib','src/lib/Target.ts','src/lib/other.ts','src/library','src/library/other.ts','SRC','SRC/other.ts','README.md']);
 filterFileTreeRows(rows,'  TARGET.TS  ');
 assert.deepEqual(visiblePaths(rows),['src','src/lib','src/lib/Target.ts']);
 assert.deepEqual(rows.filter(row=>row.tabIndex===0).map(row=>row.dataset.path),['src']);
 // Matching a folder path still includes its rendered descendants.
 filterFileTreeRows(rows,'src/lib');
 assert.deepEqual(visiblePaths(rows),['src','src/lib','src/lib/Target.ts','src/lib/other.ts','src/library','src/library/other.ts']);
});

test('file filtering resets visibility and keeps only the first enabled match tabbable',()=>{
 const rows=treeRows(['linked.txt','README.md','src']);rows[0].disabled=true;
 filterFileTreeRows(rows,'linked');
 assert.deepEqual(visiblePaths(rows),['linked.txt']);
 assert.ok(rows.every(row=>row.tabIndex===-1));
 filterFileTreeRows(rows,'missing');
 assert.deepEqual(visiblePaths(rows),[]);
 assert.ok(rows.every(row=>row.tabIndex===-1));
 for(const query of ['','   ']){
  filterFileTreeRows(rows,query);
  assert.equal(visiblePaths(rows).length,rows.length);
  assert.deepEqual(rows.map(row=>row.tabIndex),[-1,0,-1]);
 }
 filterFileTreeRows([],'anything');
});

test('file filtering agrees with the previous matching semantics',()=>{
 const rows=treeRows(['a','a/b','a/b/c.txt','a/bb','a/bb/C.txt','A','A/b','a.txt','b/c.txt']);
 for(const query of ['a','B','c.txt','a/b','A/b','txt','z',' / ','']){
  const needle=query.toLowerCase().trim();
  const matches=rows.filter(row=>row.dataset.path.toLowerCase().includes(needle));
  const expected=rows.filter(row=>!needle||matches.some(match=>match===row||match.dataset.path.startsWith(row.dataset.path+'/'))).map(row=>row.dataset.path);
  filterFileTreeRows(rows,query);
  assert.deepEqual(visiblePaths(rows),expected,query);
 }
});

test('large matching trees use a bounded number of path reads per row',()=>{
 const rows=treeRows(['src',...Array.from({length:5000},(_,i)=>`src/group-${i%50}/match-${i}.ts`)]);
 let reads=0;
 for(const row of rows){const path=row.dataset.path;Object.defineProperty(row.dataset,'path',{get(){reads++;return path;}});}
 filterFileTreeRows(rows,'match');
 assert.ok(rows.every(row=>!row.hidden));
 assert.ok(reads<=rows.length*3,`expected linear path reads, got ${reads}`);
});
