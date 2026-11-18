import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDshApi } from '../src/dsh-api.mjs';
test('DSH diagnostics distinguish unavailable modules from incompatible factories',async()=>{
  await assert.rejects(loadDshApi(async()=>{throw new Error('module not found');}),/unavailable/);
  await assert.rejects(loadDshApi(async()=>({})),/Unsupported DSH module API/);
  await assert.rejects(loadDshApi(async()=>({defineTool:x=>x,createUserMessage:x=>x})),/Unsupported DSH tool\/message/);
  const api=await loadDshApi(async()=>({defineTool:x=>x,createUserMessage:x=>({...x,id:'fixture',role:'user'})}));
  assert.equal(typeof api.defineTool,'function');
});
