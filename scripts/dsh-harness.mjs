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
import { bindPlugin,inject } from '../src/dsh-plugin.mjs';
import { loadDshApi } from '../src/dsh-api.mjs';

class ScriptedModel extends LlmAdapter {
  requests=[];
  nextTool=null;
  async resolveModel(provider,model){return {provider,id:model,name:model,context:{contextWindow:8192}};}
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
export const api=await loadDshApi();
export async function harness(store, config = {}) {
  const ctx=new Context(),adapter=new ScriptedModel();
  for(const plugin of [LlmRuntime,SessionStore,SessionProjectionRegistry,SystemPrompt,ToolRuntime,NativeToolExecutor,AgentRegistry])await ctx.plugin(plugin);
  await ctx.plugin(AgentLoop,{agents:[]});
  ctx.llm.registerAdapter(['scripted'],adapter);
  const fork=await ctx.plugin({name:'sleep-integration',inject,apply:context=>{
    bindPlugin(context,{enabled:true,sessionScopes:{first:'owner',second:'owner',visitor:'visitor'},captureToolResults:true,...config},
      {...api,store,schedule:false});
  }});
  return {ctx,adapter,fork};
}
export async function ask(h,id,text){
  const requestsBefore = h.adapter.requests.length;
  const agent=await h.ctx.agentLoop.create(SessionId(id),{provider:'scripted',model:'fixture'});
  agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));
  await agent.whenIdle();
  assert.ok(h.adapter.requests.length > requestsBefore,'Agent must reach the scripted provider');
  return agent;
}
