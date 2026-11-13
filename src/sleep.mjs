import { utf8Prefix } from './text.mjs';

export async function sleepCycle(store, scope, { model, limit = 20, maxBytes = 96000 } = {}) {
  const events = store.pending(scope, { limit, maxBytes });
  if (!events.length) return { processed: 0, memories: [], mode: model ? 'model' : 'extractive' };
  let proposals;
  if (model) {
    proposals = await model.propose(events);
    if (!Array.isArray(proposals) || proposals.length === 0) throw new Error('Model returned no proposals; sources remain pending');
  } else {
    proposals = events.map(e => {
      const quote = utf8Prefix(e.text, 2000);
      return { eventId: e.id, quote, body: quote };
    });
  }
  const memories = store.consolidate(scope, proposals, events.map(e => e.id), model ? 'model' : 'extractive');
  return { processed: new Set(proposals.map(p=>p.eventId)).size, memories, mode: model ? 'model' : 'extractive',
    note: model ? 'Model summaries are candidates requiring review; raw evidence remains searchable.' : 'Extractive checkpoints only; no training or semantic synthesis.' };
}
