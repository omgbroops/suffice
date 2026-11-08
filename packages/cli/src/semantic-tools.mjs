import {Type} from 'typebox';

// Keep the compiler off the default CLI startup path, including module loading.
export function createSemanticTools({workspace, recipes=false, log=()=>{}, policy, onDispose} = {}) {
  let instance, registry, tail=Promise.resolve();
  const graph = async () => {
    if (!instance) {
      const {SemanticGraph} = await import('./semantic/graph.mjs');
      instance = new SemanticGraph(workspace,policy); onDispose?.(()=>instance.dispose());
    }
    return instance;
  };
  const symbol = Type.String({description:'Exact identity from semantic_symbols; names alone are ambiguous.'});
  const limit = Type.Optional(Type.Integer({minimum:1,maximum:80}));
  const traversal = {symbol,depth:Type.Optional(Type.Integer({minimum:1,maximum:5})),limit};
  const make = (name,description,properties,operation) => ({name,label:name,description,parameters:Type.Object(properties),outputSchema:Type.Unknown(),
    execute(_id,args) {
      const run=tail.then(async()=>{
        const start=performance.now(), service=await graph(); const previous=service.metrics.length,beforeIo={...service.io};
        const value=await operation(service,args);
        const revision=value.revision; service.refresh();
        if (revision && revision!==service.revision) return {isError:true,content:[{type:'text',text:JSON.stringify({error:'source_changed_during_query',retry:true})}]};
        log({type:'semantic',tool:name,latencyMs:performance.now()-start,characters:JSON.stringify(value).length,updates:service.metrics.slice(previous),io:Object.fromEntries(Object.entries(service.io).map(([key,value])=>[key,value-beforeIo[key]])),lookup:service.lastLookup});
        return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,details:{}};
      });
      tail=run.catch(()=>{}); return run;
    },
  });
  const tools=[
    make('semantic_symbols','Find compiler-resolved JS/TS/JSX/TSX declarations. Returns stable scoped identities, locations and explicit index limits; source remains available through read.',{query:Type.Optional(Type.String()),path:Type.Optional(Type.String()),limit},(g,a)=>g.symbols(a)),
    make('symbol_dependencies','Get a bounded resolved dependency subgraph. Static relationships are evidence; unresolved runtime behavior remains possible.',{...traversal,direction:Type.Optional(Type.Union([Type.Literal('dependencies'),Type.Literal('dependents')]))},(g,a)=>g.dependencies(a)),
    make('symbol_callers','Find direct or transitive compiler-resolved callers of one exact symbol. Unresolved/dynamic calls are reported separately.',traversal,(g,a)=>g.callers(a)),
    make('impact_analysis','Assess a proposed signature, return_type, parameters, exports, rename, implementation, mutation or side_effect change. Structural paths are resolved; behavioral/type consequences are possible, requiring verification.',{...traversal,change:Type.Union(['signature','return_type','parameters','exports','rename','implementation','mutation','side_effect'].map(value=>Type.Literal(value)))},(g,a)=>g.impact(a)),
    make('affected_tests','Select candidate tests from resolved references and transitive imports. Reports direct, inferred, uncertain and unmapped tests; independent full-suite verification remains recommended.',{symbols:Type.Array(symbol,{minItems:1,maxItems:30}),limit},(g,a)=>g.affectedTests(a)),
  ];
  if (recipes) {
    const recipesFor=async g=>registry??=new (await import('./semantic/recipes.mjs')).RecipeRegistry(g);
    tools.push(make('recipes_search','Discover versioned deterministic transformations and their schemas, preconditions and verification requirements.',{query:Type.Optional(Type.String())},async(g,a)=>(await recipesFor(g)).search(a.query)),
      make('recipe_apply','Preview by default; apply=true executes a verified transaction at an exact graph revision. Failures roll back owned edits. Requires an explicit verification command for application.',{
        recipe:Type.String(),parameters:Type.Record(Type.String(),Type.Unknown()),expectedRevision:Type.String(),apply:Type.Optional(Type.Boolean()),
        verification:Type.Optional(Type.Object({command:Type.String(),args:Type.Array(Type.String())})),
      },async(g,a)=>(await recipesFor(g)).apply(a)));
  }
  return tools;
}
