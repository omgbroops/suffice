require('./test/setup');
const glob=require('glob');
for(const p of glob.sync('**/__test__.js',{cwd:'src'}))require('./src/'+p);
for(const p of glob.sync('*/index.js',{cwd:'test'})){
  // This suite requires Nightmare/Electron. It contains no dataset F2P/P2P labels.
  if(p!=='custom-elements/index.js')require('./test/'+p);
}
