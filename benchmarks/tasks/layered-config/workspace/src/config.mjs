import { mergeLayers } from './merge.mjs';
export function loadConfig(defaults, environment = {}, overrides = {}) {
  const config = mergeLayers(defaults, environment, overrides);
  if (typeof config.endpoint !== 'string') throw new Error('endpoint must be a string');
  if (!Number.isInteger(config.retries) || config.retries < 0) throw new Error('retries must be nonnegative');
  return config;
}
