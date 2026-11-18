import assert from 'node:assert/strict';
import { MemoryStore } from '../src/memory.mjs';
import { api, harness, ask } from './dsh-harness.mjs';

const store = new MemoryStore(':memory:');
let first,second;
try{
  first=await harness(store);
  first.ctx.tools.register(api.defineTool({name:'fixture_evidence',description:'Offline evidence fixture',parameters:{},
    output:{schema:{type:'object',additionalProperties:true},render:()=>[{type:'text',text:'tool-source-5521'}]},execute:async()=>({ok:true})}));
  first.adapter.nextTool='fixture_evidence';
  await ask(first,'first','Aurora 的私人驗收碼是 mint-lantern-7391。');
  assert.equal(store.stats('owner').events,3,'Archive real user, nested assistant and tool result events');
  assert.equal(store.search('owner','tool-source-5521')[0].kind,'tool');
  assert.ok(store.search('owner','ocean-2048').length,'Assistant text must be archived');
  await first.ctx.fiber.dispose();first=null;
  second=await harness(store);
  second.adapter.nextTool='sleep_search';
  const agent=await ask(second,'second','Aurora 私人驗收碼？');
  assert.equal(store.stats('owner').events,5,'Memory tool output must not be archived recursively');
  assert.match(JSON.stringify(second.adapter.requests[0].messages),/mint-lantern-7391/);
  const result=await second.ctx.tools.get('sleep_search',agent).execute({query:'Aurora'},{agent,signal:new AbortController().signal});
  assert.ok(result.ids.length);
  const visitor=await ask(second,'visitor','Aurora 私人驗收碼？');
  assert.doesNotMatch(JSON.stringify(second.adapter.requests.at(-1).messages),/mint-lantern-7391/);
  assert.equal((await second.ctx.tools.get('sleep_search',visitor).execute({query:'mint-lantern-7391'},{agent:visitor})).ids.length,0);
  await second.fork.dispose();
  assert.equal(second.ctx.tools.get('sleep_search',agent),undefined,'Plugin unload must unregister its tools');
  console.log(JSON.stringify({ok:true,dshVersion:'0.2.2-rc.1',checks:['real event archival','assistant message layout',
    'tool-result archival','cross-session recall after plugin reload','native tool execution','no recursive memory capture','scope isolation','plugin unload'],
    limitations:'Scripted model; no desktop/profile launcher, live account or real API validation.'},null,2));
}finally{if(first)await first.ctx.fiber.dispose();if(second)await second.ctx.fiber.dispose();store.close();}
