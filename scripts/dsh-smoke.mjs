// Actual DSH services and agent loop; only the model is scripted. No account or network calls.
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime,{LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm';
import SessionStore,{SessionId} from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native';
import { MemoryStore } from '../src/memory.mjs';
import { bindPlugin,inject } from '../src/dsh-plugin.mjs';
import { loadDshApi } from '../src/dsh-api.mjs';

class ScriptedModel extends LlmAdapter {
  requests=[];
  nextTool=null;
  async resolveModel(provider,model){return {provider,id:model,name:model};}
  async *stream(options){
    this.requests.push(options);
    if(this.nextTool){
      const name=this.nextTool;this.nextTool=null;
      const args=name==='sleep_search'?{query:'Aurora'}:{};
      const id='fixture-call-'+this.requests.length;
      yield {type:'block-start',index:0,blockType:'tool-call'};
      yield {type:'tool-call-delta',index:0,id,name,argumentsDelta:JSON.stringify(args)};
      yield {type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:JSON.stringify(args)}};
      yield {type:'finish',reason:{kind:'tool-calls'}};return;
    }
    const text='Recorded response marker: ocean-2048';
    yield {type:'block-start',index:0,blockType:'text'};
    yield {type:'text-delta',index:0,text};
    yield {type:'block-end',index:0,block:{type:'text',text}};
    yield {type:'finish',reason:{kind:'stop'}};
  }
}
const store=new MemoryStore(':memory:');
const api=await loadDshApi();
async function harness(){
  const ctx=new Context(),adapter=new ScriptedModel();
  for(const plugin of [LlmRuntime,SessionStore,SessionProjectionRegistry,SystemPrompt,ToolRuntime,NativeToolExecutor,AgentRegistry])await ctx.plugin(plugin);
  await ctx.plugin(AgentLoop,{agents:[]});
  ctx.llm.registerAdapter(['scripted'],adapter);
  const fork=await ctx.plugin({name:'sleep-integration',inject,apply:context=>{
    bindPlugin(context,{enabled:true,sessionScopes:{first:'owner',second:'owner',visitor:'visitor'},captureToolResults:true},
      {...api,store,schedule:false});
  }});
  return {ctx,adapter,fork};
}
async function ask(h,id,text){
  const agent=await h.ctx.agentLoop.create(SessionId(id),{provider:'scripted',model:'fixture'});
  agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));
  await agent.whenIdle();
  assert.ok(h.adapter.requests.length,'Agent must reach the scripted provider');
  return agent;
}
let first,second;
try{
  first=await harness();
  first.ctx.tools.register(api.defineTool({name:'fixture_evidence',description:'Offline evidence fixture',parameters:{},
    output:{schema:{type:'object',additionalProperties:true},render:()=>[{type:'text',text:'tool-source-5521'}]},execute:async()=>({ok:true})}));
  first.adapter.nextTool='fixture_evidence';
  await ask(first,'first','Aurora 的私人驗收碼是 mint-lantern-7391。');
  assert.equal(store.stats('owner').events,3,'Archive real user, nested assistant and tool result events');
  assert.equal(store.search('owner','tool-source-5521')[0].kind,'tool');
  assert.ok(store.search('owner','ocean-2048').length,'Assistant text must be archived');
  await first.ctx.fiber.dispose();first=null;
  second=await harness();
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
