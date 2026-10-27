// Real bridge functions + controlled settings adapter. No account/model/network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { bridgeHarness } from './audit-bridge-harness.mjs';
import { createQqLifeRuntime } from '../src/life-settings/qq-runtime.js';
import { scopePaths, emptyState, atomicWrite } from '../src/life-settings/file-store.js';
import { readRuntimeEvidence } from '../src/life-settings/runtime.js';

function fixtureSettings(initial = {}) {
  let revision = 0;
  let overrides = { ...initial };
  const reports = [];
  const adapters = {
    revision: () => revision,
    apply: (base) => {
      const next = structuredClone(base);
      for (const [id, value] of Object.entries(overrides)) {
        const keys = (id.startsWith('qq.') ? id.slice(3) : id).split('.');
        let target = next;
        for (const key of keys.slice(0, -1)) target = target[key] ??= {};
        target[keys.at(-1)] = value;
      }
      return next;
    },
    publish: (producer, report) => reports.push({ producer, ...report }),
    board: ({ platform, wakeReason }) => `【生活参数状态】平台=${platform}；原因=${wakeReason}；受控测试运行时证据。`,
  };
  return { adapters, reports, change(next) { overrides = { ...next }; revision += 1; } };
}

let passed = 0;
async function test(name, run) {
  await run();
  passed += 1;
  console.log('PASS', name);
}

await test('startup adopts saved purpose/wake settings before initial schedules', async () => {
  const managed = fixtureSettings({ 'purpose.enabled': false, 'qq.socialV2.wake.recommendedProbability': 0.2 });
  const h = await bridgeHarness({ lifeRuntime: managed.adapters });
  try {
    assert.equal(h.cfg.purpose.enabled, false);
    assert.equal(h.defaultWakeConfigV2().triggers.probability, 0.2);
    assert.equal(managed.reports.at(-1).values['purpose.enabled'], false);
    assert.equal(h.calls.created.length, 0);
    assert.equal(h.calls.prompts.length, 0);
  } finally { await h.close(); }
});

await test('hot adoption refreshes defaults and preserves explicit agent decisions', async () => {
  const managed = fixtureSettings();
  const h = await bridgeHarness({ lifeRuntime: managed.adapters });
  try {
    h.setMode('reserved2');
    const defaults = h.getSocialV2State('group:456');
    const explicit = h.getSocialV2State('private:123');
    explicit.wakeConfig.confirmedBy = 'agent';
    explicit.wakeConfig.triggers.probability = 0.91;
    managed.change({ 'qq.socialV2.wake.recommendedProbability': 0.3 });
    assert.equal(h.lifeSettings.refresh().changed, true);
    assert.equal(defaults.wakeConfig.triggers.probability, 0.3);
    assert.equal(explicit.wakeConfig.triggers.probability, 0.91);
    const report = managed.reports.at(-1);
    assert.equal(report.values['qq.socialV2.wake.recommendedProbability'], 0.3);
    assert.equal(report.details.explicitWakeChoices, 1);
    assert.match(report.details.scheduleEffect, /Existing/);
    assert.equal(h.calls.prompts.length, 0);
  } finally { await h.close(); }
});

await test('default probability adoption preserves an existing finite sleep timer', async () => {
  const managed = fixtureSettings();
  const h = await bridgeHarness({ lifeRuntime: managed.adapters, config: { socialV2: { wake: { recommendedDefaultInfinite: false } } } });
  try {
    h.setMode('reserved2');
    const st = h.getSocialV2State('group:456');
    assert.equal(st.wakeConfig.confirmedBy, 'default');
    const until = st.wakeConfig.sleepUntil;
    const timer = st.sleepTimer;
    assert.ok(timer);
    managed.change({ 'qq.socialV2.wake.recommendedProbability': 0.4 });
    h.lifeSettings.refresh();
    assert.equal(st.wakeConfig.triggers.probability, 0.4);
    assert.equal(st.wakeConfig.sleepUntil, until);
    assert.equal(st.sleepTimer, timer);
  } finally { await h.close(); }
});

