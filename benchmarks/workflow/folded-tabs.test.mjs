import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const y=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/src/index.ts')).href);
function check(source,width=80){const ast=y.eventsToAst(y.parseEvents(source,{}),{source,schema:y.CORE_SCHEMA});const rendered=y.present(ast,{schema:y.CORE_SCHEMA,lineWidth:width});assert.deepEqual(y.load(rendered),y.load(source));assert.match(rendered,/k: [>|]/);}
test('folded tabs preserve meaning at every line adjacency',()=>{
  const lines=['alpha','\tdeep','\t',' more','beta'];
  for(const a of lines)for(const b of lines)check(`k: >2\n  ${a}\n  ${b}\n`);
  check('k: >\n  alpha\n  \tdeep\n  beta\n');
});
test('tab-leading long lines and wrap points preserve meaning',()=>{
  for(const width of [20,40,80]){
    check(`k: >\n  \t${'word '.repeat(25).trim()}\n  tail\n`,width);
    check(`k: >\n  ${'a'.repeat(90)} \tzzz\n`,width);
    check(`k: >\n  prefix ${'word '.repeat(15)}\tmore\n`,width);
  }
});
test('literal folded blank and chomping controls remain valid',()=>{
  for(const style of ['|','|-','|+','>','>-','>+'])for(const body of ['a\n  \tdeep\n  b\n','a\n\n  b\n\n','a\n   deeper\n  b\n'])check(`k: ${style}\n  ${body}`);
});
