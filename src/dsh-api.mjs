// Keep the same import path for the plugin and diagnostics: DSH resolves linked peers at launch.
export async function loadDshApi(importer=specifier=>import(specifier)) {
  let modules;
  try { modules=await Promise.all([importer('@deepseek-ai/dsh-tools'),importer('@deepseek-ai/dsh-llm')]); }
  catch { throw new Error('DSH modules are unavailable here. Run inside the configured DSH profile; standalone doctor cannot see host-only peers.'); }
  const [{defineTool},{createUserMessage}]=modules;
  if(typeof defineTool!=='function'||typeof createUserMessage!=='function')
    throw new Error('Unsupported DSH module API: defineTool and createUserMessage are required.');
  // Verify the schema DSL and message factory, not only the existence of exports.
  const probe=defineTool({name:'sleep_compatibility_probe',description:'Offline compatibility probe',parameters:{},
    output:{schema:{type:'object',additionalProperties:true},render:()=>[]},execute:async()=>({ok:true})});
  const message=createUserMessage({content:[{type:'text',text:'compatibility probe'}],source:{kind:'dsh-sleep-memory',form:'context'}});
  if(typeof probe.execute!=='function'||message.role!=='user'||typeof message.id!=='string')
    throw new Error('Unsupported DSH tool/message factory behavior.');
  return {defineTool,createUserMessage};
}
