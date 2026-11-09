// Partition original discovery, without changing test assertions or fixtures.
const fs=require('fs'),path=require('path'),read=fs.readdirSync;
const suite=process.env.SUFFICE_NATIVE_SUITE,root=process.cwd();
const canonical=p=>path.resolve(p).replace(/\\/g,'/').toLowerCase();
fs.readdirSync=function(p,options){
  const entries=read.apply(this,arguments),absolute=canonical(p);
  if(suite&&options&&options.withFileTypes&&absolute===canonical(path.join(root,'src'))&&suite!=='__source__')return [];
  if(suite&&options&&options.withFileTypes&&absolute===canonical(path.join(root,'test')))return entries.filter(e=>e.name===suite);
  if(suite==='runtime'&&absolute===canonical(path.join(root,'test/runtime/samples'))){const start=Number(process.env.SUFFICE_RUNTIME_START||0),count=Number(process.env.SUFFICE_RUNTIME_COUNT||100);return entries.slice(start,start+count);}
  return entries;
};
require('./native-loader-base.cjs');
