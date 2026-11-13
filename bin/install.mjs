#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { assertRuntime } from '../src/runtime.mjs';
import { homeDir, configFile, validateConfig } from '../src/config.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function install({source=root,target=join(homeDir(),'app'),skillTarget=join(process.env.DSH_HOME||join(homedir(),'.dsh'),'skills','sleep-memory')}={}) {
  assertRuntime();
  if(resolve(source)===resolve(target))throw new Error('Run the installer from a newly extracted download, outside the installed app');
  // Stage both trees before swapping. Config and DB are outside the app tree.
  const staging=target+'.staging-'+process.pid,backup=target+'.previous';
  const skillStaging=skillTarget+'.staging-'+process.pid,skillBackup=skillTarget+'.previous';
  const marker=join(skillTarget,'.dsh-sleep-owned');
  if(existsSync(skillTarget)&&!existsSync(marker))throw new Error('Existing sleep-memory skill is not owned by this installer');
  if([staging,backup,skillStaging,skillBackup].some(p=>existsSync(p)))throw new Error('Previous install staging/backup exists; inspect it before retrying');
  let moved=false,installed=false,skillMoved=false,skillInstalled=false;
  try {
    mkdirSync(staging,{recursive:true,mode:0o700});
    for(const item of ['package.json','src','bin','skills','cordis.patch.yml','README.md','LICENSE','docs','examples'])
      cpSync(join(source,item),join(staging,item),{recursive:true});
    mkdirSync(dirname(skillStaging),{recursive:true});
    cpSync(join(staging,'skills','sleep-memory'),skillStaging,{recursive:true});
    writeFileSync(join(skillStaging,'.dsh-sleep-owned'),'DSH_Sleep_skills\n');
    writeFileSync(join(skillStaging,'app-location.json'),JSON.stringify({cli:join(target,'bin','sleep.mjs')})+'\n');
    const config=configFile();mkdirSync(dirname(config),{recursive:true,mode:0o700});
    if(!existsSync(config))writeFileSync(config,JSON.stringify(validateConfig(),null,2)+'\n',{flag:'wx',mode:0o600});
    if(existsSync(target)){renameSync(target,backup);moved=true;}
    renameSync(staging,target);installed=true;
    if(existsSync(skillTarget)){renameSync(skillTarget,skillBackup);skillMoved=true;}
    renameSync(skillStaging,skillTarget);skillInstalled=true;
  } catch(error) {
    if(skillInstalled)rmSync(skillTarget,{recursive:true,force:true});
    if(skillMoved)renameSync(skillBackup,skillTarget);
    if(installed)rmSync(target,{recursive:true,force:true});
    if(moved)renameSync(backup,target);
    rmSync(staging,{recursive:true,force:true});rmSync(skillStaging,{recursive:true,force:true});throw error;
  }
  // Failure to clean an old tree must not roll back a successful installation.
  for(const old of [backup,skillBackup])try{rmSync(old,{recursive:true,force:true});}catch{console.warn('Previous install retained at '+old);}
  return {installed:true,app:target,skill:skillTarget,config:configFile(),
    next:`node "${join(target,'bin','sleep.mjs')}" doctor`,
    dshPlugin:`dsh plugin --profile desktop add "link:${target}"`,
    note:'Plugin registration is a separate step; configure exact sessionScopes and enabled=true. No account/model credentials were changed.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{console.log(JSON.stringify(install(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
