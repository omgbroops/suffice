// Note name -> file slug. Transliterates accents, rejects paths and over-long names instead of silently changing them.
export const MAX_NAME=60;
export function memoryName(raw){
 const s=String(raw??'').trim();
 if(/[\\/]|\.\./.test(s))throw new Error('Name cannot contain / \\ or ..');
 const name=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 if(!name)throw new Error('Name needs letters or numbers');
 if(name.length>MAX_NAME)throw new Error('Name is too long ('+name.length+' of '+MAX_NAME+' characters)');
 return name;
}
