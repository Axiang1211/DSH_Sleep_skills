// Mount the actual package entry. Cordis validates apply's return as an effect.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as plugin from '../src/dsh-plugin.mjs';
import { MemoryStore } from '../src/memory.mjs';
import { harness, ask } from './dsh-harness.mjs';

const temporary = mkdtempSync(join(tmpdir(), 'dsh-public-'));
process.env.DSH_SLEEP_HOME = temporary;
process.env.DSH_SLEEP_CONFIG = join(temporary, 'config.json');
writeFileSync(process.env.DSH_SLEEP_CONFIG, JSON.stringify({
  enabled: true, sessionScopes: { launch: 'demo' }
}));
const fixture = new MemoryStore(':memory:');
let runtime;
try {
  runtime = await harness(fixture);
  await runtime.fork.dispose();
  const fork = await runtime.ctx.plugin(plugin);
  const agent = await ask(runtime, 'launch', 'Public entry activation fixture');
  const status = runtime.ctx.tools.get('sleep_status', agent);
  assert.ok(status, 'Public plugin must register tools');
  assert.equal((await status.execute({}, { agent })).events, 2);
  await fork.dispose();
  assert.equal(runtime.ctx.tools.get('sleep_status', agent), undefined);
  console.log('Public package entry activated, archived and unloaded.');
} finally {
  if (runtime) await runtime.ctx.fiber.dispose();
  fixture.close();
  rmSync(temporary, { recursive: true, force: true });
}
