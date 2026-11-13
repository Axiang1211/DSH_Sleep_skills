import { createHash } from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const json = value => JSON.stringify(value);
export function requireText(value, name, max = 65536) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > max)
    throw new Error(`${name} must be non-empty text, at most ${max} UTF-8 bytes`);
  return value;
}
export function scopeName(value) {
  if (typeof value !== 'string' || !/^[\w:.-]{1,160}$/.test(value)) throw new Error('Invalid scope');
  return value;
}
// This is a best-effort filter, NOT a guarantee that all personal data is removed.
export function redact(text) {
  return text.replace(/\b(?:sk|ghp|github_pat)-?[A-Za-z0-9_]{20,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(Bearer)\s+[^\s"']+/gi, '$1 [REDACTED]')
    .replace(/\b(api[_-]?key|password|passwd|secret|SESSDATA|bili_jct|authorization|cookie)\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi, '$1=[REDACTED]');
}
// unicode61 does not segment Chinese. Index Han unigrams/bigrams alongside words.
export function terms(text) {
  const normalized = text.normalize('NFKC').toLowerCase();
  const out = normalized.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  for (const run of normalized.match(/\p{Script=Han}+/gu) ?? []) {
    const chars = [...run];
    out.push(...chars);
    for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
  }
  return [...new Set(out)];
}
export function ftsQuery(text) {
  return terms(text).slice(0, 80).map(word => `"${word.replaceAll('"', '""')}"`).join(' OR ');
}
export function utf8Prefix(text, bytes) {
  let out = '', used = 0;
  for (const ch of text) { const n = Buffer.byteLength(ch); if (used + n > bytes) break; out += ch; used += n; }
  return out;
}
export function chunkText(text, maxBytes = 24000) {
  const chunks = []; let part = '', used = 0;
  for (const ch of text) {
    const n = Buffer.byteLength(ch);
    if (used + n > maxBytes) { chunks.push(part); part = ''; used = 0; }
    part += ch; used += n;
  }
  if (part) chunks.push(part);
  return chunks;
}
