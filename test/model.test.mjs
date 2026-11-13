import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatCompletionsModel } from '../src/model.mjs';
const config={baseUrl:'http://127.0.0.1:1234/v1',model:'test'};
test('remote calls require explicit HTTPS opt-in and reject URL credentials',()=>{
  for(const baseUrl of ['https://provider.example/v1','http://provider.example/v1','http://user:pass@localhost/v1'])
    assert.throws(()=>new ChatCompletionsModel({...config,baseUrl}));
  assert.doesNotThrow(()=>new ChatCompletionsModel({...config,baseUrl:'https://provider.example/v1',allowRemote:true}));
});
test('client sends evidence as data and parses a proposal without network',async()=>{
  let sent;const client=new ChatCompletionsModel(config,async(url,options)=>{
    sent={url:String(url),...options};return Response.json({choices:[{message:{content:'```json\n{"proposals":[{"eventId":"e1","quote":"hello","body":"hi"}]}\n```'}}]});
  });
  const result=await client.propose([{id:'e1',text:'hello'}]);assert.equal(result[0].quote,'hello');
  assert.equal(sent.url,'http://127.0.0.1:1234/v1/chat/completions');assert.equal(sent.redirect,'error');
  assert.equal(JSON.parse(sent.body).messages[1].role,'user');
});
test('HTTP failures and oversized / malformed responses fail closed',async()=>{
  for(const response of [new Response('provider-secret',{status:500}),new Response('bad json'),Response.json({choices:[]}),new Response('x',{headers:{'content-length':'1000001'}}),new Response('x'.repeat(1000001))]){
    const client=new ChatCompletionsModel(config,async()=>response);
    await assert.rejects(client.propose([]),error=>!error.message.includes('provider-secret'));
  }
});
