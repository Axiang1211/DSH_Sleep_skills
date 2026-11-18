// Exercise the native pressure hook on the same agent across both turns.
import assert from 'node:assert/strict';
import TokenMeter from '@deepseek-ai/dsh-token-meter';
import BasicCompaction from '@deepseek-ai/dsh-compaction-basic';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { MemoryStore } from '../src/memory.mjs';
import { ask, harness } from './dsh-harness.mjs';

const store = new MemoryStore(':memory:');
const runtime = await harness(store, { recallBytes: 512 });
try {
  const { ctx, adapter } = runtime;
  await ctx.plugin(TokenMeter);
  await ctx.plugin(BasicCompaction, {
    auto: true, thresholdRatio: 0.5, retainTokens: 0, headroomTokens: 256
  });
  const answer = '琥珀鯨-7319';
  const question = '海港計畫的驗收代號？';
  const first = '海港計畫的驗收代號是' + answer + '。';
  const agent = await ask(runtime, 'first', first + ' archive observation'.repeat(1000));
  const [original] = store.search('owner', question);
  assert.ok(original && store.read('owner', original.id).text.includes(answer));
  assert.ok(ctx.tokenMeter.measure(agent.session).totalTokens >= 4096, 'Fixture must exceed the pressure threshold');

  const before = adapter.requests.length;
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: question }] }));
  await agent.whenIdle();
  assert.ok(adapter.requests.length > before, 'Follow-up must reach the model');
  const request = adapter.requests.at(-1);
  const evidence = request.messages.filter(message => message.source?.kind === 'dsh-sleep-memory');
  const ordinary = request.messages.filter(message => message.source?.kind !== 'dsh-sleep-memory');
  assert.ok(ordinary.some(message => message.source?.kind === 'compact-checkpoint'), 'Native checkpoint missing');
  assert.ok(ordinary.some(message => message.source?.kind === 'user' &&
    message.content.some(block => block.text === question)), 'Follow-up question missing');
  assert.ok(!JSON.stringify(ordinary).includes(answer), 'Original answer survived outside recall');
  assert.equal(evidence.length, 1);
  const text = evidence[0].content[0].text;
  const rows = text.split('\n').slice(1).filter(Boolean).map(line => JSON.parse(line));
  assert.ok(rows.some(row => row.id === original.id && row.excerpt?.includes(answer)));
  assert.ok(Buffer.byteLength(text) <= 512);
  const status = await ctx.tools.get('sleep_status', agent).execute({}, { agent });
  assert.equal(status.sessionCompaction.completed, 1);
  assert.equal(status.sessionCompaction.failed, 0);
  assert.ok(Number.isSafeInteger(status.sessionCompaction.lastEndSeq));
  console.log(JSON.stringify({ passed: true, session: agent.id, nativeCheckpoint: true,
    originalEvent: original.id, evidenceBytes: Buffer.byteLength(text) }, null, 2));
} finally {
  await runtime.ctx.fiber.dispose();
  store.close();
}
