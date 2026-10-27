/**
 * QQ's hot-adoption boundary. Only catalogued lifecycle fields are copied into
 * the long-lived bridge config; identity, credentials and account rights stay put.
 * Existing per-conversation choices and already scheduled timers are independent.
 */
import {
  applyManagedSettings, extractManagedValues, settingsRevision,
  publishRuntimeEvidence, compactLifeState,
} from './runtime.js';

function configPath(id) {
  if (id.startsWith('qq.')) return id.slice(3).split('.');
  if (id.startsWith('purpose.')) return id.split('.');
  return null;
}

function assignField(config, keys, value) {
  let target = config;
  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  }
  target[keys.at(-1)] = structuredClone(value);
}

export function createQqLifeRuntime({
  config, loadBaseConfig, getDetails = () => ({}), onAdopt = () => {},
  apply = applyManagedSettings, extract = extractManagedValues,
  revision = settingsRevision, publish = publishRuntimeEvidence,
  board = compactLifeState, scope = {},
} = {}) {
  let adoptedRevision = null;
  let lastError = null;

  function refresh({ publish: shouldPublish = true } = {}) {
    let changed = false;
    try {
      const before = revision(scope);
      {
        // Re-apply persisted overrides even at the same revision: a legacy
        // console endpoint may have changed the long-lived config in memory.
        // A new revision (including rollback) starts from a fresh base file.
        const next = apply(before !== adoptedRevision ? loadBaseConfig() : config, 'qq', scope);
        const values = extract(next, 'qq');
        if (revision(scope) !== before) {
          // Never label values read from another revision as adopted.
          return { changed: false, revision: adoptedRevision, retry: true };
        }
        const previousValues = extract(config, 'qq');
        const changedIds = Object.keys(values).filter((id) => JSON.stringify(values[id]) !== JSON.stringify(previousValues[id]));
        for (const [id, value] of Object.entries(values)) {
          const keys = configPath(id);
          if (keys && value !== undefined) assignField(config, keys, value);
        }
        changed = before !== adoptedRevision || changedIds.length > 0;
        const oldRevision = adoptedRevision;
        adoptedRevision = before;
        if (oldRevision !== before || changedIds.length > 0) onAdopt({ revision: adoptedRevision, values, previousValues, changedIds });
      }
      lastError = null;
    } catch (error) {
      // Preserve the last working in-memory settings. A corrupt/new revision is
      // not silently reported as adopted and cannot interrupt a queued reply.
      lastError = String(error?.code || 'life-settings-unavailable');
    }
    if (shouldPublish && adoptedRevision !== null) {
      try {
        const details = getDetails();
        const values = extract(config, 'qq');
        // Desktop-purpose is a separate consumer. Merely adopting a value in
        // this bridge cannot prove that the desktop carrier has used it.
        if (details.purposeCarrier === 'pet' || details.configuredPurposeCarrier === 'pet') {
          for (const id of Object.keys(values)) if (id.startsWith('purpose.')) delete values[id];
        }
        publish('qq', {
          revision: adoptedRevision,
          values,
          details: { ...details, adoptionError: lastError },
        }, scope);
      } catch {
        // Missing telemetry is observable as missing/stale evidence, never as a
        // successful settings change. It must not break existing QQ operation.
      }
    }
    return { changed, revision: adoptedRevision, error: lastError };
  }

  function stateBlock(wakeReason = 'conversation') {
    try { return String(board({ platform: 'qq', wakeReason }, scope) || ''); }
    catch { return '【生活参数状态】状态证据暂不可读；不要把已保存配置当成实际生效。'; }
  }

  return { refresh, stateBlock, get revision() { return adoptedRevision; } };
}
