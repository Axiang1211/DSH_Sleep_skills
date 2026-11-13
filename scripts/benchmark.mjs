import { mkdtempSync,rmSync,statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../src/memory.mjs';
const dir=mkdtempSync(join(tmpdir(),'dsh-sleep-bench-')),file=join(dir,'memory.sqlite');
const store=new MemoryStore(file),start=performance.now();
const checks=[],records=1200,wordsPerRecord=1000;
let words=0;
try {
  for(let batch=0;batch<records;batch+=100){
    const events=[];
    for(let i=batch;i<batch+100;i++){
      const marker=`archivekey${String(i).padStart(5,'0')}`;
      const filler=Array.from({length:wordsPerRecord},(_,j)=>`word${(i*31+j)%5000}`).join(' ');
      const text=filler+`\n${marker} 測試專案的驗收碼是 mint${i}.`;
      words+=text.split(/\s+/u).length;
      events.push({scope:'benchmark',sourceKey:String(i),source:'synthetic://'+i,text});
      if(i%100===0)checks.push({query:marker,source:'synthetic://'+i});
    }
    store.ingestMany(events);
  }
  const ingestMs=performance.now()-start,lookup=performance.now();
  const results=checks.map(c=>({...c,hit:store.search('benchmark',c.query,{limit:3}).some(r=>r.source===c.source)}));
  const negative=store.search('benchmark','neverrecordeduniquezz').length;
  const stats=store.stats('benchmark');store.close();
  const output={dataset:'deterministic synthetic lexical lookup',records,whitespaceSeparatedWords:words,
    modelTokens:'not measured',textBytes:stats.bytes,databaseBytes:statSync(file).size,
    recallAt3:results.filter(r=>r.hit).length/results.length,queries:results.length,negativeHits:negative,
    ingestMs:Math.round(ingestMs),lookupMs:Math.round(performance.now()-lookup),
    limitation:'Not BABILong, semantic paraphrase retrieval, or model answer accuracy. Does not prove a larger native context window.',results};
  console.log(JSON.stringify(output,null,2));
  if(output.recallAt3!==1||negative!==0)process.exitCode=1;
} finally {try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});}
