import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function setup(t){
  const dir=mkdtempSync(join(tmpdir(),'dsh-sleep-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const home=join(dir,'memory home'),dsh=join(dir,'dsh home');
  const env={...process.env,DSH_SLEEP_HOME:home,DSH_HOME:dsh,DSH_SLEEP_CONFIG:join(home,'config.json'),DSH_SLEEP_SCOPE:'demo'};
  const run=(script,args=[])=>spawnSync(process.execPath,[join(root,script),...args],{env,encoding:'utf8'});
  const cli=(...args)=>{const r=run('bin/sleep.mjs',args);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
  return {dir,home,dsh,env,run,cli};
}
test('CLI archive survives processes; read-only skill helper retrieves originals',t=>{
  const {cli,run}=setup(t);cli('init');assert.equal(cli('ingest','demo',join(root,'examples/events.jsonl')).inserted,3);
  const results=cli('search','demo','Aurora');assert.equal(results.length,2);
  assert.equal(cli('sleep','demo').processed,3);assert.equal(cli('status','demo').pending,0);
  const helper=run('skills/sleep-memory/scripts/recall.mjs',['search','Aurora']);assert.equal(helper.status,0,helper.stderr);
  assert.equal(JSON.parse(helper.stdout).length,2);
  assert.equal(run('skills/sleep-memory/scripts/recall.mjs',['forget',results[0].id]).status,1);
  cli('forget','demo',results[0].id);assert.equal(cli('read','demo',results[0].id),null);
});
test('installer upgrade preserves config and database; paths with spaces work',t=>{
  const {home,dsh,run,cli,env}=setup(t);
  let r=run('bin/install.mjs');assert.equal(r.status,0,r.stderr);
  const config=join(home,'config.json');const custom={enabled:false,sessionScopes:{private:'demo'}};
  writeFileSync(config,JSON.stringify(custom));cli('ingest','demo',join(root,'examples/events.jsonl'));
  r=run('bin/install.mjs');assert.equal(r.status,0,r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(config,'utf8')),custom);assert.equal(cli('status','demo').events,3);
  const helper=join(dsh,'skills','sleep-memory','scripts','recall.mjs');
  r=spawnSync(process.execPath,[helper,'search','Aurora'],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).length,2);assert.equal(existsSync(join(home,'app.previous')),false);
});
test('installer refuses to overwrite an unrelated skill before installing app',t=>{
  const {home,dsh,run}=setup(t);const skill=join(dsh,'skills','sleep-memory');mkdirSync(skill,{recursive:true});
  writeFileSync(join(skill,'SKILL.md'),'user custom content');
  const result=run('bin/install.mjs');assert.equal(result.status,1);
  assert.equal(readFileSync(join(skill,'SKILL.md'),'utf8'),'user custom content');
  assert.equal(existsSync(join(home,'app')),false);
});
