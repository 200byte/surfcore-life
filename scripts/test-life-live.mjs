/**
 * Opt-in, bounded real-model acceptance. The model selects and invokes native
 * MCP tools. Only the platform/DSH prompt destination is a local simulation.
 * Default invocation has no side effects; --prepare never reads an API key.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-flash';
const MAX_REQUESTS = 14;
const MAX_TOKENS = 1400;
const MAX_WALL_MS = 5 * 60_000;
const REQUEST_MS = 45_000;
const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const argv = process.argv.slice(2);
const live = argv.includes('--live');
const prepare = argv.includes('--prepare');
const keyIndex = argv.indexOf('--key-file');
const keyFile = keyIndex >= 0 ? argv[keyIndex + 1] : null;
const recognized = new Set(['--live', '--prepare', '--help', '--key-file']);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--key-file') {
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('--key-file requires an explicit local path');
    i += 1;
  } else if (!recognized.has(argv[i])) throw new Error('Unknown option');
}
if ((!live && !prepare) || argv.includes('--help')) {
  console.log('No model call or key read. Use --prepare for isolated MCP/scheduler readiness, or --live [--key-file PATH] for the explicitly authorized real-model test.');
  console.log('Key source: DEEPSEEK_API_KEY environment, or ONLY the DEEPSEEK_API_KEY assignment in an explicitly supplied file. Fixed official endpoint/model; at most 14 requests, 1400 output tokens each, five minutes total; no retries.');
  process.exit(0);
}
if (live && prepare) throw new Error('Choose exactly one of --live or --prepare');

let apiKey = '';
function redact(text) {
  let clean = String(text);
  if (apiKey) clean = clean.split(apiKey).join('[REDACTED_KEY]');
  return clean.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED_KEY]');
}
const safe = (value) => JSON.parse(redact(JSON.stringify(value)));
function loadKey() {
  const fromEnv = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (fromEnv) return { key: fromEnv, source: 'DEEPSEEK_API_KEY environment' };
  if (!keyFile) throw new Error('No DEEPSEEK_API_KEY; pass an explicitly authorized --key-file or set the environment variable');
  // This file is read only here. Other assignments are neither parsed nor used.
  const raw = fs.readFileSync(path.resolve(keyFile), 'utf8');
  const match = /^(?:\uFEFF)?\s*(?:export\s+)?DEEPSEEK_API_KEY\s*=\s*([^\r\n]*)/m.exec(raw);
  if (!match) throw new Error('Explicit file has no DEEPSEEK_API_KEY assignment');
  let value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  else value = value.replace(/\s+#.*$/, '').trim();
  if (!value || /[\r\n\0]/.test(value)) throw new Error('DEEPSEEK_API_KEY assignment is empty or malformed');
  return { key: value, source: 'DEEPSEEK_API_KEY in explicitly selected file' };
}

const startedAt = new Date();
const workDeadline = Date.now() + MAX_WALL_MS - 5_000;
const runId = startedAt.toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const runDir = path.join(repo, 'state', 'life-live', runId);
const root = path.join(runDir, 'isolated-root');
const dshHome = path.join(runDir, 'isolated-home');
const agentName = '生活参数选择与恢复验收-' + runId.slice(0, 19);
const sessionId = 'life-live-acceptance-' + randomUUID();
const transcript = [];
const requests = [];
const receipts = [];
const runtimePrompts = [];
let client;
let transport;
let scheduler;
let keySource = 'not-read';
let nativeTools = [];
let baseline = {};
let stderr = '';
let complete = false;
let fatal = null;
let beforeStopEvidence = null;
let finalState = null;

function persist(file, value) {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, file), JSON.stringify(safe(value), null, 2) + '\n', { mode: 0o600 });
}
function saveProgress() {
  persist('transcript.json', transcript);
  persist('requests.json', requests);
  persist('receipts.json', receipts);
  persist('runtime-prompts.json', runtimePrompts);
}
function bounded(promise, label, maximum = 20_000) {
  const remaining = Math.min(maximum, workDeadline - Date.now());
  if (remaining <= 0) throw new Error('Acceptance wall-time limit reached');
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out; no retry')), remaining); }),
  ]).finally(() => clearTimeout(timer));
}
function unpack(result) {
  const text = (result.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  return JSON.parse(text);
}
function noteMessage(role, content, extra = {}) {
  const message = { role, content, ...extra };
  transcript.push({ at: new Date().toISOString(), message: safe(message) });
  return message;
}
async function run() {
  if (live) {
    const loaded = loadKey();
    apiKey = loaded.key;
    keySource = loaded.source;
  }
  // The model and planner subprocesses do not inherit any API credentials.
  for (const name of Object.keys(process.env)) {
    if (/KEY|TOKEN|PASSWORD|SECRET|COOKIE/i.test(name)) delete process.env[name];
  }
  Object.assign(process.env, {
    SURFCORE_ROOT: root, SURFCORE_QQBOT_ROOT: root, QQBILI_QQBOT_ROOT: root,
    DSH_HOME: dshHome, USERPROFILE: path.join(runDir, 'isolated-profile'),
    SURFCORE_BILI_CONFIG: path.join(dshHome, 'surfcore', 'bili.config.json'),
    DSH_NODE: process.execPath,
    SURFCORE_SKIP_AUTOSTART: '1', SURFCORE_DISABLE_CHARACTER_MIGRATION: '1',
    SURFCORE_DISABLE_MEMORY_TIMER: '1',
  });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dshHome, 'surfcore'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'bridge.js'), '// Isolated path marker; never executed.\n');
  const baseQq = { purpose: { enabled: false }, socialV2: { proactive: { enabled: false } } };
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(baseQq, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'config.example.json'), JSON.stringify(baseQq, null, 2) + '\n');
  fs.writeFileSync(path.join(dshHome, 'surfcore', 'config.json'), JSON.stringify({
    version: 1, platforms: { start: { qq: false, bili: false } }, bridge: { autoStart: false },
  }, null, 2) + '\n');
  fs.writeFileSync(process.env.SURFCORE_BILI_CONFIG, JSON.stringify({
    persona: { name: '隔离验收主体', ownerTitle: '测试维护者', selfClaim: '我' },
    night: { windows: [{ start: '00:00', end: '24:00', wakes: 2 }], maxWakesPerDay: 2, minGapMin: 1, maxVideos: 5, skipChance: 0 },
    listen: { comment: false, dm: false, live: false },
    dynamics: { enabled: false }, share: { enabled: false },
    agent: { sandbox: 'workspace-write' },
  }, null, 2) + '\n');

  const { startScheduler } = await import('../plugins/surfcore/lib/scheduler.js');
  const { createManager } = await import('../src/life-settings/manager.js');
  const { compactLifeState, readRuntimeEvidence } = await import('../src/life-settings/runtime.js');
  const { scopePaths, readState } = await import('../src/life-settings/file-store.js');
  const manager = createManager({ root, dshHome });
  const localSink = {
    sessionController: {
      inspect: async () => ({ id: sessionId, acceptanceOnly: true }),
      create: async () => ({ id: sessionId, acceptanceOnly: true }),
      prompt: async (args) => {
        assert.equal(args.sessionId, sessionId);
        runtimePrompts.push(safe({ at: new Date().toISOString(), platform: 'local-simulation', args }));
        return { accepted: true, destination: 'local-prompt-sink; no DSH/model/platform call' };
      },
    },
  };
  scheduler = startScheduler(localSink, {
    dshHome, biliMjs: path.join(repo, 'plugins', 'surfcore', 'tools', 'bili.mjs'),
    cwd: root, sessionId, runtimeMode: 'local-simulation',
    log: (text) => { /* No model or platform event is inferred from scheduler logs. */ },
  });
  await bounded(scheduler.tick(), 'Initial isolated scheduler tick');
  baseline = Object.fromEntries(manager.state().parameters.filter((p) => p.id.startsWith('bili.night.')).map((p) => [p.id, p.savedValue]));
  assert.equal(readRuntimeEvidence('bili', { root, dshHome }).valid, true, 'initial real scheduler evidence missing');

  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|TOKEN|PASSWORD|SECRET|COOKIE/i.test(name)));
  client = new Client({ name: 'bounded-official-deepseek-acceptance', version: '1.0.0' });
  transport = new StdioClientTransport({
    command: process.execPath, args: [path.join(repo, 'src', 'mcp-life-settings.js')],
    env: childEnv, stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk) => { stderr += redact(chunk).slice(0, 4000); });
  await bounded(client.connect(transport), 'Native MCP connection');
  nativeTools = (await bounded(client.listTools(), 'Native MCP discovery')).tools;
  assert.equal(nativeTools.length, 9, 'expected all nine native life tools');
  persist('tools.json', nativeTools);
  persist('baseline.json', { baseline, runtime: readRuntimeEvidence('bili', { root, dshHome }) });
  console.log('[life-live] isolated MCP and real scheduler ready; mode=' + (live ? 'official-model' : 'prepare-only'));
  if (prepare) return;

  const tools = nativeTools.map((tool) => ({ type: 'function', function: {
    name: tool.name, description: tool.description, parameters: tool.inputSchema,
  } }));
  const system = [
    '你正在参加一次明确授权的数字生命生活参数功能验收。你是隔离测试主体，名称：' + agentName + '。',
    '这不是云宝或任何现有生命的主对话，也不代表大肥鱼日常已经形成了这些偏好。没有既往生活经历可引用，请不要编造感受、社交经历或永久人格。',
    '真实部分：你正在通过 DeepSeek 官方 API 决定选择并调用真实 MCP 工具，配置实际写入隔离目录；真实 B站生活调度器会读取并验证。',
    '模拟部分：未登录任何 QQ/B站账号，DSH 投递目的地是本地接收器；本次不能证明真实平台互动或官方 DSH 模型 wire。',
    '请完成一次由你选择参数和理由的闭环：先 life_state 和 life_catalog 发现；对你考虑的至少一个参数 life_explain；然后自己选择一个或几个普通 bili.night.* 参数的不同值并说明测试理由，life_preview 后由你明确 life_apply。',
    '本次仅限普通 bili.night.* 参数；不得使用 intent、修改其他参数或请求审批。不要只原样保存，必须至少实际改变一项。具体目标数值由你决定，遵守范围与耦合；测试维护者没有预先指定你的选值。',
    '保存后运行器会调用真实隔离 scheduler.tick 并在对话尾部追加状态事实。然后你应调用 life_verify 检查实际采用，不把保存当生效。',
    '再用 life_observe 只记录实际能证实的结果和选择；可以说明只有本地调度证据，没有真实平台体验。',
    '为完成验收并恢复现场，最后你要用 life_rollback 针对刚才那次修改生成恢复计划，明确调用 life_apply，再 life_verify 确认。只进行一轮临时调整和对应恢复，不要继续探索其他功能。',
    '不能替你伪造工具调用；所有工具调用必须由你通过当前提供的 function tools 产生。工具报错时停止并如实报告。不要反复尝试或索取凭据。',
    '本次最多 14 次模型请求、每次输出最多 1400 tokens、总计最多五分钟。可把独立查询合并在同一轮；依赖前一步真实返回的 planId/changeId 必须等待返回，不能猜。',
  ].join('\n');
  const messages = [
    noteMessage('system', system),
    noteMessage('user', '请开始这次临时生活参数选择、验证与恢复验收。所有真实状态请通过工具读取。' + compactLifeState({ platform: 'bili', wakeReason: '隔离实模验收开始' }, { root, dshHome })),
  ];
  const seen = new Set();
  const knownPlans = new Set();
  const modelApplied = [];
  const verified = new Set();
  const observed = new Set();
  const beforeRollbacks = new Set();
  let priorSentMessages = null;
  for (let index = 1; index <= MAX_REQUESTS; index += 1) {
    if (Date.now() >= workDeadline) throw new Error('Acceptance wall-time limit reached');
    const body = {
      model: MODEL, messages, tools, tool_choice: 'auto',
      thinking: { type: 'disabled' }, max_tokens: MAX_TOKENS, stream: false,
    };
    const requestStarted = Date.now();
    console.log('[life-live] official request ' + index + '/' + MAX_REQUESTS);
    const record = {
      index, startedAt: new Date(requestStarted).toISOString(), endpoint: ENDPOINT,
      transport: 'direct-official-HTTPS-chat-completions', modelRequested: MODEL,
      requestHash: sha(body), systemHash: sha(system), toolsHash: sha(tools),
      historicalPrefixHash: sha(messages.slice(0, -1)),
      previousRequestMessagePrefixPreserved: priorSentMessages === null ? null
        : JSON.stringify(messages.slice(0, priorSentMessages.length)) === JSON.stringify(priorSentMessages),
      messageCount: messages.length, maxTokens: MAX_TOKENS, thinking: 'disabled',
    };
    requests.push(record);
    priorSentMessages = structuredClone(messages);
    saveProgress();
    const response = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(REQUEST_MS, workDeadline - Date.now())),
    });
    if (!response.ok) {
      const errorBody = redact(await response.text()).slice(0, 800);
      record.status = response.status;
      throw new Error('Official API rejected request (' + response.status + '): ' + errorBody + '; no retry');
    }
    const returned = await response.json();
    const choice = returned.choices?.[0];
    const message = choice?.message;
    if (!message) throw new Error('Official API returned no assistant message; no retry');
    record.completedAt = new Date().toISOString();
    record.durationMs = Date.now() - requestStarted;
    record.responseId = returned.id ?? null;
    record.modelReturned = returned.model ?? null;
    record.finishReason = choice.finish_reason ?? null;
    record.usage = {
      promptTokens: returned.usage?.prompt_tokens ?? null,
      completionTokens: returned.usage?.completion_tokens ?? null,
      totalTokens: returned.usage?.total_tokens ?? null,
      promptCacheHitTokens: returned.usage?.prompt_cache_hit_tokens ?? null,
      promptCacheMissTokens: returned.usage?.prompt_cache_miss_tokens ?? null,
      source: 'official API response; not provider billing ledger',
    };
    // No reasoning_content/thinking trace is retained or replayed.
    const assistant = noteMessage('assistant', message.content ?? null,
      message.tool_calls?.length ? { tool_calls: message.tool_calls } : {});
    messages.push(assistant);
    if (!message.tool_calls?.length) throw new Error('Model stopped before the required verified adjustment-and-rollback completed');
    let adopted = false;
    for (const call of message.tool_calls) {
      if (Date.now() >= workDeadline) throw new Error('Acceptance wall-time limit reached');
      if (call.type !== 'function' || !nativeTools.some((tool) => tool.name === call.function?.name)) throw new Error('Model requested an unknown tool');
      const name = call.function.name;
      const args = JSON.parse(call.function.arguments || '{}');
      if (name === 'life_preview') {
        if (args.intent || !args.patch || Object.keys(args.patch).some((id) => !id.startsWith('bili.night.'))) throw new Error('Model exceeded the explicitly limited local-test parameter scope');
        assert.ok(['life_state', 'life_catalog', 'life_explain'].every((tool) => seen.has(tool)), 'Model must discover and understand before preview');
      }
      if (name === 'life_apply') assert.ok(knownPlans.has(args.planId), 'Model must use its actual returned preview/rollback plan');
      console.log('[life-live] model tool ' + name);
      const native = await bounded(client.callTool({ name, arguments: args }), 'Native ' + name);
      const result = unpack(native);
      const receipt = { at: new Date().toISOString(), request: index, toolCallId: call.id, name, arguments: args, result, isError: Boolean(native.isError) };
      receipts.push(safe(receipt));
      messages.push(noteMessage('tool', JSON.stringify(result), { tool_call_id: call.id }));
      seen.add(name);
      saveProgress();
      if (native.isError) throw new Error('Native tool rejected model choice: ' + name + ': ' + redact(result.error || result.status || 'unknown') + '; no retry');
      if (name === 'life_preview' || name === 'life_rollback') {
        assert.equal(result.status, 'ready-for-agent-choice', 'Model must preview a valid, nonempty autonomous change');
        knownPlans.add(result.id);
        if (name === 'life_rollback') beforeRollbacks.add(args.changeId);
      }
      if (name === 'life_apply') {
        assert.equal(result.status, 'saved-unverified');
        assert.ok(result.changes.length > 0 && result.changes.every((change) => change.id.startsWith('bili.night.')));
        modelApplied.push(result.changeId);
        await bounded(scheduler.tick(), 'Real isolated scheduler adoption');
        adopted = true;
        receipts.at(-1).runtimeAfterScheduler = safe(readRuntimeEvidence('bili', { root, dshHome }));
        console.log('[life-live] scheduler adopted saved revision ' + result.revision + '; verify remains the model tool step');
      }
      if (name === 'life_verify' && result.status === 'runtime-adopted') verified.add(result.changeId);
      if (name === 'life_observe') observed.add(args.changeId);
    }
    if (adopted) messages.push(noteMessage('user',
      '【隔离运行器事实】刚才保存后，真实本地 scheduler.tick 已执行；接下来请用 life_verify 自行检查。这里没有真实 B站登录或互动。' +
      compactLifeState({ platform: 'bili', wakeReason: '模型自主保存后的实际调度读取' }, { root, dshHome })));
    saveProgress();
    const persisted = readState(scopePaths({ root, dshHome }));
    const forward = persisted.history.find((change) => !change.rollbackOf && modelApplied.includes(change.id));
    const rollback = forward && persisted.history.find((change) => change.rollbackOf === forward.id && modelApplied.includes(change.id));
    if (forward && rollback && beforeRollbacks.has(forward.id)
      && observed.has(forward.id) && verified.has(forward.id) && verified.has(rollback.id)) {
      assert.ok(forward.changes.some((change) => JSON.stringify(change.before) !== JSON.stringify(change.after)), 'actual model-generated adjustment must differ');
      finalState = manager.state();
      for (const change of forward.changes) {
        const current = finalState.parameters.find((p) => p.id === change.id);
        assert.equal(JSON.stringify(current.savedValue), JSON.stringify(baseline[change.id]), 'saved baseline not restored');
        assert.equal(current.status, 'runtime-adopted', 'rollback not adopted by actual scheduler');
        assert.equal(JSON.stringify(current.effectiveValue), JSON.stringify(baseline[change.id]), 'actual baseline not restored');
      }
      beforeStopEvidence = readRuntimeEvidence('bili', { root, dshHome });
      persist('journal.json', persisted);
      persist('final-state-before-stop.json', finalState);
      complete = true;
      break;
    }
  }
  if (!complete) throw new Error('Bounded request limit reached before a verified model-generated adjustment and rollback');
}