await test('rollback restores fresh baseline without replacing unrelated runtime state', async () => {
  const managed = fixtureSettings({ 'qq.socialV2.autoReplyCheckMs': 45000 });
  const h = await bridgeHarness({ lifeRuntime: managed.adapters });
  try {
    assert.equal(h.cfg.socialV2.autoReplyCheckMs, 45000);
    h.cfg.dsh.model = 'runtime-selected-model';
    managed.change({});
    h.lifeSettings.refresh();
    assert.equal(h.cfg.socialV2.autoReplyCheckMs, 30000);
    assert.equal(h.cfg.dsh.model, 'runtime-selected-model');
  } finally { await h.close(); }
});

await test('disabling proactive stops opportunity timers without touching explicit sleep', async () => {
  const managed = fixtureSettings();
  const h = await bridgeHarness({ lifeRuntime: managed.adapters });
  try {
    h.setMode('reserved2');
    const st = h.getSocialV2State('group:456');
    h.scheduleProactiveCheckV2('group:456');
    assert.ok(st.proactiveTimer);
    st.wakeConfig.confirmedBy = 'agent';
    st.wakeConfig.sleepUntil = new Date(Date.now() + 3600000).toISOString();
    const sleepUntil = st.wakeConfig.sleepUntil;
    managed.change({ 'qq.socialV2.proactive.enabled': false });
    h.lifeSettings.refresh();
    assert.equal(st.proactiveTimer, null);
    assert.equal(st.wakeConfig.sleepUntil, sleepUntil);
    assert.equal(h.calls.prompts.length, 0);
  } finally { await h.close(); }
});

await test('interval adoption retains pending timers and reports that boundary', async () => {
  const managed = fixtureSettings();
  const h = await bridgeHarness({ lifeRuntime: managed.adapters });
  try {
    h.setMode('reserved2');
    const st = h.getSocialV2State('group:456');
    h.scheduleReplyCheckV2('group:456');
    const timer = st.replyCheckTimer;
    assert.ok(timer);
    managed.change({ 'qq.socialV2.autoReplyCheckMs': 90000 });
    h.lifeSettings.refresh();
    assert.equal(h.cfg.socialV2.autoReplyCheckMs, 90000);
    assert.equal(st.replyCheckTimer, timer);
    assert.ok(managed.reports.at(-1).details.pendingReplyTimers >= 1);
  } finally { await h.close(); }
});

await test('new prompt receives one tail state block with no extra model wake', async () => {
  const managed = fixtureSettings();
  const h = await bridgeHarness({ lifeRuntime: managed.adapters });
  try {
    await h.deliverPrompt('private:123', 'first user input');
    assert.equal(h.calls.prompts.length, 1);
    const first = h.calls.prompts[0].content[0].text;
    assert.ok(first.indexOf('first user input') < first.indexOf('【生活参数状态】'));
    assert.equal((first.match(/【生活参数状态】/g) || []).length, 1);
    const created = h.calls.created.length;
    await h.deliverPrompt('private:123', 'second user input');
    assert.equal(h.calls.prompts.length, 2);
    assert.equal(h.calls.created.length, created);
    assert.ok(managed.reports.at(-1).details.lastWake.at);
    assert.equal(managed.reports.at(-1).details.model.wireVerified, false);
  } finally { await h.close(); }
});

await test('bad state preserves previous in-memory values and does not claim adoption', () => {
  let revision = 1;
  let broken = false;
  const reports = [];
  const config = { purpose: { gapMinMs: 600000 } };
  const controller = createQqLifeRuntime({
    config, loadBaseConfig: () => ({ purpose: { gapMinMs: 600000 } }),
    revision: () => revision,
    apply: (value) => { if (broken) throw new Error('private diagnostic'); return value; },
    extract: (value) => ({ 'purpose.gapMinMs': value.purpose.gapMinMs }),
    publish: (_, report) => reports.push(report),
  });
  controller.refresh();
  revision = 2;
  broken = true;
  const result = controller.refresh();
  assert.equal(result.changed, false);
  assert.equal(result.revision, 1);
  assert.equal(config.purpose.gapMinMs, 600000);
  assert.equal(reports.at(-1).revision, 1);
  assert.equal(reports.at(-1).details.adoptionError, 'life-settings-unavailable');
});

