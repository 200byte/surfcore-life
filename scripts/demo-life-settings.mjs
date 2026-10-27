#!/usr/bin/env node
/** Recording-ready offline flow through the actual MCP server and Bilibili scheduler. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { atomicWrite } from '../src/life-settings/file-store.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/demo-life-settings.mjs [--step]\n--step: 每阶段按 Enter 继续；真实 MCP/调度器，隔离配置，脚本化选择，无模型/平台发送。');
} else {
  if (args.some((arg) => arg !== '--step')) throw new Error('UNKNOWN_ARGUMENT: only --step and --help are supported');
  const stepMode = args.includes('--step');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const runDir = path.join(repo, 'state', 'life-demo', runId);
  const root = path.join(runDir, 'isolated-root');
  const dshHome = path.join(runDir, 'isolated-dsh');
  const configFile = path.join(dshHome, 'surfcore', 'bili.config.json');
  const transcript = [];
  const promptSink = [];
  let scheduler;
  let client;
  let transport;
  let input;
  let inputLines;
  let completed = false;
  let interrupted = false;
  const summary = { runId, isolation: 'local-simulation', choices: 'scripted-agent-choice-not-paid-model', modelCalls: 0, platformActions: 0 };
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'bridge.js'), '// Path-detection fixture only. Real QQ bridge is never started.\n');
  atomicWrite(path.join(root, 'config.json'), {});
  // No user persona, account, credentials, memories or preferences are copied.
  atomicWrite(path.join(dshHome, 'surfcore', 'config.json'), {
    persona: { injectInBili: false }, alignment: { enabled: false },
    memory: { qqToBili: { enabled: false } },
  });
  atomicWrite(configFile, {
    night: { windows: [{ start: '00:00', end: '24:00', wakes: 1 }], maxWakesPerDay: 1, maxVideos: 3, minGapMin: 1, skipChance: 0 },
    preferences: { like: [], keywords: [], weights: {}, dislike: [] },
    listen: { comment: false, dm: false, live: false, allDay: false },
    dynamics: { enabled: false }, share: { enabled: false }, agent: { sandbox: 'workspace-write' },
  });
  const environment = {
    ...process.env, DSH_HOME: dshHome, SURFCORE_ROOT: root, SURFCORE_QQBOT_ROOT: root,
    SURFCORE_BILI_CONFIG: configFile, DSH_NODE: process.execPath,
    USERPROFILE: path.join(runDir, 'isolated-profile'),
  };
  // The genuine scheduler/config modules resolve their paths at import time.
  for (const name of ['DSH_HOME', 'SURFCORE_ROOT', 'SURFCORE_QQBOT_ROOT', 'SURFCORE_BILI_CONFIG', 'DSH_NODE', 'USERPROFILE']) process.env[name] = environment[name];
  const flush = () => {
    atomicWrite(path.join(runDir, 'transcript.json'), { schema: 1, summary, events: transcript });
    const markdown = [
      '# 自主生活参数：本地真实接口演示', '',
      '**脚本化 Agent 选择；隔离模拟。没有调用付费模型，没有 QQ/B站账号或外部发送。**', '',
      '使用真实 MCP stdio 工具、事务存储、B站 planner 子进程和调度器；prompt 的接收端是本地收集器。运行时采用不等于真实平台活动。', '',
      ...transcript.flatMap((event) => [`## ${event.title ?? event.kind}`, '', `时间：${event.at}`, '', '```json', JSON.stringify(event, null, 2), '```', '']),
    ].join('\n');
    fs.writeFileSync(path.join(runDir, 'transcript.md'), markdown, 'utf8');
  };
  const record = (kind, detail = {}) => {
    const event = { at: new Date().toISOString(), kind, ...detail };
    transcript.push(event); flush(); return event;
  };
  const onInterrupt = () => {
    interrupted = true;
    scheduler?.stop();
    input?.close();
  };
  process.once('SIGINT', onInterrupt);
  const pause = async (number, title) => {
    if (interrupted) throw new Error('DEMO_INTERRUPTED');
    console.log(`\n${number}. ${title}`);
    record('stage', { title: `${number}. ${title}` });
    if (stepMode) {
      console.log('按 Enter 继续（Ctrl+C 结束；只影响本次隔离演示）');
      const next = await inputLines.next();
      if (next.done) throw new Error('STEP_INPUT_ENDED: rerun interactively or omit --step');
    }
  };
  const call = async (name, arguments_ = {}) => {
    if (interrupted) throw new Error('DEMO_INTERRUPTED');
    const result = await client.callTool({ name, arguments: arguments_ });
    const text = result.content?.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
    const parsed = text ? JSON.parse(text) : result;
    record('mcp-tool', { title: name, arguments: arguments_, result: parsed, isError: Boolean(result.isError) });
    if (result.isError) throw new Error(`${name}: ${parsed.error ?? 'tool rejected'}`);
    return parsed;
  };
  try {
    console.log('大肥鱼自己了解并调整生活参数 · 本地隔离演示');
    console.log('选择由演示脚本明确作出；未唤醒真实生命，也未调用模型。');
    console.log('证据目录：' + runDir);
    record('scope', { title: '真实接口 / 隔离数据', root, dshHome, source: path.join(repo, 'src', 'mcp-life-settings.js'), externalPlatform: false });
    if (stepMode) {
      input = createInterface({ input: process.stdin, terminal: false });
      inputLines = input[Symbol.asyncIterator]();
    }
    transport = new StdioClientTransport({
      command: process.execPath, args: [path.join(repo, 'src', 'mcp-life-settings.js')],
      cwd: root, env: environment, stderr: 'pipe',
    });
    transport.stderr?.on('data', (data) => record('mcp-stderr', { text: String(data) }));
    client = new Client({ name: 'surfcore-offline-recording-demo', version: '1.0.0' });
    await client.connect(transport);
    const tools = await client.listTools();
    assert(tools.tools.some((tool) => tool.name === 'life_apply'));
    assert(!tools.tools.some((tool) => /approve/.test(tool.name)));
    record('tool-discovery', { tools: tools.tools.map((tool) => tool.name) });

    await pause(1, '通过正常 MCP 工具查看真实状态');
    const initial = await call('life_state');
    assert.equal(initial.revision, 0);
    assert(initial.parameters.every((parameter) => parameter.effectiveValue === null));
    console.log('当前 r0；运行时尚未启动，生效值明确为未知。');

    await pause(2, '发现可调整的 B站节奏，并理解成本与约束');
    const catalog = await call('life_catalog', { query: 'B站' });
    assert(catalog.parameters.some((parameter) => parameter.id === 'bili.night.maxWakesPerDay'));
    const explanation = await call('life_explain', { id: 'bili.night.maxWakesPerDay' });
    console.log(explanation.name + '：' + explanation.impact);
    console.log('工具解释了窗口、跳过概率、最小间隔、登录和预算等关联约束。');

    await pause(3, '脚本化 Agent 选择：先预览增加探索机会');
    record('scripted-agent-choice', { intent: 'more-exploration', note: '演示选择，不代表真实主体愿望或永久偏好。' });
    const plan = await call('life_preview', {
      intent: 'more-exploration', reason: '脚本化本地演示：比较增加浏览机会后的实际排程，再决定是否恢复。',
      experience: '本轮只观察隔离规划器，不声称已经浏览真实视频。',
    });
    assert.equal(plan.status, 'ready-for-agent-choice');
    assert(plan.changes.some((change) => change.id === 'bili.night.windows' && change.coupled));
    assert.equal((await call('life_state')).revision, 0);
    console.table(plan.changes.map(({ name, before, after, coupled }) => ({ 参数: name, 修改前: JSON.stringify(before), 修改后: JSON.stringify(after), 联动: coupled })));
    console.log('预览联动了窗口机会、每日次数与单次数量；尚未执行。');

    await pause(4, '明确提交选择，再检查“保存”和“生效”的差别');
    const applied = await call('life_apply', { planId: plan.id });
    assert.equal(applied.status, 'saved-unverified');
    const notYet = await call('life_verify', { changeId: applied.changeId });
    assert.equal(notYet.status, 'saved-unverified');
    console.log('r1 已保存；尚无消费者采用证据，所以仍是 saved-unverified。');

    await pause(5, '启动真正的隔离调度器，读取新值并生成真实计划');
    const { startScheduler } = await import('../plugins/surfcore/lib/scheduler.js');
    const ctx = { sessionController: {
      inspect: async () => ({ id: 'offline-demo-bili' }),
      create: async (request) => ({ ...request, localOnly: true }),
      cancel: async () => ({ localOnly: true }),
      prompt: async (request) => {
        promptSink.push(request);
        record('local-prompt-sink', { note: '本地收集器接收调度任务，没有模型执行，也没有平台动作。', request });
        return { accepted: true, localOnly: true };
      },
    } };
    scheduler = startScheduler(ctx, {
      dshHome, biliMjs: path.join(repo, 'plugins', 'surfcore', 'tools', 'bili.mjs'), cwd: root,
      sessionId: 'offline-demo-bili', runtimeMode: 'local-simulation',
      tokenBudget: { block: async () => ({ blocked: false, usage: {}, source: 'isolated-empty-budget-fixture' }) },
      log: (text) => record('scheduler-log', { text }),
    });
    await scheduler.tick();
    const verified = await call('life_verify', { changeId: applied.changeId });
    assert.equal(verified.status, 'runtime-adopted');
    assert.equal(verified.validationScope, 'local-simulation');
    const after = await call('life_state');
    const scheduling = scheduler.status();
    record('scheduler-state', { phase: 'after-change', status: scheduling, persistedPlan: JSON.parse(fs.readFileSync(path.join(dshHome, 'surfcore', 'bili', 'whale-night.json'), 'utf8')) });
    console.log('真实 planner 子进程 / scheduler 已采用 r1；校验结果 runtime-adopted（local-simulation）。');
    console.table(after.parameters.filter((parameter) => plan.changes.some((change) => change.id === parameter.id)).map(({ name, savedValue, effectiveValue, status }) => ({ 参数: name, 保存值: JSON.stringify(savedValue), 消费者采用值: JSON.stringify(effectiveValue), 状态: status })));
    console.log('下一次真实计划：' + (scheduling.nextWakeAt ?? '当天已无可用时窗/机会，计划状态=' + scheduling.scheduleAction));
    console.log('隔离调度今日已用机会：' + scheduling.dailyWakes + '；真实平台活动：0。');

    await pause(6, '记录实际观察，不编造生活经历或心理');
    await call('life_observe', {
      changeId: applied.changeId, decision: 'consider-revert',
      text: '本地真实调度器已采用 r1 并生成计划；没有真实平台浏览，也没有模型体验。本次演示选择恢复之前的设置。',
      evidenceRef: path.join(dshHome, 'surfcore', 'life-runtime', 'bili.json'),
    });
    const history = await call('life_history', { limit: 20 });
    assert.equal(history.records.length, 1);
    assert.equal(history.observations.length, 1);
    console.log('修改理由、前后值、系统校验和后续观察可查询；观察标为 Agent 报告。');

    await pause(7, '预览回滚，明确提交，再由消费者复验');
    const rollback = await call('life_rollback', { changeId: applied.changeId, reason: '脚本化演示：恢复修改前的有效设置，保留已发生的计数和记录。' });
    console.table(rollback.changes.map(({ name, before, after }) => ({ 参数: name, 回滚前: JSON.stringify(before), 恢复为: JSON.stringify(after) })));
    const reverted = await call('life_apply', { planId: rollback.id });
    assert.equal(reverted.status, 'saved-unverified');
    const countBefore = scheduler.status().dailyWakes;
    await scheduler.tick();
    const rollbackVerified = await call('life_verify', { changeId: reverted.changeId });
    assert.equal(rollbackVerified.status, 'runtime-adopted');
    const restored = await call('life_state');
    const restoredCap = restored.parameters.find((parameter) => parameter.id === 'bili.night.maxWakesPerDay');
    assert.equal(restoredCap.savedValue, 1);
    assert.equal(restoredCap.effectiveValue, 1);
    assert(scheduler.status().dailyWakes >= countBefore, 'rollback must never reset consumed opportunities');
    record('scheduler-state', { phase: 'after-rollback', status: scheduler.status() });
    console.log('r2 回滚已被真实消费者采用：每日机会恢复1次，已用次数没有归零。');

    await pause(8, '停止演示运行时，保留完整证据');
    scheduler.stop();
    const stopped = await call('life_state');
    assert.equal(stopped.runtime.bili.valid, false);
    assert.equal(stopped.runtime.bili.details.running, false);
    completed = true;
    Object.assign(summary, {
      completed: true, changedRevision: applied.revision, rollbackRevision: reverted.revision,
      initialVerification: notYet.status, changedVerification: verified.status, rollbackVerification: rollbackVerified.status,
      validationScope: verified.validationScope, schedulerStopped: true, localPromptCount: promptSink.length,
      currentRuntimeValid: false, historicalRuntimeAdoptionPreservedInTranscript: true,
    });
    record('complete', { ...summary, title: '演示完成；运行时已停止，历史采用证据仍可回看' });
    console.log('\n完成：真实 MCP → 解释 → 联动预览 → 保存待验 → 真实消费者采用 → 观察 → 回滚复验。');
    console.log('演示运行时已停止，当前状态不会继续声称在线。');
    console.log('录屏文字稿：' + path.join(runDir, 'transcript.md'));
    console.log('机器证据：' + path.join(runDir, 'transcript.json'));
  } catch (error) {
    summary.completed = false;
    record('failure', { error: String(error?.message ?? error) });
    console.error('演示失败：' + String(error?.message ?? error));
    console.error('现场保留：' + runDir);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    scheduler?.stop();
    input?.close();
    try { await client?.close(); } catch {}
    try { await transport?.close(); } catch {}
    atomicWrite(path.join(runDir, 'demo-report.json'), { ...summary, completed, schedulerStopped: true, evidence: { transcript: 'transcript.json', readable: 'transcript.md' } });
    flush();
  }
}