try {
  await run();
} catch (error) {
  fatal = redact(error?.message || String(error));
  console.error('[life-live] stopped: ' + fatal);
  process.exitCode = 1;
} finally {
  if (scheduler) scheduler.stop();
  // Close only this acceptance client's child process. No existing life is used.
  await Promise.race([client?.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))]);
  await Promise.race([transport?.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))]);
  saveProgress();
  persist('RESULT.json', {
    status: fatal ? 'failed' : prepare ? 'prepared-no-model-call' : complete ? 'passed' : 'incomplete',
    success: !fatal && complete, error: fatal, agentName, sessionId,
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    limits: { requests: MAX_REQUESTS, requestMs: REQUEST_MS, totalMs: MAX_WALL_MS, outputTokensPerRequest: MAX_TOKENS, retries: 0 },
    actualModelRequests: requests.length, modelRequested: MODEL,
    completedModelResponses: requests.filter((record) => record.completedAt).length,
    modelReturned: [...new Set(requests.map((r) => r.modelReturned).filter(Boolean))],
    keySource, keyPersisted: false,
    modelEvidence: prepare ? 'not-invoked' : 'real official DeepSeek API, thinking disabled, actual model-generated native MCP tool calls',
    platformEvidence: 'local simulation: actual scheduler/config/planner, isolated DSH prompt sink, no QQ/Bilibili account/network interaction',
    officialDshAdapterWire: 'not-tested-by-this-direct-HTTP-runner',
    finalNoPendingDifferences: complete,
    runtimeEvidenceBeforeStop: beforeStopEvidence,
    artifacts: ['transcript.json', 'requests.json', 'receipts.json', 'journal.json', 'tools.json', 'baseline.json', 'final-state-before-stop.json', 'runtime-prompts.json'],
    nativeMcpStderr: stderr,
  });
  console.log('[life-live] result=' + (fatal ? 'failed' : prepare ? 'prepared-no-model-call' : complete ? 'passed' : 'incomplete'));
  console.log('[life-live] artifacts=' + runDir);
  apiKey = '';
}
