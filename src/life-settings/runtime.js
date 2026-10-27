/**
 * Runtime reader/proof channel. Import has no I/O or model/network side effect.
 * Producer evidence is not an LLM self-report and is never synthesized by manager.apply().
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PARAMETERS, getPath, setPath, validateValue } from './catalog.js';
import { scopePaths, readState, readJson, atomicWrite } from './file-store.js';
import { budgetSnapshot } from './budget.js';

const instanceId = randomUUID();
export const parametersForDomain = (domain) => PARAMETERS.filter((p) => p.domain === domain);
export function settingsRevision(options = {}) {
  return readState(scopePaths(options)).revision;
}
export function applyManagedSettings(config, domain, options = {}) {
  const state = readState(scopePaths(options));
  const out = structuredClone(config);
  for (const p of parametersForDomain(domain)) {
    if (Object.hasOwn(state.overrides, p.id)) setPath(out, p.path, state.overrides[p.id]);
  }
  return out;
}
export function extractManagedValues(config, domain) {
  const out = {};
  for (const p of parametersForDomain(domain)) {
    const value = getPath(config, p.path);
    if (value !== undefined) out[p.id] = structuredClone(value);
  }
  return out;
}
export function publishRuntimeEvidence(producer, snapshot, options = {}) {
  if (!['qq','bili'].includes(producer)) throw new Error('UNKNOWN_PRODUCER');
  const paths = scopePaths(options);
  const revision = snapshot.revision ?? settingsRevision(options);
  const values = {};
  for (const p of PARAMETERS.filter((p) => p.evidenceProducer === producer)) {
    if (Object.hasOwn(snapshot.values || {}, p.id)) {
      validateValue(p, snapshot.values[p.id]);
      values[p.id] = structuredClone(snapshot.values[p.id]);
    }
  }
  const evidence = {
    schema: 1, scopeId: paths.scopeId, producer, instanceId, pid: process.pid,
    revision, observedAt: new Date().toISOString(), values,
    details: snapshot.details || {},
  };
  atomicWrite(path.join(paths.runtime, producer + '.json'), evidence);
  return evidence;
}
export function readRuntimeEvidence(producer, options = {}) {
  const paths = scopePaths(options);
  const value = readJson(path.join(paths.runtime, producer + '.json'), null);
  if (!value) return { valid: false, status: 'not-observed', producer };
  const ageMs = Date.now() - Date.parse(value.observedAt);
  let alive = false;
  if (Number.isInteger(value.pid) && value.pid > 0) {
    try { process.kill(value.pid, 0); alive = true; } catch {}
  }
  const valid = value.schema === 1 && value.producer === producer && value.scopeId === paths.scopeId &&
    ageMs >= -2000 && ageMs <= (options.maxAgeMs ?? 90000) && alive && value.details?.running !== false;
  return {
    ...value, valid, ageMs,
    status: valid ? (value.details?.mode === 'local-simulation' ? 'local-simulation' : 'runtime-observed') : 'stale-or-inactive',
    source: path.join(paths.runtime, producer + '.json'),
  };
}
export function compactLifeState({ platform, wakeReason } = {}, options = {}) {
  try {
    const paths = scopePaths(options);
    const state = readState(paths);
    const evidence = readRuntimeEvidence(platform === 'bili' ? 'bili' : 'qq', options);
    const pending = state.history.filter((h) => h.revision === state.revision).flatMap((h) => h.changes)
      .filter((c) => !evidence.valid || evidence.revision !== state.revision || JSON.stringify(evidence.values?.[c.id]) !== JSON.stringify(c.after));
    const recent = state.history.at(-1);
    const next = evidence.details?.nextWakeAt ?? evidence.details?.nextFireAt ?? null;
    const budget=budgetSnapshot(options);
    const platformBudget=budget.scopes[platform==='bili'?'bili':'qq'];
    return '\n【生活状态｜系统事实】' + new Date().toISOString() +
      '；时区=' + Intl.DateTimeFormat().resolvedOptions().timeZone +
      '；平台=' + String(platform || 'unknown') +
      '；醒来原因=' + String(wakeReason || '调用方未提供').replace(/[\r\n]/g, ' ').slice(0, 90) +
      '；设置=r' + state.revision + '；运行证据=' + evidence.status +
      '；下一次计划=' + (next ? String(next).slice(0, 40) : '未知/按各会话计划') +
      '；最近活动='+(evidence.details?.lastActivityAt || evidence.details?.lastWakeAt || '未知') +
      '；本地预算余量='+(budget.stale?'用量过期/未知':JSON.stringify(platformBudget.remaining))+
      '；最新修改=' + (recent ? recent.id : '无') + '；待验=' + pending.length +
      '。模型思考实际 wire、平台入账与缓存命中未知时不推定。按需调用 life_state / life_catalog；默认不代表你的偏好。';
  } catch {
    return '\n【生活状态｜系统事实】设置或运行证据暂不可读，未将保存值当作生效值；请调用 life_state 查看。';
  }
}
