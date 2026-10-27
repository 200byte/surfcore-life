// Isolated runtime adoption: real planner/config files, mock DSH prompt only.
// No credentials, platform network, real sessions, or model calls.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import {
  nightSettingsFingerprint, reconcileNightPlanState, nightNotBeforeMinute, plannedWakeTime,
} from '../plugins/surfcore/lib/life-runtime.js'
import { scopePaths, emptyState, atomicWrite } from '../src/life-settings/file-store.js'
import { buildNightSchedule } from '../plugins/surfcore/tools/lib/night-schedule.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'surfcore-life-bili-'))
const root = path.join(temp, 'isolated-root')
const dshHome = path.join(temp, 'isolated-dsh')
process.env.DSH_HOME = dshHome
process.env.USERPROFILE = path.join(temp, 'unrelated-profile')
process.env.SURFCORE_ROOT = root
process.env.DSH_NODE = process.execPath
delete process.env.SURFCORE_BILI_CONFIG
fs.mkdirSync(path.join(root, 'src'), { recursive: true })
fs.writeFileSync(path.join(root, 'src', 'bridge.js'), '// fixture only\n')
fs.writeFileSync(path.join(root, 'config.json'), '{}\n')
const paths = scopePaths()
const stateFile = path.join(dshHome, 'surfcore', 'bili', 'whale-night.json')
const legacyFile = path.join(dshHome, 'surfcore', 'bili', 'whale-night.config.json')
const windows = [{ start: '00:00', end: '24:00', wakes: 4 }]
let state = emptyState(paths)
const saveManaged = (overrides) => {
  state = { ...state, revision: state.revision + 1, overrides }
  atomicWrite(paths.state, state)
}
const overrides = {
  'bili.night.windows': windows,
  'bili.night.maxWakesPerDay': 4,
  'bili.night.minGapMin': 1,
  'bili.night.skipChance': 0,
  'bili.night.maxVideos': 7,
}
let scheduler
try {
  const fixedNow = new Date(2026, 9, 27, 12, 0)
  const old = {
    date: fixedNow.toLocaleDateString('sv-SE'), wakes: 2, watchWakes: 1,
    wokeAt: new Date(2026, 9, 27, 11, 55).toISOString(),
    slots: [{ id: 'old', status: 'fired' }],
  }
  const replanned = reconcileNightPlanState(old, { maxWakesPerDay: 3 }, { now: fixedNow, revision: 1 })
  assert.equal(replanned.wakes, 2)
  assert.equal(replanned.watchWakes, 1)
  assert.equal(replanned.scheduleChanges[0].previousSlots[0].id, 'old')
  assert.equal(nightNotBeforeMinute(replanned, 20, fixedNow), 735)
  assert.equal(plannedWakeTime({ date: old.date, action: 'done' }, fixedNow), null)
  assert.equal(plannedWakeTime({ date: old.date, action: 'wake', at: 1329.95 }, fixedNow), new Date(2026, 9, 27, 22, 10).toISOString(), 'fractional slots report their first eligible integer minute')
  const adopted = { ...old, scheduleSettingsFingerprint: nightSettingsFingerprint({ maxWakesPerDay: 3 }) }
  assert.deepEqual(reconcileNightPlanState(adopted, { maxWakesPerDay: 3 }, { now: fixedNow, revision: 2 }).slots, old.slots)
  // Feasible earliest placement does not guarantee random placement can fit
  // every base window. Adopt the requested gap, sacrificing opportunity count.
  const strict = buildNightSchedule({
    windows: [{ start: '10:00', end: '10:01', wakes: 1 }, { start: '10:01', end: '10:02', wakes: 1 }],
    maxWakes: 2, minGapMin: 120, nowMin: 0, random: () => 0.99, strictGap: true,
  })
  assert.equal(strict.slots.length, 1)
  assert.ok(strict.warnings.some((warning) => /不压缩间隔/.test(warning)))
  const late = buildNightSchedule({
    windows: [{ start: '10:00', end: '10:01', wakes: 1 }],
    maxWakes: 1, minGapMin: 20, nowMin: 600.5, random: () => 0, strictGap: true,
  })
  assert.equal(late.slots.length, 0, 'no late base fallback may escape a nearly-ended window')
  for (let n = 0; n < 50; n += 1) {
    const generated = buildNightSchedule({
      windows: [{ start: '10:00', end: '11:00', wakes: 4 }, { start: '11:00', end: '12:00', wakes: 4 }],
      maxWakes: 8, minGapMin: 30, nowMin: 630, strictGap: true,
    })
    for (const [i, slot] of generated.slots.entries()) {
      assert.ok(slot.at >= 630 && slot.at < slot.end)
      if (i) assert.ok(slot.at - generated.slots[i - 1].at >= 30)
    }
  }

  atomicWrite(paths.bili, {
    night: { windows, maxWakesPerDay: 2, minGapMin: 20, skipChance: 0, maxVideos: 3 },
    listen: { comment: false, dm: false, live: false },
    dynamics: { enabled: false },
  })
  atomicWrite(legacyFile, { maxWakesPerDay: 0, maxVideos: 2 })
  saveManaged(overrides)
  const { config, configPath } = await import('../plugins/surfcore/tools/lib/config.mjs')
  assert.equal(configPath, paths.bili, 'DSH_HOME must select config even with a distinct USERPROFILE')
  assert.equal(config().night.maxVideos, 7)
  saveManaged({ ...overrides, 'bili.night.maxVideos': 9 })
  assert.equal(config().night.maxVideos, 9, 'sidecar hot read must not depend on legacy mtime')
  const changedClone = config()
  changedClone.night.maxVideos = 1
  assert.equal(config().night.maxVideos, 9, 'callers cannot mutate the cached base')

  const planner = path.join(repo, 'plugins', 'surfcore', 'tools', 'commands', 'whale-night.mjs')
  const plan = () => JSON.parse(execFileSync(process.execPath, [planner, 'plan'], { env: process.env, encoding: 'utf8' }))
  const firstPlan = plan()
  assert.equal(firstPlan.lifeSettings.revision, 2)
  assert.equal(firstPlan.lifeSettings.values['bili.night.maxWakesPerDay'], 4, 'managed choice must win over legacy cap=0')
  assert.equal(firstPlan.lifeSettings.values['bili.night.maxVideos'], 9)
  const samePlan = plan()
  assert.deepEqual(samePlan.slots, firstPlan.slots, 'unchanged rhythm cannot reroll a day plan')

  const now = new Date()
  atomicWrite(stateFile, {
    ...firstPlan, wakes: 3, watchWakes: 2, wokeAt: now.toISOString(),
    scheduleSettingsFingerprint: 'previous-real-plan',
  })
  saveManaged({ ...overrides, 'bili.night.maxWakesPerDay': 2 })
  const reduced = plan()
  assert.equal(reduced.wakes, 3, 'changing a cap must never erase used opportunities')
  assert.equal(reduced.watchWakes, 2)
  assert.equal(reduced.action, 'done')
  assert.equal(reduced.slots.length, 0, 'already-used daily cap cannot revive more wake slots')
  assert.ok(reduced.scheduleChanges.length > 0)
  saveManaged({ ...overrides, 'bili.night.maxWakesPerDay': 0 })
  assert.equal(plan().action, 'done', 'cap zero must not fall back to twelve')

  const { startScheduler, wakePrompt } = await import('../plugins/surfcore/lib/scheduler.js')
  const text = wakePrompt({ atText: '12:00' })
  assert.match(text, /feed --n 7/)
  assert.doesNotMatch(text, /每次醒来至少发一条|搭话额度要花完|必须写清.*为什么不想看/)
  let calls = 0
  const ctx = { sessionController: { prompt: async () => { calls += 1 }, inspect: async () => ({}) } }
  const schedulerOptions = {
    dshHome, biliMjs: path.join(repo, 'plugins', 'surfcore', 'tools', 'bili.mjs'),
    cwd: root, sessionId: 'local-bili-rhythm-fixture', runtimeMode: 'local-simulation',
  }
  scheduler = startScheduler(ctx, { ...schedulerOptions, tokenBudget: { block: async () => ({ blocked: true, usage: {} }) } })
  await scheduler.tick()
  assert.equal(calls, 0)
  assert.equal(scheduler.status().budget.blocked, true)
  assert.ok(scheduler.status().lastTickAt)
  scheduler.stop()

  // A due slot uses the genuine scheduler/real planner and a local prompt sink.
  saveManaged({ ...overrides, 'bili.night.maxWakesPerDay': 1 })
  const minute = now.getHours() * 60 + now.getMinutes()
  const fingerprint = nightSettingsFingerprint({ windows, maxWakesPerDay: 1, minGapMin: 1, skipChance: 0 })
  atomicWrite(stateFile, {
    date: now.toLocaleDateString('sv-SE'), wakes: 0, watchWakes: 0,
    scheduleSettingsFingerprint: fingerprint,
    slots: [{ id: 'due', action: 'wake', status: 'pending', at: minute, atText: 'fixture-now', start: 0, end: 1440, window: 'fixture', kind: 'base' }],
  })
  let prompted
  ctx.sessionController.prompt = async (args) => { prompted = args; calls += 1; return { accepted: true } }
  scheduler = startScheduler(ctx, { ...schedulerOptions, tokenBudget: { block: async () => ({ blocked: false, usage: {} }) } })
  await scheduler.tick()
  assert.ok(prompted, 'actual due slot must reach the isolated DSH prompt sink')
  assert.equal(prompted.sessionId, schedulerOptions.sessionId)
  assert.match(prompted.content[0].text, /^【生物钟】/)
  assert.match(prompted.content.at(-1).text, /生活状态｜系统事实/)
  assert.doesNotMatch(prompted.content[0].text, /生活状态｜系统事实/, 'dynamic board is appended, not inserted into static prefix')
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).wakes, 1)
  const { readRuntimeEvidence } = await import('../src/life-settings/runtime.js')
  const evidence = readRuntimeEvidence('bili')
  assert.equal(evidence.status, 'local-simulation')
  assert.equal(evidence.values['bili.night.maxVideos'], 7)
  console.log('life Bilibili runtime: isolated planner, hot adoption, cap/gap, preserved history, optional action, tail state: passed')
} finally {
  scheduler?.stop()
  // Fixture is kept for evidence; no recursive deletion of user paths.
  console.log('fixture:', temp)
}
