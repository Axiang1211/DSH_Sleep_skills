import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPlugin } from '../src/dsh-plugin.mjs';
import { MemoryStore } from '../src/memory.mjs';
import { validateConfig } from '../src/config.mjs';

function setup(t,extra={}){
  const handlers={},tools=new Map(),cleanup=[];
  const store=new MemoryStore(':memory:');
  const ctx={tools:{register:tool=>tools.set(tool.name,tool),get:(name,agent)=>agent.hidden?undefined:tools.get(name)},
    on:(name,fn)=>{handlers[name]=fn;},effect:fn=>cleanup.push(fn())};
  const plugin=bindPlugin(ctx,{enabled:true,sessionScopes:{private:'owner',second:'owner',stranger:'other'},sleepAfterEvents:1,...extra},
    {store,defineTool:x=>x,createUserMessage:x=>x,schedule:false});
  t.after(()=>{cleanup.forEach(fn=>fn());store.close();});
  return {handlers,tools,plugin,store};
}
const user=(text)=>({source:{kind:'user'},content:[{type:'text',text}]});
test('session events archive only mapped committed user/assistant text, not injection',t=>{
  const {handlers,store}=setup(t);const emit=handlers['session/event'];
  emit({id:'private'},{seq:1,type:'user/message',data:user('月光蜜瓜的顏色是青色')});
  emit({id:'private'},{seq:1,type:'user/message',data:user('月光蜜瓜的顏色是青色')});
  emit({id:'unmapped'},{seq:2,type:'user/message',data:user('secret')});
  emit({id:'private'},{seq:3,type:'user/message',data:{...user('injected'),source:{kind:'dsh-sleep-memory'}}});
  emit({id:'private'},{seq:4,type:'tool/result',data:{content:'tool secret'}});
  assert.equal(store.stats('owner').events,1);
});
test('tools enforce trusted scope even when model supplies extra scope argument',async t=>{
  const {store,tools}=setup(t);const {id}=store.ingest({scope:'owner',sourceKey:'1',source:'demo://1',text:'private secret'});
  const read=tools.get('sleep_read');
  assert.equal((await read.execute({id,scope:'owner'},{agent:{id:'stranger'}})).event,null);
  await assert.rejects(read.execute({id},{agent:{id:'unknown'}}),/no configured/);
  assert.equal((await read.execute({id},{agent:{id:'second'}})).event.id,id);
});
test('pre-step preserves downstream messages/flags, deduplicates, respects visibility and reject',async t=>{
  const {store,handlers}=setup(t);store.ingest({scope:'owner',sourceKey:'1',source:'demo://1',text:'月光蜜瓜 is mint'});
  const hook=handlers['agent/pre-step'];const input={agent:{id:'private'},messages:[user('月光蜜瓜')]};
  const decision={kind:'continue',messages:[{content:'downstream message'}],customFlag:true};
  const result=await hook(input,async()=>decision);
  assert.equal(result.messages.length,2);assert.equal(result.messages[0],decision.messages[0]);assert.equal(result.customFlag,true);
  assert.equal(result.messages[1].source.kind,'dsh-sleep-memory');
  assert.equal(await hook(input,async()=>decision),decision);
  const reject={kind:'reject',reason:'no'};assert.equal(await hook(input,async()=>reject),reject);
  handlers['session/disposed']({id:'private'});
  assert.equal(await hook({...input,agent:{id:'private',hidden:true}},async()=>decision),decision);
  assert.equal((await hook(input,async()=>decision)).messages.length,2);
});
test('automatic sleep works without model calls and keeps original events',async t=>{
  const {store,plugin}=setup(t);store.ingest({scope:'owner',sourceKey:'1',source:'demo://1',text:'persistent'});
  await plugin.runSleep();assert.equal(store.stats('owner').pending,0);assert.equal(store.stats('owner').events,1);
});
test('configuration defaults disabled; rejects unsafe mapping/bounds',()=>{
  assert.equal(validateConfig().enabled,false);
  for(const config of [{enabled:'true'},{sessionScopes:{x:'../other'}},{recallBytes:1000000},{mode:'model'},{sleepIntervalSeconds:0}])
    assert.throws(()=>validateConfig(config));
});
