import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/memory.mjs';
import { sleepCycle } from '../src/sleep.mjs';

const event=(scope='owner',text='月光蜜瓜發佈色是青色。',key='one')=>({scope,text,sourceKey:key,source:'demo://'+key,kind:'user'});
function fixture(t){const s=new MemoryStore(':memory:');t.after(()=>s.close());return s;}
test('Chinese retrieval, exact scope isolation and idempotent imports',t=>{
  const s=fixture(t);const a=s.ingest(event());s.ingest(event('other','月光蜜瓜是秘密紫色。'));
  assert.equal(s.ingest(event()).inserted,false);
  assert.deepEqual(s.search('owner','月光蜜瓜').map(x=>x.id),[a.id]);
  assert.equal(s.read('other',a.id),null);
  assert.throws(()=>s.ingest(event('owner','corrected')),/conflict/);
  assert.equal(s.stats('owner').events,1);
});
test('invalid batch rolls back, FTS operators remain data',t=>{
  const s=fixture(t);
  assert.throws(()=>s.ingestMany([event(),{...event('owner','bad','two'),kind:'unknown'}]));
  assert.equal(s.stats('owner').events,0);
  s.ingest(event());assert.doesNotThrow(()=>s.search('owner','" OR NOT (月光) * : -'));
});
test('read paginates without corrupting multi-byte text and context enforces bytes',t=>{
  const s=fixture(t);const text='🌕中文 '.repeat(3000)+'遠端結尾證據';const {id}=s.ingest(event('owner',text));
  let offset=0,rebuilt='';do{const page=s.read('owner',id,{offset,maxBytes:97});rebuilt+=page.text;offset=page.nextOffset;}while(offset!==null);
  assert.equal(rebuilt,text);assert.match(s.search('owner','結尾證據')[0].excerpt,/結尾證據/);
  const recall=s.context('owner','中文',{maxBytes:700});assert.ok(recall.bytes<=700);
});
test('extractive sleep preserves originals and only approved candidates are recalled',async t=>{
  const s=fixture(t);const {id}=s.ingest(event());
  const result=await sleepCycle(s,'owner',{model:{propose:async()=>[{eventId:id,quote:'月光蜜瓜',body:'MODEL_SUMMARY'}]}});
  assert.equal(result.processed,1);assert.equal(s.stats('owner').candidates,1);
  assert.doesNotMatch(s.context('owner','月光蜜瓜').text,/MODEL_SUMMARY/);
  s.review('owner',result.memories[0],true);
  assert.match(s.context('owner','月光蜜瓜').text,/MODEL_SUMMARY/);
  assert.equal(s.read('owner',id).text,event().text);
});
test('invalid quotes, scope mismatch and model failures commit nothing',async t=>{
  const s=fixture(t);const {id}=s.ingest(event());const other=s.ingest(event('other'));
  for(const proposal of [{eventId:id,quote:'invented',body:'bad'},{eventId:other.id,quote:'月光蜜瓜',body:'bad'}])
    await assert.rejects(sleepCycle(s,'owner',{model:{propose:async()=>[{eventId:id,quote:'月光蜜瓜',body:'valid'},proposal]}}));
  await assert.rejects(sleepCycle(s,'owner',{model:{propose:async()=>{throw new Error('offline');}}}));
  assert.equal(s.stats('owner').pending,1);assert.equal(s.memories('owner','candidate').length,0);
});
test('model omissions stay pending; extractive fallback processes remainder',async t=>{
  const s=fixture(t);const {id}=s.ingest(event());s.ingest(event('owner','second source','two'));
  await sleepCycle(s,'owner',{model:{propose:async()=>[{eventId:id,quote:'月光蜜瓜',body:'summary'}]}});
  assert.equal(s.stats('owner').pending,1);await sleepCycle(s,'owner');assert.equal(s.stats('owner').pending,0);
  assert.equal(s.pending('owner').length,0);
});
test('forget removes original, index and derivatives; stable key cannot resurrect',async t=>{
  const s=fixture(t);const {id}=s.ingest(event());await sleepCycle(s,'owner');
  assert.equal(s.memories('owner').length,1);assert.throws(()=>s.forget('other',id));
  s.forget('owner',id);assert.equal(s.read('owner',id),null);
  assert.equal(s.search('owner','月光').length,0);assert.equal(s.memories('owner').length,0);
  assert.equal(s.ingest(event()).status,'forgotten');assert.equal(s.stats('owner').events,0);
});
test('redacts common credentials before indexing',t=>{
  const s=fixture(t);const {id}=s.ingest(event('owner','password=hunter22 Bearer abc123secret'));
  const original=s.read('owner',id).text;assert.doesNotMatch(original,/hunter22|abc123secret/);
});
