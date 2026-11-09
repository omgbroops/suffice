import {readFile, writeFile, realpath, stat} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {homedir} from 'node:os';

export async function resolveProject(input, base=process.cwd()) {
  let path=input.trim();
  if((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) path=path.slice(1,-1);
  if(path==='~') path=homedir();
  else if(/^~[/\\]/.test(path)) path=join(homedir(),path.slice(2));
  const actual=await realpath(resolve(base,path||'.'));
  if(!(await stat(actual)).isDirectory()) throw new Error('Choose a project directory, not a file.');
  return actual;
}

export async function recentProjects(home) {
  try {
    const data=JSON.parse(await readFile(resolve(home,'projects.json'),'utf8'));
    return Array.isArray(data)?data.filter(p=>typeof p==='string').slice(0,8):[];
  } catch(e) {if(e.code==='ENOENT' || e instanceof SyntaxError) return [];throw e;}
}

export async function rememberProject(home,path) {
  const previous=await recentProjects(home);
  await writeFile(resolve(home,'projects.json'),JSON.stringify([path,...previous.filter(p=>p!==path)].slice(0,8),null,2)+'\n',{mode:0o600});
}

