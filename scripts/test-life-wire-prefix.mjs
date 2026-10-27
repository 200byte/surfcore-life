/**
 * Optional installed-official-Adapter test; no DSH host, account, key or network.
 * node scripts/test-life-wire-prefix.mjs --modules <DSH node_modules>
 * Only public installed package code is read. Requests are intercepted in-process;
 * local synthetic SSE exercises the real serializer and stream parser.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { dshModulesDir } from './dsh-modules.mjs';
import { createManager } from '../src/life-settings/manager.js';
import { compactLifeState } from '../src/life-settings/runtime.js';
import { registerLifeTools } from '../src/life-settings/tools.js';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf('--' + name); return i < 0 ? undefined : args[i + 1]; };
const hash = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
let modules;
try { modules = path.resolve(option('modules') || dshModulesDir()); }
catch (error) {
  console.error(JSON.stringify({ status: 'unavailable', reason: error.message, note: 'No fallback adapter or fabricated pass.' }));
  process.exitCode = 2;
}

if (modules) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'surfcore-life-wire-'));
  const scope = { root: temp, dshHome: path.join(temp, 'dsh') };
  const previousFetch = globalThis.fetch;
  const captured = [];
  let extensionAccepts = 0;
  let fileServiceTouches = 0;
  const completion = 'local transport response';
  const events = [
    { type: 'message_start', message: { id: 'offline-response', type: 'message', role: 'assistant', model: 'deepseek-flash', content: [], usage: { input_tokens: 17, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: completion } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
    { type: 'message_stop' },
  ];
  const sse = events.map((event) => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join('');
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://offline.surfcore.invalid/anthropic/v1/messages', 'No real endpoint is permitted');
    assert.equal(init.method, 'POST');
    captured.push(JSON.parse(init.body));
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  try {
    const packageRoot = path.join(modules, '@deepseek-ai', 'dsh-llm-deepseek');
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const entry = path.resolve(packageRoot, manifest.main || 'lib/index.js');
    assert.equal(manifest.name, '@deepseek-ai/dsh-llm-deepseek');
    const { DeepSeekAdapter, resolveAdapterOptions } = await import(pathToFileURL(entry).href);
    assert.equal(typeof DeepSeekAdapter, 'function');
    assert.equal(typeof resolveAdapterOptions, 'function');
    const connection = resolveAdapterOptions({
      baseURL: 'https://offline.surfcore.invalid/anthropic', maxTokens: 128, streamIdleTimeoutMs: 10000,
    });
    const adapter = new DeepSeekAdapter({
      options: () => connection,
      resolveAuth: async () => ({ headers: { 'x-api-key': 'offline-fixture-not-a-real-key' } }),
      resolveUserId: () => 'offline-fixture-user',
      // Text-only requests must never touch the real attachment/upload index.
      resolveFiles: () => new Proxy({}, { get() { fileServiceTouches += 1; throw new Error('File service must remain unused'); } }),
      prepareExtensions: async () => ({ fields: {}, accept: async () => { extensionAccepts += 1; } }),
    });
    const model = await adapter.resolveModel('offline-fixture', 'deepseek-flash');
    assert.equal(model.systemPromptUpdate, 'in-history');
    assert.equal(model.toolUpdate, 'addition-only');
    const tools = [];
    registerLifeTools({ registerTool(name, definition) {
      tools.push({ name: 'mcp__surfcore-life__' + name, description: definition.description,
        parameters: z.toJSONSchema(definition.inputSchema) });
    } }, scope);
    assert.equal(tools.length, 9);
    const manager = createManager(scope);
    const system = 'Offline fixture Core: preserve identity and let choices belong to the agent.';
    const board1 = compactLifeState({ platform: 'qq', wakeReason: 'offline-fixture-first' }, scope);
    const firstInput = 'First fixture wake.' + board1;
    const messages = [
      { id: 'fixture-system', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: system }] },
      { id: 'fixture-user-1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: firstInput }] },
    ];
    const stream = async (history) => {
      const output = [];
      for await (const chunk of adapter.stream({ provider: 'offline-fixture', model: 'deepseek-flash', reasoningEffort: 'high',
        messages: history, tools, toolHistory: { tools, updates: [] }, sessionId: 'offline-isolated-session' })) output.push(chunk);
      assert.equal(output.filter((c) => c.type === 'finish').length, 1);
      assert.equal(output.filter((c) => c.type === 'text-delta').map((c) => c.text).join(''), completion);
      return output;
    };
    const firstResult = await stream(messages);
    const firstMessageHash = hash(messages);
    const plan = manager.preview({ patch: { 'purpose.enabled': false }, reason: 'Offline wire-prefix test; fixture choice only.' });
    const changed = manager.apply(plan.id);
    assert.equal(changed.revision, 1);
    const board2 = compactLifeState({ platform: 'qq', wakeReason: 'offline-fixture-second' }, scope);
    assert.notEqual(board1, board2);
    const secondInput = 'Second fixture wake.' + board2;
    const secondMessages = [...messages,
      { id: 'fixture-assistant-1', role: 'assistant', source: { kind: 'model', provider: 'offline-fixture', model: 'deepseek-flash',
        replayState: firstResult.find((c) => c.type === 'finish').replayState }, content: [{ type: 'text', text: completion }] },
      { id: 'fixture-user-2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: secondInput }] },
    ];
    await stream(secondMessages);
    assert.equal(captured.length, 2);
    assert.equal(extensionAccepts, 2);
    assert.equal(fileServiceTouches, 0);
    assert.equal(hash(messages), firstMessageHash, 'Original history was not rewritten');
    const [first, second] = captured;
    assert.deepEqual(second.system, first.system, 'Static system head must be stable');
    assert.ok(JSON.stringify(first.system).includes(system), 'Core retained on the actual wire');
    assert.deepEqual(second.messages.slice(0, first.messages.length), first.messages, 'Existing wire history must be a stable prefix');
    assert.deepEqual(second.tools, first.tools, 'Tool schemas and order must remain stable');
    assert.equal(JSON.stringify(second.messages.slice(0, first.messages.length)), JSON.stringify(first.messages), 'Wire history field order and encoded bytes must also stay stable');
    assert.equal(JSON.stringify(second.tools), JSON.stringify(first.tools), 'Wire tool declaration bytes must stay stable');
    assert.equal(second.tools.length, 9);
    assert.equal(second.messages.at(-1).role, 'user');
    const tailText = second.messages.at(-1).content.filter((block) => block.type === 'text').map((block) => block.text).join('');
    assert.ok(tailText.includes(secondInput), 'Dynamic facts stay in the new tail input');
    assert.ok(!JSON.stringify(second.system).includes('offline-fixture-second'));
    const summary = {
      status: 'passed', mode: 'official-adapter-offline-transport',
      adapter: { name: manifest.name, version: manifest.version, entrySha256: hash(fs.readFileSync(entry)) },
      requests: captured.length, localSyntheticResponses: 2, modelOrNetworkCalls: 0,
      modelCapabilities: { systemPromptUpdate: model.systemPromptUpdate, toolUpdate: model.toolUpdate },
      staticSystemSha256: hash(first.system), stableHistoryPrefixSha256: hash(first.messages),
      toolDeclarationsSha256: hash(first.tools), toolCount: first.tools.length,
      priorWireMessageCount: first.messages.length, newWireMessageCount: second.messages.length,
      dynamicFactsAtTail: true, originalHistoryUnchanged: true,
      wireMessagePrefixByteEqual: true, wireToolDeclarationsByteEqual: true,
      limitations: 'This verifies the installed official serializer and SSE parser with local synthetic transport; real DSH composition, provider cache hits, billed amount and external platforms remain unverified.',
    };
    if (option('output')) {
      const output = path.resolve(option('output'));
      if (fs.existsSync(output)) throw new Error('Output already exists; choose a new evidence file');
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: error.message, cause: error.cause?.message, modelOrNetworkCalls: 0 }));
    process.exitCode = 1;
  } finally {
    globalThis.fetch = previousFetch;
    const resolved = path.resolve(temp);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith('surfcore-life-wire-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
