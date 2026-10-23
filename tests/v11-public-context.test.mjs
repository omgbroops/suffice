import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {collectPublicContext} from '../src/v11/public-context.mjs';

const entry = text => ({bytes:Buffer.from(text),mode:0o100644});
const treeOf = files => new Map(Object.entries(files).map(([path,text])=>[path,entry(text)]));
const pathsOf = context => context.interfaces.map(file=>file.path);

test('explicit public interfaces include adjacent referenced helpers, public tests, and documentation',()=>{
  const tree=treeOf({
    'src/Satellite.java':'public class Satellite { public Tree build(Node node) { return null; } }',
    'src/Tree.java':'public record Tree(Node root) {}',
    'src/Node.java':'public record Node(String value) {}',
    'src/Other.java':'public class Other {}',
    'src/SatelliteTest.java':'class SatelliteTest { void publicExample() {} }',
    'README.md':'Construct a tree using the published node API.',
    'unrelated/Elsewhere.java':'public class Elsewhere {}',
  });
  const context=collectPublicContext({tree,paths:['src/Satellite.java']});
  assert.deepEqual(pathsOf(context),[
    'src/Satellite.java','src/Node.java','src/Tree.java','src/Other.java','src/SatelliteTest.java','README.md',
  ]);
  assert.ok(context.files.includes('unrelated/Elsewhere.java'));
  assert.ok(!pathsOf(context).includes('unrelated/Elsewhere.java'));
  assert.deepEqual(context.publicSources,context.interfaces);
});

test('explicit paths come first in request order and are normalized and deduplicated',()=>{
  const tree=treeOf({'src/a.mjs':'export const a=1;','src/b.mjs':'export const b=2;','README.md':'API'});
  const context=collectPublicContext({tree,paths:['src\\b.mjs','src/a.mjs','src/b.mjs']});
  assert.deepEqual(pathsOf(context),['src/b.mjs','src/a.mjs','README.md']);
  assert.deepEqual(context.files.slice(0,2),['src/b.mjs','src/a.mjs']);
});

test('context is taken from the supplied original baseline without mutating its entries',()=>{
  const tree=treeOf({'src/api.mjs':'export const answer=42;'});
  const original=tree.get('src/api.mjs'),before=Buffer.from(original.bytes);
  const context=collectPublicContext({tree,paths:['src/api.mjs']});
  assert.equal(tree.size,1);
  assert.equal(tree.get('src/api.mjs'),original);
  assert.deepEqual(original.bytes,before);
  assert.equal(original.mode,0o100644);
  assert.deepEqual(context.interfaces[0],{
    path:'src/api.mjs',text:before.toString('utf8'),sha256:createHash('sha256').update(before).digest('hex'),
  });
  // A later worker candidate cannot change the already collected public evidence.
  tree.set('src/api.mjs',entry('export const answer=0;'));
  assert.equal(context.interfaces[0].text,'export const answer=42;');
  assert.equal(context.interfaces[0].sha256,createHash('sha256').update(before).digest('hex'));
});

test('automatic inventory excludes secrets, tool metadata, dependencies, and build artifacts',()=>{
  const excluded=[
    '.env','.env.local','.netrc','.npmrc','.pypirc','auth.json','credentials.json','secrets.yaml',
    '.ssh/id_rsa','.aws/config.json','.azure/config.json','.git/config.json','.codex/state.json',
    '.meta/README.md','.approaches/README.md','.suffice-v10-checks/check.mjs',
    'src/node_modules/library/api.mjs','src/build/api.mjs','dist/api.mjs','target/api.rs',
  ];
  const tree=treeOf(Object.fromEntries([
    ['README.md','Published public contract'],['src/api.mjs','export const api=1;'],
    ...excluded.map(path=>[path,'private material']),
  ]));
  const context=collectPublicContext({tree,paths:['src/api.mjs']});
  assert.deepEqual(context.files,['src/api.mjs','README.md']);
  assert.deepEqual(pathsOf(context),['src/api.mjs','README.md']);
  for(const path of excluded){
    assert.throws(()=>collectPublicContext({tree,paths:[path]}),/Rejected explicit context .*excluded-sensitive-or-metadata/);
  }
});

