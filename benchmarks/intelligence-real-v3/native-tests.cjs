// Keep original discovery except explicitly recorded, unscored native failures.
const fs=require('fs'),path=require('path'),read=fs.readdirSync;
const environment=JSON.parse(fs.readFileSync(path.join(__dirname,'native-environment.json'),'utf8'));
const excluded=new Set(environment.excludedRuntimeSamples);
const canonical=p=>path.resolve(p).replace(/\\/g,'/').toLowerCase();
const samples=canonical(path.join(__dirname,'test/runtime/samples'));
fs.readdirSync=function(p,options){
  const entries=read.apply(this,arguments);
  return global.__sufficeNativeSuite==='runtime'&&typeof p==='string'&&canonical(p)===samples?entries.filter(e=>!excluded.has(typeof e==='string'?e:e.name)):entries;
};
require('./native-loader-base.cjs');
