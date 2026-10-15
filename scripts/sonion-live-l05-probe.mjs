import * as aq from '../.suffice/field-live-extension-v1/tasks/l05/base/src/index.js';
import * as arrow from '../.suffice/field-live-extension-v1/tasks/l05/dependencies/node_modules/apache-arrow/Arrow.node.mjs';
import {writeFile} from 'node:fs/promises';
const results=[];
const full=arrow.tableFromArrays({a:new Int32Array([1,2]),b:['x','y']});
const cases={
 'typed-empty-arrow-slice':()=>full.slice(0,0),
 'typed-empty-arrow-arrays':()=>arrow.tableFromArrays({a:new Int32Array([]),b:arrow.vectorFromArray([],new arrow.Utf8())}),
 'no-fields-empty-arrow':()=>new arrow.Table(),
 'typed-empty-arquero':()=>aq.table({a:[],b:[]})
};
const fullBytes=arrow.tableToIPC(full);
const toAQ=value=>value instanceof aq.ColumnTable?value:aq.fromArrow(arrow.tableToIPC(value));
for(const [name,make] of Object.entries(cases)){
 try {
  const first=toAQ(make()),second=aq.fromArrow(fullBytes),combined=first.concat(second),bulk=first.concat([second,second]);
  results.push({name,inputRows:first.numRows(),inputColumns:first.columnNames(),fullRows:second.numRows(),resultRows:combined.numRows(),resultColumns:combined.columnNames(),objects:combined.objects(),bulkRows:bulk.numRows()});
 } catch(e){results.push({name,error:{name:e.name,message:e.message,stack:e.stack}});}
}
console.log(JSON.stringify(results,null,2));
await writeFile(new URL('../research/field-live-extension-v1/l05/probe.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
