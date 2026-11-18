// Run with npm run benchmark:window after installing development dependencies.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEncoding } from 'js-tiktoken';
import { MemoryStore } from '../src/memory.mjs';
import { ask, harness } from './dsh-harness.mjs';

const decisions = [
  { at: 0, name: '海港', fact: '海港的迎賓燈顏色定為孔雀藍。', query: '海港最後用什麼燈色？', answer: '孔雀藍' },
  { at: 256, name: '沉箱', fact: '逐頁核對航海紀錄。'.repeat(100) + '沉箱封條是琥珀色。', query: '沉箱封條', answer: '琥珀色' },
  { at: 512, name: 'Orchid', fact: 'Orchid rollout is scheduled for Thursday at sunrise.', query: 'When is the Orchid rollout?', answer: 'Thursday at sunrise' },
  { at: 1023, name: '白塔', fact: '白塔備用鑰匙放在三號抽屜。', query: '白塔的鑰匙放在哪？', answer: '三號抽屜' }
];
const budget = 384;
const tokenizer = getEncoding('cl100k_base');
const directory = mkdtempSync(join(tmpdir(), 'dsh-window-'));
const database = join(directory, 'memory.sqlite');
let store, runtime;

try {
  store = new MemoryStore(database);
  const scope = 'archive';
  const sessionScopes = { visitor: 'visitor', unknown: scope };
  for (const { at } of decisions) {
    sessionScopes['old' + at] = scope;
    sessionScopes['new' + at] = scope;
  }
  const config = { sessionScopes, recallBytes: budget };
  runtime = await harness(store, config);

  // Count each distinct filler text once. The corpus count is the sum of
  // separately encoded event bodies, excluding decisions and chat framing.
  const topics = ['rain','wind','cloud','fog','snow','storm','ice','sun'];
  const filler = topics.map((topic, index) => {
    const project = decisions[index % decisions.length].name;
    const text = project + ' 例行狀態更新。' + (' ' + topic).repeat(1024);
    return { text, tokens: tokenizer.encode(text).length };
  });
  let fillerTokens = 0;
  const expected = new Map();
  for (let i = 0; i < 1024; i++) {
    const decision = decisions.find(item => item.at === i);
    if (decision) {
      await ask(runtime, 'old' + i, decision.fact);
      const source = store.db.prepare(
        "SELECT id FROM events WHERE scope=? AND source LIKE ? AND kind='user' AND text=?"
      ).get(scope, 'dsh://old' + i + '/event/%', decision.fact);
      if (!source) throw new Error('Decision not archived at position ' + i);
      expected.set(i, source.id);
    }
    const sample = filler[i % filler.length];
    store.ingest({ scope, sourceKey: 'filler-' + i, source: 'fixture://journal/' + i, text: sample.text });
    fillerTokens += sample.tokens;
  }

  await runtime.ctx.fiber.dispose();
  runtime = null;
  store.close();
  store = null;
  store = new MemoryStore(database);
  runtime = await harness(store, config);

  async function evidence(session, query) {
    const index = runtime.adapter.requests.length;
    await ask(runtime, session, query);
    const messages = runtime.adapter.requests[index].messages;
    return messages.filter(message => message.source?.kind === 'dsh-sleep-memory')
      .flatMap(message => message.content.filter(block => block.type === 'text').map(block => block.text)).join('\n');
  }

  const results = [];
  for (const { at, query, answer } of decisions) {
    const recalled = await evidence('new' + at, query);
    const eventId = expected.get(at);
    const rows = recalled.split('\n').slice(1).filter(Boolean).map(line => JSON.parse(line));
    const hit = rows.some(row => row.id === eventId && row.excerpt?.includes(answer));
    results.push({ position: at, query, eventId, hit, evidenceBytes: Buffer.byteLength(recalled) });
  }
  const isolated = await evidence('visitor', decisions[0].query);
  const absent = await evidence('unknown', 'quasarneverrecorded');
  const passed = fillerTokens >= 1_000_000 && results.every(row => row.hit && row.evidenceBytes <= budget)
    && !isolated && !absent;
  console.log(JSON.stringify({ passed, tokenizer: 'cl100k_base', fillerTokens, fillerEvents: 1024,
    budgetBytes: budget, results, crossScopeEvidenceBytes: Buffer.byteLength(isolated),
    unknownQueryEvidenceBytes: Buffer.byteLength(absent) }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  try { if (runtime) await runtime.ctx.fiber.dispose(); }
  finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
