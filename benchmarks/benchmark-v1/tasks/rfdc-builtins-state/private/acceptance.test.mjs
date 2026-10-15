import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const W = process.env.SUFFICE_WORKSPACE || process.cwd();
const rfdc = createRequire(resolve(W, 'src/package.json'))('./index.js');
const modes=[{}, {proto:true}, {circles:true}, {proto:true,circles:true}];
test('ordinary data primitives functions and dates are preserved in every mode', () => {
 const fn=()=>42;
 const primitives=[null,undefined,true,false,0,-0,23,'','text',NaN,Infinity,7n,Symbol('value'),fn];
 for(const opts of modes){
  const clone=rfdc(opts);
  for(const value of primitives) assert.equal(clone(value),value);
  const input={nested:[{values:primitives.slice(),data:{count:3},date:new Date(123456789)}],date:new Date(-1000),fn};
  const out=clone(input);
  assert.deepEqual(out,input);assert.notEqual(out,input);assert.notEqual(out.nested,input.nested);
  assert.notEqual(out.nested[0],input.nested[0]);assert.notEqual(out.nested[0].values,input.nested[0].values);
  assert.equal(out.fn,fn);assert.equal(out.nested[0].values.at(-1),fn);
  assert.ok(out.date instanceof Date);assert.notEqual(out.date,input.date);assert.equal(out.date.getTime(),-1000);
  assert.ok(out.nested[0].date instanceof Date);assert.notEqual(out.nested[0].date,input.nested[0].date);
  assert.equal(out.nested[0].date.getTime(),123456789);
  out.nested[0].data.count=9;out.nested[0].values[4]=8;out.date.setTime(2000);out.nested[0].date.setTime(3000);
  assert.equal(input.nested[0].data.count,3);assert.equal(input.nested[0].values[4],0);
  assert.equal(input.date.getTime(),-1000);assert.equal(input.nested[0].date.getTime(),123456789);
 }
});
test('map keys and values are recursively independent in every mode', () => {
 for(const opts of modes){
  const key={label:{id:1}}, value={list:[{score:2}]};
  const input={map:new Map([[key,value]])}; const out=rfdc(opts)(input);
  const [[k,v]]=out.map; assert.ok(out.map instanceof Map); assert.deepEqual(k,key); assert.deepEqual(v,value);
  assert.notEqual(k,key); assert.notEqual(v,value); k.label.id=9; v.list[0].score=8;
  assert.equal(key.label.id,1); assert.equal(value.list[0].score,2);
 }
});
test('maps inside arrays and sets recursively clone entries', () => {
 for(const opts of modes){
  const original={state:{n:3}}; const input=[new Set([new Map([['k',original]])])];
  const out=rfdc(opts)(input); assert.ok(out[0] instanceof Set); const map=[...out[0]][0];
  assert.ok(map instanceof Map); assert.deepEqual(map.get('k'),original);
  map.get('k').state.n=5; assert.equal(original.state.n,3);
 }
});
test('typed subviews preserve type offset length and independent storage', () => {
 for(const opts of modes){
  const buffer=new ArrayBuffer(16); const view=new Uint16Array(buffer,4,3); view.set([12,34,56]);
  const out=rfdc(opts)({view}).view;
  assert.ok(out instanceof Uint16Array); assert.equal(out.byteOffset,4); assert.equal(out.length,3);
  assert.deepEqual([...out],[12,34,56]); assert.notEqual(out.buffer,buffer);
  out[1]=99; assert.equal(view[1],34); view[0]=88; assert.equal(out[0],12);
 }
});
test('dataviews in arrays preserve the visible bytes and isolate writes', () => {
 for(const opts of modes){
  const buffer=new ArrayBuffer(8); const view=new DataView(buffer,2,6); view.setUint8(0,17);
  const out=rfdc(opts)([view])[0];
  assert.ok(out instanceof DataView); assert.equal(out.byteOffset,2); assert.equal(out.byteLength,6);
  assert.equal(out.getUint8(0),17); assert.notEqual(out.buffer,buffer);
  out.setUint8(0,61); assert.equal(view.getUint8(0),17);
 }
});
test('buffers and binary values nested through containers are copied', () => {
 for(const opts of modes){
  const bytes=Buffer.from([4,5]); const typed=new Int8Array([-2,3]);
  const input={set:new Set([bytes]), map:new Map([['typed',typed]])}; const out=rfdc(opts)(input);
  const b=[...out.set][0], t=out.map.get('typed');
  assert.ok(Buffer.isBuffer(b)); assert.deepEqual([...b],[4,5]); assert.ok(t instanceof Int8Array); assert.deepEqual([...t],[-2,3]);
  b[0]=9; t[0]=7; assert.equal(bytes[0],4); assert.equal(typed[0],-2);
 }
});
test('custom constructors work at object array and container positions', () => {
 class Box{constructor(value){this.value=value;}}
 for(const opts of modes){
  const clone=rfdc({...opts,constructorHandlers:[[Box,(o,fn)=>new Box(fn(o.value))]]});
  const original=new Box({n:4});
  const output=clone({object:original,array:[original],set:new Set([original]),map:new Map([['box',original]])});
  for(const box of [output.object,output.array[0],[...output.set][0],output.map.get('box')]){
   assert.ok(box instanceof Box); assert.deepEqual(box.value,{n:4}); assert.notEqual(box.value,original.value);
   box.value.n=6; assert.equal(original.value.n,4);
  }
 }
});
test('custom handlers override builtins without matching subclasses', () => {
 class SpecialDate extends Date{}
 for(const opts of modes){
  const clone=rfdc({...opts,constructorHandlers:[[Date,()=>({handled:true})]]});
  assert.deepEqual(clone({date:new Date(0)}).date,{handled:true});
  assert.deepEqual(clone([new SpecialDate(0)])[0],{});
 }
});
test('ordinary ancestor cycles through arrays and repeated calls stay independent', () => {
 for(const proto of [false,true]){
  const root={id:'root'}, child={parent:root}; root.children=[child]; child.self=child;
  const clone=rfdc({proto,circles:true}), a=clone(root), b=clone(root);
  assert.equal(a.children[0].parent,a); assert.equal(a.children[0].self,a.children[0]);
  assert.equal(b.children[0].parent,b); assert.notEqual(a,b); assert.notEqual(a.children,b.children);
  a.id='changed'; assert.equal(root.id,'root'); assert.equal(b.id,'root');
 }
});
test('prototype property policy survives container and handler recursion', () => {
 class Box{constructor(value){this.value=value;}}
 for(const opts of modes){
  const value=Object.assign(Object.create({inherited:{n:9}}),{own:{n:2}});
  const clone=rfdc({...opts,constructorHandlers:[[Box,(o,fn)=>new Box(fn(o.value))]]});
  const out=clone({plain:value,map:new Map([['v',value]]),set:new Set([value]),box:new Box(value)});
  for(const item of [out.plain,out.map.get('v'),[...out.set][0],out.box.value]){
   assert.deepEqual(item.own,{n:2}); assert.notEqual(item.own,value.own);
   assert.equal(Object.hasOwn(item,'inherited'),!!opts.proto);
   if(opts.proto){assert.deepEqual(item.inherited,{n:9}); assert.notEqual(item.inherited,value.inherited);}
  }
 }
});
