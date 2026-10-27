/** Explicit platform READ acceptance. Replays an earlier real model choice; no new model calls. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import assert from 'node:assert/strict'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const live = args.includes('--live')
const prepare = args.includes('--prepare')
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const evidenceFile = option('--model-evidence')
const credentialFile = option('--credential-file') || process.env.SURFCORE_BILI_CREDENTIAL_FILE
if ((!live && !prepare) || args.includes('--help')) {
  console.log('No platform/model call. Usage: --prepare --model-evidence RECEIPTS, or explicitly authorized --live --credential-file PATH --model-evidence RECEIPTS. Only five allowlisted Bilibili GETs; no platform writes, no model calls, no credential copy.')
  process.exit(0)
}
if (live === prepare || !evidenceFile) throw new Error('Choose --prepare or --live and supply --model-evidence')
if (live && (!credentialFile || !path.isAbsolute(credentialFile))) throw new Error('--live requires an explicit absolute credential file reference')

const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8)
const outDir = path.join(repo, 'state', 'life-bili-platform', runId)
const root = path.join(outDir, 'isolated-root')
const dshHome = path.join(outDir, 'isolated-home')
let credential = {}
let scheduler
let manager
let activeChange = null
let result = { status: 'incomplete', success: false, mode: live ? 'live-platform-read' : 'prepare-no-platform-call', newModelCalls: 0, replayNotFreshAutonomy: true }
const hash = (value) => createHash('sha256').update(value).digest('hex')
const scrub = (text) => {
  let clean = String(text)
  for (const secret of Object.values(credential)) if (typeof secret === 'string' && secret) clean = clean.split(secret).join('[REDACTED_CREDENTIAL]')
  return clean.replace(/(?:SESSDATA|bili_jct|buvid3)\s*=\s*[^;\s]+/gi, '[REDACTED_COOKIE]').replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED_KEY]')
}
const save = (name, value) => {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, name), scrub(JSON.stringify(value, null, 2)) + '\n', { mode: 0o600 })
}
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n') }
const native = (script, scriptArgs) => new Promise((resolve, reject) => {
  execFile(process.execPath, ['--import', pathToFileURL(path.join(repo, 'scripts', 'life-bili-read-guard.mjs')).href, script, ...scriptArgs], {
    cwd: root, env: process.env, windowsHide: true, timeout: 45_000, maxBuffer: 2 * 1024 * 1024,
  }, (error, stdout, stderr) => {
    if (error) return reject(new Error('NATIVE_READ_FAILED: ' + path.basename(script) + ' (' + String(error.code || error.name) + '): ' + scrub(stderr).slice(0, 500)))
    try { resolve(JSON.parse(stdout)) } catch { reject(new Error('NATIVE_READ_INVALID_JSON: ' + path.basename(script))) }
  })
})
try {
  const evidencePath = path.resolve(evidenceFile)
  const priorResult = JSON.parse(fs.readFileSync(path.join(path.dirname(evidencePath), 'RESULT.json'), 'utf8'))
  assert.equal(priorResult.success, true, 'the supplied model acceptance must have succeeded')
  assert.ok(priorResult.actualModelRequests > 0, 'supplied receipt needs actual model requests')
  const priorReceipts = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
  const original = priorReceipts.find((receipt) => receipt.name === 'life_apply' && receipt.result?.status === 'saved-unverified' && receipt.result.changes?.some((change) => change.id === 'bili.night.maxVideos'))
  assert.ok(original, 'the genuine previous model choice must include maxVideos for a visible consumer limit')
  assert.ok(priorReceipts.some((receipt) => receipt.name === 'life_verify' && receipt.result?.changeId === original.result.changeId && receipt.result.status === 'runtime-adopted'))
  const originalPreview = priorReceipts.find((receipt) => receipt.name === 'life_preview' && receipt.result?.id === original.arguments.planId)
  assert.ok(originalPreview, 'the actual model preview/reason must be traceable')
  const patch = Object.fromEntries(original.result.changes.map((change) => [change.id, change.after]))
  assert.ok(Object.keys(patch).every((id) => id.startsWith('bili.night.')))
  const videoChange = original.result.changes.find((change) => change.id === 'bili.night.maxVideos')
  assert.notEqual(videoChange.before, videoChange.after)
  // Tight external-read acceptance only. This does not change the earlier choice.
  assert.ok(videoChange.before >= 1 && videoChange.before <= 10 && videoChange.after >= 1 && videoChange.after <= 10)
  for (const name of Object.keys(process.env)) if (/KEY|TOKEN|PASSWORD|SECRET|COOKIE/i.test(name)) delete process.env[name]
  Object.assign(process.env, {
    SURFCORE_ROOT: root, SURFCORE_QQBOT_ROOT: root, QQBILI_QQBOT_ROOT: root,
    DSH_HOME: dshHome, USERPROFILE: path.join(outDir, 'isolated-profile'), DSH_NODE: process.execPath,
    SURFCORE_BILI_CONFIG: path.join(dshHome, 'surfcore', 'bili.config.json'),
    SURFCORE_SKIP_AUTOSTART: '1', SURFCORE_DISABLE_CHARACTER_MIGRATION: '1', SURFCORE_DISABLE_MEMORY_TIMER: '1',
  })
  if (live) process.env.SURFCORE_BILI_CREDENTIAL_FILE = path.resolve(credentialFile)
  else delete process.env.SURFCORE_BILI_CREDENTIAL_FILE
  write(path.join(root, 'config.json'), { purpose: { enabled: false }, socialV2: { proactive: { enabled: false } } })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'bridge.js'), '// Path marker only; never run.\n')
  write(path.join(dshHome, 'surfcore', 'config.json'), { platforms: { start: { qq: false, bili: false } }, bridge: { autoStart: false } })
  const base = {
    night: { windows: [{ start: '00:00', end: '24:00', wakes: 2 }], maxWakesPerDay: 2, minGapMin: 1, maxVideos: 5, skipChance: 0 },
    preferences: { like: [], keywords: [], weights: {}, dislike: [] },
    listen: { comment: false, dm: false, live: false }, dynamics: { enabled: false }, share: { enabled: false },
    agent: { sandbox: 'workspace-write' },
  }
  for (const change of original.result.changes) {
    const key = change.id.slice('bili.night.'.length)
    base.night[key] = change.beforeEffectiveStatus === 'runtime-observed' ? change.beforeEffective : change.before
  }
  write(process.env.SURFCORE_BILI_CONFIG, base)
  const { createManager } = await import('../src/life-settings/manager.js')
  const { startScheduler } = await import('../plugins/surfcore/lib/scheduler.js')
  const { readRuntimeEvidence } = await import('../src/life-settings/runtime.js')
  const { loadBiliCredential } = await import('../plugins/surfcore/tools/lib/session.mjs')
  manager = createManager({ root, dshHome, actor: 'acceptance:replay-of-verified-model-choice' })
  const sessionId = 'bili-platform-read-acceptance-' + randomUUID()
  scheduler = startScheduler({ sessionController: { inspect: async () => ({ id: sessionId }), prompt: async () => ({ accepted: true, destination: 'isolated-local-sink' }) } }, {
    dshHome, biliMjs: path.join(repo, 'plugins', 'surfcore', 'tools', 'bili.mjs'), cwd: root, sessionId, runtimeMode: 'local-simulation',
  })
  await scheduler.tick()
  const before = manager.state()
  const nBefore = before.parameters.find((p) => p.id === 'bili.night.maxVideos').effectiveValue
  let sourceBeforeHash = null
  let login = null
  let feedBefore = null
  let feedAfter = null
  if (live) {
    const loaded = loadBiliCredential()
    credential = loaded.credential
    sourceBeforeHash = hash(fs.readFileSync(loaded.source.file))
    login = await native(path.join(repo, 'plugins', 'surfcore', 'tools', 'verify', 'session.mjs'), ['--json'])
    assert.equal(login.loggedIn, true, 'actual nav did not authenticate')
    console.log('[bili-platform] authenticated native nav; account UID retained as hash only')
    feedBefore = await native(path.join(repo, 'plugins', 'surfcore', 'tools', 'commands', 'feed.mjs'), ['--source', 'popular', '--pages', '1', '--n', String(nBefore), '--no-remember', '--json'])
    assert.equal(feedBefore.n, nBefore)
    assert.ok(feedBefore.items.length > 0 && feedBefore.items.length <= nBefore, 'no real feed candidates before modification')
  }
  const plan = manager.preview({ patch, reason: '重放此前实模明确选择以验收真实只读消费者：' + String(originalPreview.arguments.reason).slice(0, 800), experience: '本次是已验证模型选择的明确重放，没有新增模型决策，不写成新生活经历。' })
  const changed = manager.apply(plan.id)
  activeChange = changed.changeId
  await scheduler.tick()
  assert.equal(manager.verify(changed.changeId).status, 'runtime-adopted')
  const nAfter = manager.state().parameters.find((p) => p.id === 'bili.night.maxVideos').effectiveValue
  assert.equal(nAfter, videoChange.after)
  if (live) {
    feedAfter = await native(path.join(repo, 'plugins', 'surfcore', 'tools', 'commands', 'feed.mjs'), ['--source', 'popular', '--pages', '1', '--n', String(nAfter), '--no-remember', '--json'])
    assert.equal(feedAfter.n, nAfter)
    assert.ok(feedAfter.items.length > 0 && feedAfter.items.length <= nAfter, 'no real feed candidates after modification')
  }
  const adopted = readRuntimeEvidence('bili', { root, dshHome })
  const backPlan = manager.rollback({ changeId: changed.changeId, reason: '只读平台验收结束，恢复本次隔离profile初始值' })
  const rolled = manager.apply(backPlan.id)
  await scheduler.tick()
  assert.equal(manager.verify(rolled.changeId).status, 'runtime-adopted')
  activeChange = null
  assert.equal(manager.state().parameters.find((p) => p.id === 'bili.night.maxVideos').effectiveValue, nBefore)
  const noCredentialCopy = !fs.existsSync(path.join(dshHome, 'surfcore', 'bili', 'credentials.json'))
  assert.ok(noCredentialCopy, 'credential must never be copied into this acceptance profile')
  const sourceUnchanged = live ? sourceBeforeHash === hash(fs.readFileSync(credentialFile)) : null
  assert.notEqual(sourceUnchanged, false)
  const requestsFile = path.join(root, 'state', 'bili-qa-requests.jsonl')
  const requests = fs.existsSync(requestsFile) ? fs.readFileSync(requestsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
  assert.ok(requests.length <= 5 && requests.every((request) => request.method === 'GET'))
  const summarize = (feed) => feed ? { requestedLimit: feed.n, returnedCount: feed.items.length, sources: feed.sources, pool: feed.stats.pool, items: feed.items.map((item) => ({ bv: item.bv, duration: item.duration, via: item.via })) } : null
  const countChanged = live ? feedBefore.items.length !== feedAfter.items.length : null
  result = {
    ...result, status: prepare ? 'prepared-no-platform-call' : countChanged ? 'passed' : 'partial-read-but-count-effect-unobserved', success: live && countChanged,
    sourceEvidence: { path: evidencePath, originalChangeId: original.result.changeId, actualModelRequests: priorResult.actualModelRequests, requestModel: priorResult.modelRequested, returnedModels: priorResult.modelReturned, originalModelReason: originalPreview.arguments.reason, patch, interpretation: 'Replay of prior actual model-generated native MCP choice; no fresh model autonomy in this read QA' },
    credentialSource: { kind: live ? 'explicit-operator-file-reference' : 'not-read', readOnly: true, copied: false, sourceUnchanged },
    login, before: summarize(feedBefore), after: summarize(feedAfter), actualReturnedCountChanged: countChanged,
    consumerLimit: { before: nBefore, after: nAfter, actualRuntimeAdopted: adopted.valid, rollbackVerified: true },
    httpRequests: requests, limits: { maxRequests: 5, methods: ['GET'], endpoints: ['nav', 'popular'], retries: 0, perRequestMs: 15_000 },
    platformWrites: 0, newModelCalls: 0, noCredentialCopy,
    platformEvidence: live ? 'authenticated real native SurfCore nav/feed GET consumers; actual scheduler fixture; no social sends' : 'no platform invoked',
  }
  save('runtime-adoption.json', adopted)
  save('changes.json', { originalChoice: original.result, replayChange: changed, replayRollback: rolled, current: manager.verify(rolled.changeId) })
  console.log('[bili-platform] ' + result.status + '; adopted browser limit ' + nBefore + ' -> ' + nAfter + ' -> ' + nBefore)
} catch (error) {
  result = { ...result, status: 'failed', success: false, error: scrub(error.message) }
  console.error('[bili-platform] stopped: ' + scrub(error.message))
  process.exitCode = 1
} finally {
  if (activeChange && manager && scheduler) {
    try {
      const plan = manager.rollback({ changeId: activeChange, reason: '平台只读验收中断，恢复隔离配置；不重试网络' })
      const change = manager.apply(plan.id)
      await scheduler.tick()
      result.failureCleanupRollback = manager.verify(change.changeId)
    } catch (error) { result.failureCleanupRollback = { status: 'not-restored', error: scrub(error.message) } }
  }
  scheduler?.stop()
  save('RESULT.json', result)
  console.log('[bili-platform] artifacts=' + outDir)
  credential = {}
}