test('per-file byte bounds preserve complete UTF-8 content and report oversized omissions',()=>{
  const exact='é'.repeat(6000),oversized='é'.repeat(6001);
  const tree=treeOf({'api.md':exact,'requirements.md':oversized});
  const context=collectPublicContext({tree,paths:['api.md','requirements.md']});
  assert.equal(Buffer.byteLength(exact),12_000);
  assert.deepEqual(pathsOf(context),['api.md']);
  assert.equal(context.interfaces[0].text,exact);
  assert.deepEqual(context.omitted,[{path:'requirements.md',reason:'per-file-byte-limit'}]);
  assert.ok(context.files.includes('requirements.md'));
});

test('ordinary authentication modules are eligible public source context',()=>{
  const paths=['src/auth.ts','auth/credentials.mjs','src/secrets.py'];
  const tree=treeOf(Object.fromEntries(paths.map(path=>[path,'// Public application API'])));
  const context=collectPublicContext({tree,paths});
  assert.deepEqual(pathsOf(context),paths);
});

test('total byte limit is exact and does not silently truncate a later public document',()=>{
  const tree=treeOf(Object.fromEntries(Array.from({length:5},(_,i)=>[`api-${i}.md`,'界'.repeat(4000)])));
  const context=collectPublicContext({tree});
  assert.equal(context.interfaces.length,4);
  assert.equal(context.interfaces.reduce((sum,file)=>sum+Buffer.byteLength(file.text),0),48_000);
  assert.ok(context.interfaces.every(file=>file.text==='界'.repeat(4000)));
  assert.deepEqual(context.omitted,[{path:'api-4.md',reason:'total-byte-limit'}]);
});

test('interface and inventory file counts are bounded with deterministic omission receipts',()=>{
  const tree=treeOf(Object.fromEntries(Array.from({length:105},(_,i)=>[`api-${String(i).padStart(3,'0')}.md`,'Public API'])));
  const context=collectPublicContext({tree});
  assert.equal(context.interfaces.length,12);
  assert.equal(context.files.length,100);
  assert.equal(context.omitted.length,93);
  assert.ok(context.omitted.every(file=>file.reason==='file-count-limit'));
  assert.deepEqual(context.omitted[0],{path:'api-012.md',reason:'file-count-limit'});
  assert.deepEqual(context.omitted.at(-1),{path:'api-104.md',reason:'file-count-limit'});
});

test('selection, hashes, inventory, and omissions are independent of baseline Map insertion order',()=>{
  const tree=treeOf({
    'src/Main.java':'class Main { Tree tree; }','src/Tree.java':'class Tree {}','src/Z.java':'class Z {}',
    'README.md':'public requirements','api-large.md':'x'.repeat(12_001),
    'notes.txt':'ordinary notes','bad.md':'placeholder','.env.local':'hidden',
  });
  tree.set('bad.md',{bytes:Buffer.from([0xc3,0x28]),mode:0o100644});
  const options={paths:['src/Main.java']};
  assert.deepEqual(
    collectPublicContext({tree,...options}),
    collectPublicContext({tree:new Map([...tree].reverse()),...options}),
  );
});

test('missing, unsafe, binary, unsupported, and malformed explicit inputs fail closed',()=>{
  const tree=treeOf({'api.mjs':'export const api=1;','image.png':'image bytes'});
  tree.set('binary.mjs',{bytes:Buffer.from([65,0,66]),mode:0o100644});
  tree.set('invalid.mjs',{bytes:Buffer.from([0xc3,0x28]),mode:0o100644});
  tree.set('missing-buffer.mjs',{bytes:'not a Buffer',mode:0o100644});
  assert.throws(()=>collectPublicContext({tree,paths:['absent.mjs']}),/Missing explicit baseline path/);
  for(const path of ['../api.mjs','/api.mjs','C:\\api.mjs','src//api.mjs','./api.mjs','a\0.mjs']){
    assert.throws(()=>collectPublicContext({tree,paths:[path]}),/Invalid baseline path/);
  }
  assert.throws(()=>collectPublicContext({tree,paths:['binary.mjs']}),/Rejected explicit context .*binary/);
  assert.throws(()=>collectPublicContext({tree,paths:['image.png']}),/Rejected explicit context .*unsupported-file-type/);
  assert.throws(()=>collectPublicContext({tree,paths:['missing-buffer.mjs']}),/Rejected explicit context .*missing-buffer/);
  assert.throws(()=>collectPublicContext({tree,paths:['invalid.mjs']}),/Invalid UTF-8 context/);
  assert.throws(()=>collectPublicContext({tree:{}}),/baseline Map/);
  const automatic=collectPublicContext({tree});
  assert.deepEqual(automatic.files,['api.mjs']);
  assert.deepEqual(automatic.omitted,[{path:'invalid.mjs',reason:'invalid-utf8'}]);
});
