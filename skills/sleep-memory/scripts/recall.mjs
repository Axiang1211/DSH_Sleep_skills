#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const [command,...args]=process.argv.slice(2);
if(!['search','context','read','status'].includes(command)){
  console.error('Only search, context, read and status are exposed');process.exit(1);
}
const scope=process.env.DSH_SLEEP_SCOPE;
if(!scope||!/^[-\w:.]{1,160}$/.test(scope)){
  console.error('Set DSH_SLEEP_SCOPE in trusted local launch configuration first');process.exit(1);
}
const here=dirname(fileURLToPath(import.meta.url));
const location=join(here,'..','app-location.json');
const candidates=[
  ...(existsSync(location)?[JSON.parse(readFileSync(location,'utf8')).cli]:[]),
  resolve(here,'../../../bin/sleep.mjs'),
  join(process.env.DSH_SLEEP_HOME||join(homedir(),'.dsh-sleep'),'app','bin','sleep.mjs')
];
const cli=candidates.find(p=>typeof p==='string'&&existsSync(p));
if(!cli){console.error('DSH Sleep app is not installed; see repository README');process.exit(1);}
const result=spawnSync(process.execPath,[cli,command,scope,...args],{stdio:'inherit',shell:false});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