await test('concurrent revision movement cannot receive a false effective stamp', () => {
  let revision = 1;
  const config = { purpose: { gapMinMs: 600000 } };
  const controller = createQqLifeRuntime({
    config, loadBaseConfig: () => ({ purpose: { gapMinMs: 600000 } }),
    revision: () => revision,
    apply: () => { revision += 1; return { purpose: { gapMinMs: 900000 } }; },
    extract: (value) => ({ 'purpose.gapMinMs': value.purpose.gapMinMs }),
    publish: () => { throw new Error('a raced value must not be published'); },
  });
  assert.equal(controller.refresh().retry, true);
  assert.equal(controller.revision, null);
  assert.equal(config.purpose.gapMinMs, 600000);
});

await test('QQ evidence cannot verify purpose settings consumed by the desktop carrier', () => {
  let report;
  const controller = createQqLifeRuntime({
    config: { purpose: { enabled: true }, socialV2: { autoReplyCheckMs: 30000 } },
    loadBaseConfig: () => ({ purpose: { enabled: true }, socialV2: { autoReplyCheckMs: 30000 } }),
    revision: () => 0,
    apply: (value) => value,
    getDetails: () => ({ purposeCarrier: 'pet' }),
    publish: (_, value) => { report = value; },
  });
  controller.refresh();
  assert.equal(Object.hasOwn(report.values, 'purpose.enabled'), false);
  assert.equal(report.values['qq.socialV2.autoReplyCheckMs'], 30000);
});

await test('real sidecar adoption and rollback produce process-scoped runtime evidence', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'surfcore-life-qq-proof-'));
  const scope = { root: temp, dshHome: path.join(temp, 'dsh') };
  const paths = scopePaths(scope);
  try {
    const base = { socialV2: { autoReplyCheckMs: 30000 }, purpose: { enabled: true } };
    atomicWrite(paths.qq, base);
    const state = emptyState(paths);
    state.revision = 1;
    state.overrides = { 'qq.socialV2.autoReplyCheckMs': 45000, 'purpose.enabled': false };
    atomicWrite(paths.state, state);
    const config = structuredClone(base);
    const controller = createQqLifeRuntime({
      config, scope,
      loadBaseConfig: () => JSON.parse(fs.readFileSync(paths.qq, 'utf8')),
      getDetails: () => ({ mode: 'local-simulation' }),
    });
    controller.refresh();
    assert.equal(config.socialV2.autoReplyCheckMs, 45000);
    assert.equal(config.purpose.enabled, false);
    const adopted = readRuntimeEvidence('qq', scope);
    assert.equal(adopted.valid, true);
    assert.equal(adopted.status, 'local-simulation');
    assert.equal(adopted.revision, 1);
    assert.equal(adopted.values['qq.socialV2.autoReplyCheckMs'], 45000);
    // A legacy console update cannot silently supersede a persisted override.
    config.socialV2.autoReplyCheckMs = 99000;
    controller.refresh();
    assert.equal(config.socialV2.autoReplyCheckMs, 45000);
    state.revision = 2;
    state.overrides = {};
    atomicWrite(paths.state, state);
    controller.refresh();
    assert.equal(config.socialV2.autoReplyCheckMs, 30000);
    assert.equal(config.purpose.enabled, true);
    assert.equal(readRuntimeEvidence('qq', scope).revision, 2);
  } finally {
    const resolved = path.resolve(temp);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith('surfcore-life-qq-proof-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

console.log(`QQ lifecycle runtime: ${passed} passed (isolated bridge VM / controlled settings adapters).`);
