const fs=require('fs');
module.exports=class NativeReporter{
  constructor(runner){
    const tests=[],passes=[],failures=[],pending=[];
    const stats={tests:0,passes:0,failures:0,pending:0};
    const clean=t=>({title:t.title,fullTitle:t.fullTitle(),duration:t.duration,err:t.err?{message:t.err.message,stack:t.err.stack}:null});
    runner.on('test end',t=>{stats.tests++;tests.push(clean(t));});
    runner.on('pass',t=>{stats.passes++;passes.push(clean(t));});
    runner.on('fail',(t,err)=>{stats.failures++;t.err=err;failures.push(clean(t));});
    runner.on('pending',t=>{stats.pending++;pending.push(clean(t));});
    runner.on('end',()=>fs.writeFileSync(process.env.SUFFICE_MOCHA_REPORT,JSON.stringify({stats,tests,passes,failures,pending})));
  }
};
