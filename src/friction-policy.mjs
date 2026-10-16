export const CLARIFIED_CONTRACTS=Object.freeze({
  search:'Search literal text across workspace source and documentation, max 40 matches. Optional path is ONE EXACT FILE, never a directory. Omit path to search all workspace files. Use files() to discover exact file paths before narrowing.',
  symbols:'Find functions, methods, classes and top-level bindings by case-insensitive name substring. Optional path is ONE EXACT FILE, never a directory. Omit path to index all supported workspace source files. Use files() to discover exact file paths. Returns symbol names and line ranges; no source bodies.',
  symbol_references:'Find candidate syntactic identifier references, not a resolved call graph. Optional path is ONE EXACT FILE, never a directory. Omit path to inspect all supported workspace source files; use files() for exact paths. Inspect returned source before relying on a name match.'
});
export function applyFrictionContracts(tools,arm){
  if(arm==='A')return tools;
  if(arm!=='B')throw new Error('Unknown friction arm');
  return tools.map(tool=>{
    if(!CLARIFIED_CONTRACTS[tool.name])return tool;
    const properties={...tool.parameters.properties,path:{...tool.parameters.properties.path,description:'Exact workspace-relative FILE path, not a directory. Omit to search/index all supported workspace files.'}};
    return {...tool,description:CLARIFIED_CONTRACTS[tool.name],parameters:{...tool.parameters,properties},async execute(...args){
      try{return await tool.execute(...args);}catch(error){
        if(error.code!=='EISDIR'&&!/^EISDIR\b/.test(error.message??''))throw error;
        throw new Error(`${tool.name}: path must identify one existing FILE, not a directory. Omit path to search/index all supported workspace files, or call files() and select an exact file path. No directory search was performed.`);
      }
    }};
  });
}
