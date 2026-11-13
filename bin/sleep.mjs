#!/usr/bin/env node
import { mkdirSync, existsSync, readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { MemoryStore } from '../src/memory.mjs';
import { configFile, homeDir, loadConfig, validateConfig } from '../src/config.mjs';
import { sleepCycle } from '../src/sleep.mjs';
import { ChatCompletionsModel } from '../src/model.mjs';

const help = `DSH Sleep — persistent evidence, not a larger native context window
Usage: dsh-sleep <command> [arguments]
  init                              Create disabled config; keep existing config
  doctor                            Check Node, SQLite and configuration
  ingest <scope> <events.jsonl|->     Import JSONL (sourceKey, source, text, kind?)
  search <scope> <query>             Return matching historical events
  context <scope> <query>            Build a bounded evidence block
  read <scope> <event-id> [offset]    Read original (offset: Unicode code points)
  sleep <scope>                     Run ONE batch with configured mode
  status <scope>                    Show archive counts
  memories <scope> [active|candidate|rejected]
  review <scope> <memory-id> <accept|reject>
  forget <scope> <event-id>          Remove this event and derived memories
  install                           Install app and DSH skill for this user
Use DSH_SLEEP_HOME / DSH_SLEEP_CONFIG to select data/config locations.
See README for exact-session DSH setup and local/API model opt-in.`;
const out = value => process.stdout.write(JSON.stringify(value,null,2)+'\n');
async function main(args) {
  const [cmd,scope,...rest]=args;
  if (!cmd || ['help','--help','-h'].includes(cmd)) { console.log(help); return; }
  if (cmd==='install') { const { install }=await import('./install.mjs'); out(install()); return; }
  if (cmd==='init') {
    const file=configFile();mkdirSync(dirname(file),{recursive:true,mode:0o700});
    if (!existsSync(file)) writeFileSync(file,JSON.stringify(validateConfig(),null,2)+'\n',{mode:0o600,flag:'wx'});
    out({config:file,enabled:loadConfig().enabled});return;
  }
  const known=['doctor','ingest','search','context','read','sleep','status','memories','review','forget'];
  if (!known.includes(cmd)) throw new Error('Unknown command. Run dsh-sleep help');
  if (cmd!=='doctor'&&!scope) throw new Error('A scope is required');
  const store=new MemoryStore(join(homeDir(),'memory.sqlite'));
  try {
    switch(cmd) {
      case 'doctor': {
        const config=loadConfig();
        if(config.mode==='model') new ChatCompletionsModel(config.model);
        out({node:process.version,sqlite:'ready',config:configFile(),mode:config.mode,enabled:config.enabled,
          mappedSessions:Object.keys(config.sessionScopes),dshRuntime:'not checked',modelEndpoint:'not contacted'});break;
      }
      case 'ingest': {
        const file=rest[0];if(!file)throw new Error('JSONL file or - is required');
        const input=file==='-'?process.stdin:createReadStream(file,{encoding:'utf8'});
        const lines=createInterface({input,crlfDelay:Infinity});let batch=[],inserted=0,seen=0;
        const flush=()=>{const result=store.ingestMany(batch);inserted+=result.filter(x=>x.inserted).length;seen+=result.length;batch=[];};
        try { for await(const line of lines){if(!line.trim())continue;
          if(Buffer.byteLength(line)>100000)throw new Error('JSONL line exceeds 100000 bytes');
          let event;try{event=JSON.parse(line);}catch{throw new Error('Invalid JSONL; earlier batches may already be committed');}
          if(!event||typeof event!=='object'||Array.isArray(event))throw new Error('Each JSONL line must be an event object');
          if(event.scope&&event.scope!==scope)throw new Error('JSONL scope mismatch');
          batch.push({...event,scope});if(batch.length===100)flush();
        } if(batch.length)flush(); }
        finally {lines.close();if(file!=='-')input.destroy();}
        out({seen,inserted});break;
      }
      case 'search': out(store.search(scope,rest.join(' ')));break;
      case 'context': out(store.context(scope,rest.join(' '),{maxBytes:loadConfig().recallBytes}));break;
      case 'read': out(store.read(scope,rest[0],{offset:rest[1]===undefined?0:Number(rest[1])}));break;
      case 'status': out(store.stats(scope));break;
      case 'memories': out(store.memories(scope,rest[0]??'active'));break;
      case 'sleep': {
        const config=loadConfig();const model=config.mode==='model'?new ChatCompletionsModel(config.model):undefined;
        out(await sleepCycle(store,scope,{model}));break;
      }
      case 'review':
        if(!['accept','reject'].includes(rest[1]))throw new Error('Specify accept or reject');
        store.review(scope,rest[0],rest[1]==='accept');out({id:rest[0],status:rest[1]});break;
      case 'forget': out(store.forget(scope,rest[0]));break;
    }
  } finally {store.close();}
}
main(process.argv.slice(2)).catch(error=>{console.error('dsh-sleep:',error.message);process.exitCode=1;});
