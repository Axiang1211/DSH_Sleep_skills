import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { MemoryStore } from './memory.mjs';
import { sleepCycle } from './sleep.mjs';

// Exercise a fresh on-disk archive. A model, when requested, sees only this fixture.
export async function verifyInstallation(model) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-sleep-verify-'));
  const database = join(directory, 'memory.sqlite');
  const code = String(randomInt(100000, 1000000));
  let store;
  try {
    store = new MemoryStore(database);
    const source = store.ingest({ scope: 'verify', sourceKey: 'decision', source: 'fixture://decision',
      text: 'The Aurora handover code is ' + code + '.' });
    await sleepCycle(store, 'verify');
    store.close();
    store = null;
    store = new MemoryStore(database);
    const recall = store.context('verify', 'Aurora handover code', { maxBytes: 512 });
    if (!recall.ids.includes(source.id) || !recall.text.includes(code)) throw new Error('Reopened archive lost the fixture');
    if (store.context('other', 'Aurora').ids.length) throw new Error('Scope isolation check failed');
    if (model) {
      const reply = await model.complete([
        { role: 'system', content: 'Answer the question using the supplied historical evidence. Copy the six-digit number from the source excerpt. Return only the number.' },
        { role: 'user', content: recall.text + '\nWhat is the Aurora handover code?' }
      ], { maxTokens: 128 });
      if (!reply.match(/\b[0-9]{6}\b/g)?.includes(code)) throw new Error('Model response did not contain the synthetic handover code');
    }
    return { ok: true, archiveReopened: true, scopeIsolation: true, evidenceBytes: recall.bytes,
      modelAnswer: model ? 'matched random handover code' : 'not requested' };
  } finally {
    try { store?.close(); } finally { rmSync(directory, { recursive: true, force: true }); }
  }
}
