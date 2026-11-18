import { mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,openSync,closeSync,existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { configFile,validateConfig } from './config.mjs';
import { scopeName } from './text.mjs';

export function editConfig(action,args=[],file=configFile()) {
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const lock=file+'.lock';let fd;
  try{fd=openSync(lock,'wx',0o600);}catch{throw new Error('Configuration is locked; finish the other edit or inspect the stale .lock file.');}
  const temp=file+'.tmp-'+randomUUID();let backup;
  try{
    const previous=existsSync(file)?readFileSync(file,'utf8'):null;
    const config=validateConfig(previous===null?{}:JSON.parse(previous));
    if(action==='bind'){
      if(args.length!==2)throw new Error('Usage: config bind <session-id> <scope>');
      const [session,scope]=args;scopeName(session);scopeName(scope);
      config.sessionScopes={...config.sessionScopes,[session]:scope};
    }else if(action==='unbind'){
      if(args.length!==1)throw new Error('Usage: config unbind <session-id>');
      scopeName(args[0]);delete config.sessionScopes[args[0]];
      if(Object.keys(config.sessionScopes).length===0)config.enabled=false;
    }else if(action==='enable'||action==='disable'){
      if(args.length)throw new Error('No additional arguments expected');
      if(action==='enable'&&!Object.keys(config.sessionScopes).length)throw new Error('Bind at least one exact session ID before enabling recording');
      config.enabled=action==='enable';
    }else throw new Error('Use config bind, unbind, enable or disable');
    validateConfig(config);
    writeFileSync(temp,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
    if(previous!==null){backup=file+'.backup-'+randomUUID();writeFileSync(backup,previous,{flag:'wx',mode:0o600});}
    renameSync(temp,file);
    return {config:file,backup,enabled:config.enabled,sessionScopes:config.sessionScopes,
      note:'Reload the DSH profile for changes to take effect. Existing memory is retained.'};
  }finally{if(existsSync(temp))unlinkSync(temp);closeSync(fd);unlinkSync(lock);}
}
