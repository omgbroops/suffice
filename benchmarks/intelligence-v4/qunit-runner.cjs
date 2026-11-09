const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
const QUnit=require('qunit');global.QUnit=QUnit;QUnit.config.autostart=false;
// Match the upstream Node unit script; browser-only cases require a browser.
QUnit.config.filter='!-webonly';
const tests=[];let loadError;
QUnit.on('testEnd',test=>tests.push({title:test.fullName.join(' > '),status:test.status,durationMs:test.runtime??0,error:test.errors?.length?test.errors:null}));
QUnit.on('runEnd',run=>{fs.writeFileSync(process.env.SUFFICE_EVAL_REPORT,JSON.stringify({framework:'qunit',stats:run.testCounts,tests,loadError}));process.exitCode=run.testCounts.failed||loadError?1:0;});
(async()=>{try{await import(pathToFileURL(path.resolve(process.argv[2])).href);}catch(error){loadError={message:error.message,stack:error.stack};}QUnit.start();})();
