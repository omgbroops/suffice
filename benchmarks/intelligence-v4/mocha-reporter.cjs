const fs=require('fs');
module.exports=function(runner){
  // Older Mocha initializes runner.stats in Base, rather than in Runner.
  new (require('mocha/lib/reporters/base'))(runner);
  const tests=[],hooks=[];
  const capture=(test,status,error)=>{const row={title:test.fullTitle(),status,durationMs:test.duration??0,error:error?{message:error.message,stack:error.stack}:null};if(test.type==='hook')hooks.push(row);else tests.push(row);};
  runner.on('pass',test=>capture(test,'passed'));
  runner.on('pending',test=>capture(test,'pending'));
  runner.on('fail',(test,error)=>capture(test,'failed',error));
  runner.once('end',()=>fs.writeFileSync(process.env.SUFFICE_EVAL_REPORT,JSON.stringify({framework:'mocha',stats:runner.stats,tests,hooks})));
};
