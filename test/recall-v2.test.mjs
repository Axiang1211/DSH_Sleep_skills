import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../src/memory.mjs';
import { sleepCycle } from '../src/sleep.mjs';
const event=(text,key='one',scope='owner')=>({scope,sourceKey:key,source:'demo://'+key,text});
const fixture=t=>{const s=new MemoryStore(':memory:');t.after(()=>s.close());return s;};
test('approved summary vocabulary retrieves its original source, candidates do not',t=>{
  const s=fixture(t);const {id}=s.ingest(event('青色是新的發佈色'));
  const [memory]=s.consolidate('owner',[{eventId:id,quote:'青色',body:'The launch theme is turquoise.'}],[id],'model');
  assert.equal(s.search('owner','turquoise').length,0);
  s.review('owner',memory,true);
  const found=s.search('owner','turquoise')[0];assert.equal(found.id,id);assert.deepEqual(found.matchedBy,['summary']);
  assert.equal(s.search('other','turquoise').length,0);
  assert.match(s.context('owner','turquoise').text,/launch theme/);
  s.forget('owner',id);assert.equal(s.search('owner','turquoise').length,0);
});
test('small budgets return truncated valid evidence instead of silently losing long hits',t=>{
  const s=fixture(t);const {id}=s.ingest(event('🌕中文 evidence '.repeat(500)));
  for(const maxBytes of [256,512,700,1200]){
    const recall=s.context('owner','evidence',{maxBytes});
    assert.deepEqual(recall.ids,[id]);assert.ok(Buffer.byteLength(recall.text)<=maxBytes);
    const row=JSON.parse(recall.text.split('\n')[1]);assert.equal(row.id,id);assert.equal(row.truncated,true);
    assert.doesNotMatch(row.excerpt,/\uFFFD/u);
  }
});
test('schema 1 upgrade rebuilds only accepted summaries without losing event IDs',t=>{
  const dir=mkdtempSync(join(tmpdir(),'sleep-migration-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'memory.sqlite');let s=new MemoryStore(file);
  const {id}=s.ingest(event('原始證據'));const [m]=s.consolidate('owner',[{eventId:id,quote:'證據',body:'approvedalias'}],[id],'model');s.review('owner',m,true);
  s.consolidate('owner',[{eventId:id,quote:'證據',body:'unverifiedalias'}],[id],'model');
  // Reconstruct the previous schema from the original tables, without the new index.
  s.db.exec('DROP TABLE memory_search; PRAGMA user_version=1;');s.close();
  s=new MemoryStore(file);
  try{assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,2);
    assert.equal(s.search('owner','approvedalias')[0].id,id);
    assert.equal(s.search('owner','unverifiedalias').length,0);assert.equal(s.read('owner',id).text,'原始證據');}
  finally{s.close();}
});
test('oversized serialized source reports the blockage and can be processed with a larger budget',async t=>{
  const s=fixture(t);s.ingest(event('"'.repeat(60000)));
  await assert.rejects(sleepCycle(s,'owner'),/exceeds maxBytes/);
  assert.equal(s.stats('owner').pending,1);
  assert.equal((await sleepCycle(s,'owner',{maxBytes:200000})).processed,1);
});
