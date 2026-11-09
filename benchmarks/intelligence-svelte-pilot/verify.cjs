const {execFileSync}=require('child_process');
const path=require('path');
const runtime=path.resolve('node_modules/.suffice-node16/node.exe');
const env={...process.env,NODE_OPTIONS:''};
for(const args of [['src/shared/_build.js'],['node_modules/rollup/bin/rollup','-c'],['node_modules/rollup/bin/rollup','-c','rollup.store.config.js']]){
  execFileSync(runtime,['--max-old-space-size=384',...args],{stdio:'inherit',env,windowsHide:true});
}
execFileSync(runtime,['--max-old-space-size=384','node_modules/mocha/bin/_mocha','--opts','NUL','native-tests.cjs','--reporter','spec','--exit'],{stdio:'inherit',env,windowsHide:true});
