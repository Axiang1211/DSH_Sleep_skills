import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { scopeName } from './text.mjs';

export const homeDir = () => resolve(process.env.DSH_SLEEP_HOME || join(homedir(), '.dsh-sleep'));
export const configFile = () => resolve(process.env.DSH_SLEEP_CONFIG || join(homeDir(), 'config.json'));
export function validateConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration must be an object');
  const config = { enabled: false, sessionScopes: {}, captureToolResults: false, recallBytes: 12000,
    sleepIntervalSeconds: 300, sleepAfterEvents: 100, mode: 'extractive', ...input };
  for (const flag of ['enabled', 'captureToolResults']) if (typeof config[flag] !== 'boolean') throw new Error(`Invalid ${flag}`);
  if (!['extractive', 'model'].includes(config.mode)) throw new Error('mode must be extractive or model');
  if (!config.sessionScopes || typeof config.sessionScopes !== 'object' || Array.isArray(config.sessionScopes)) throw new Error('sessionScopes must be a map');
  for (const [session, scope] of Object.entries(config.sessionScopes)) { scopeName(session); scopeName(scope); }
  for (const [key, min, max] of [['recallBytes', 256, 64000], ['sleepIntervalSeconds', 60, 86400], ['sleepAfterEvents', 1, 10000]])
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`Invalid ${key}`);
  if (config.mode === 'model' && !config.model) throw new Error('model configuration is required');
  return config;
}
export function loadConfig() {
  const file = configFile();
  return validateConfig(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
}
