// Independently stated usage-site oracles, not generated from either analyzer.
// A usage site includes imports/reexports as well as reads/calls of that binding.
export const cases=[
  {id:'alias-and-shadow',target:{path:'core.mjs',name:'work'},files:{
    'core.mjs':'export function work(){return 1}',
    'use.mjs':"import {work as run} from './core.mjs';\nexport function execute(){return run()}",
    'noise.mjs':'function separate(work){\n return work();\n}\nconst obj={work:1};\nobj.work;'
  },gold:['use.mjs:1','use.mjs:2']},
  {id:'default-binding',target:{path:'core.mjs',name:'compute'},files:{
    'core.mjs':'function compute(){return 2}\nexport default compute;',
    'use.mjs':"import calculate from './core.mjs';\ncalculate();",
    'noise.mjs':'const compute=()=>9;\ncompute();'
  },gold:['use.mjs:1','use.mjs:2']},
  {id:'explicit-reexport',target:{path:'core.mjs',name:'fetchValue'},files:{
    'core.mjs':'export function fetchValue(){return 3}',
    'barrel.mjs':"export {fetchValue as value} from './core.mjs';",
    'use.mjs':"import {value as read} from './barrel.mjs';\nread();",
    'noise.mjs':'function fetchValue(){return 99}\nfetchValue();'
  },gold:['barrel.mjs:1','use.mjs:1','use.mjs:2']},
  {id:'same-name-binding',target:{path:'core.mjs',name:'check'},files:{
    'core.mjs':'export function check(){return true}',
    'use.mjs':"import {check} from './core.mjs';\ncheck();\nfunction other(check){\ncheck();\n}\nconst obj={check: 1};\nobj.check;"
  },gold:['use.mjs:1','use.mjs:2']}
];
