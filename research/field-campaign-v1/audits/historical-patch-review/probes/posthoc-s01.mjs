import Emittery from './index.js';
const rows=[];
for(const method of ['emit','emitSerial'])for(const event of ['listenerAdded','listenerRemoved']){const e=new Emittery();e.on('ordinary',()=>{});let outcome;try{await e[method](Emittery[event],{eventName:'forged',listener(){}});outcome='fulfilled';}catch(error){outcome=error instanceof TypeError?'TypeError':error.name;}rows.push({method,event,outcome,expected:'TypeError'});}
console.log(JSON.stringify(rows));if(rows.some(r=>r.outcome!==r.expected))process.exitCode=1;
