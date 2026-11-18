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
  return {handlers,tools,plugin,store,dispose:()=>cleanup.forEach(fn=>fn())};
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
  assert.equal((await hook(input,async()=>decision)).messages.length,2,'Retry before commit must still receive recall');
  handlers['session/event']({id:'private'},{seq:10,type:'user/message',data:result.messages[1]});
  assert.equal(await hook(input,async()=>decision),decision);
  const reject={kind:'reject',reason:'no'};assert.equal(await hook(input,async()=>reject),reject);
  handlers['session/disposed']({id:'private'});
  assert.equal(await hook({...input,agent:{id:'private',hidden:true}},async()=>decision),decision);
  assert.equal((await hook(input,async()=>decision)).messages.length,2);
});
test('real DSH nested assistant/tool layouts preserve timestamps and exclude memory calls',t=>{
  const {handlers,store}=setup(t,{captureToolResults:true});const emit=handlers['session/event'];
  emit({id:'private'},{seq:1,time:1000,type:'assistant/message',data:{message:{content:[{type:'text',text:'assistant evidence'}]}}});
  emit({id:'private'},{seq:2,type:'tool/call',data:{callId:'call-a',name:'file_read'}});
  emit({id:'private'},{seq:3,time:2000,type:'tool/result',data:{message:{source:{kind:'tool',callId:'call-a'},content:[{type:'text',text:'sleep_config is a legitimate filename'}]}}});
  emit({id:'private'},{seq:4,type:'tool/call',data:{callId:'call-b',name:'sleep_read'}});
  emit({id:'private'},{seq:5,type:'tool/result',data:{message:{source:{kind:'tool',callId:'call-b'},content:[{type:'text',text:'should not archive'}]}}});
  assert.equal(store.stats('owner').events,2);
  assert.equal(store.search('owner','assistant')[0].createdAt,new Date(1000).toISOString());
  assert.equal(store.search('owner','sleep_config')[0].kind,'tool');
});
test('recall storage failure does not block the host conversation',async t=>{
  const {store,handlers,plugin}=setup(t);store.context=()=>{throw new Error('database busy');};
  const decision={kind:'enter',messages:[]};
  assert.equal(await handlers['agent/pre-step']({agent:{id:'private'},messages:[user('query')]},async()=>decision),decision);
  assert.equal(plugin.healthFor('owner').recallFailures,1);
});
test('disposing during model consolidation cancels the write',async t=>{
  const {store}=setup(t);store.ingest({scope:'owner',sourceKey:'1',source:'demo://1',text:'data'});
  const controller=new AbortController();let finish;
  const {sleepCycle}=await import('../src/sleep.mjs');
  const running=sleepCycle(store,'owner',{signal:controller.signal,model:{propose:events=>new Promise(resolve=>{
    finish=()=>resolve([{eventId:events[0].id,quote:'data',body:'candidate'}]);
  })}});
  controller.abort();finish();await assert.rejects(running);
  assert.equal(store.stats('owner').pending,1);assert.equal(store.memories('owner','candidate').length,0);
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
test('one scope failing consolidation does not starve other scopes',async t=>{
  const {store,plugin}=setup(t);
  store.ingest({scope:'owner',sourceKey:'large',source:'demo://large',text:'"'.repeat(60000)});
  store.ingest({scope:'other',sourceKey:'normal',source:'demo://normal',text:'processable'});
  await plugin.runSleep();
  assert.equal(store.stats('owner').pending,1);assert.equal(plugin.healthFor('owner').sleepFailures,1);
  assert.equal(store.stats('other').pending,0);assert.equal(plugin.healthFor('other').lastSleep.processed,1);
});
test('plugin disposal aborts pending model work and leaves sources unconsolidated',async t=>{
  const handlers={},cleanup=[];const store=new MemoryStore(':memory:');t.after(()=>store.close());
  const ctx={tools:{register:()=>{}},on:(name,fn)=>{handlers[name]=fn;},effect:fn=>cleanup.push(fn())};
  let finish,requestSignal;
  const plugin=bindPlugin(ctx,{enabled:true,sessionScopes:{private:'owner'},sleepAfterEvents:1},
    {store,defineTool:x=>x,createUserMessage:x=>x,schedule:false,model:{propose:(events,{signal})=>{
      requestSignal=signal;return new Promise(resolve=>{finish=()=>resolve([{eventId:events[0].id,quote:'data',body:'candidate'}]);});
    }}});
  store.ingest({scope:'owner',sourceKey:'1',source:'demo://1',text:'data'});
  const running=plugin.runSleep();cleanup.forEach(fn=>fn());assert.equal(requestSignal.aborted,true);
  finish();await running;assert.equal(store.stats('owner').pending,1);assert.equal(store.stats('owner').candidates,0);
});

test('compaction status is session-local, ignores duplicate delivery and clears on disposal', async t => {
  const { handlers, tools } = setup(t);
  const emit = (id, seq, data) => handlers['session/event']({ id }, { type: 'compaction/end', seq, data });
  const status = async id => (await tools.get('sleep_status').execute({}, { agent: { id } })).sessionCompaction;
  emit('private', 5, {});
  emit('private', 7, { error: 'fixture failure' });
  emit('private', 7, { error: 'fixture failure' });
  assert.deepEqual(await status('private'), { completed: 1, failed: 1, lastEndSeq: 7 });
  assert.deepEqual(await status('second'), { completed: 0, failed: 0, lastEndSeq: null });
  handlers['session/disposed']({ id: 'private' });
  assert.deepEqual(await status('private'), await status('second'));
});
