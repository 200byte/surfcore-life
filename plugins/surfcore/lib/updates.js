/**
 * 组件更新检查 / 应用（2026-10-26 用户需求）。
 *
 * 管的是"一坨可独立更新的东西"：
 *   · SurfCore 本体（本仓库）        ← DSH 插件与桥接都在里面
 *   · 语音包（surfvoice-local / -cloud）  ← 装在 voice-packs 目录下
 *   · 桌宠（surfpet）                ← 装在 pet/app
 *   · 未来加入的扩展                  ← 配置里 `updates.components[]` 登记
 *
 * 设计原则（和项目其它地方的删除/覆盖纪律一致）：
 *   1. **只读检查、显式确认更新**：检查只做 `git fetch`，不动工作区；
 *   2. **只允许快进**：更新用 `merge --ff-only`，本地有改动 / 有未推送提交一律拒绝，
 *      绝不 `reset --hard`、绝不 stash 用户东西；
 *   3. **"不再提示"只对这一次的远端 commit 生效**：`dismissed[id] = 远端 sha`，
 *      远端有新提交就会重新提示；
 *   4. **不阻塞启动**：检查是异步的，网络/仓库不存在都只是"这一项不可用"。
 *
 * 状态文件：`<stateDir>/updates.json`
 *   { dismissed: { [componentId]: remoteSha }, lastCheckAt, results: [...] }
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

const GIT_TIMEOUT_MS = 30_000;
const MAX_CHANGELOG = 20;
const DEFAULT_BRANCH = 'main';

function runGit(args, { timeout = GIT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, {
      windowsHide: true,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      // 绝不能卡在交互式凭据提示上（拉私有仓库时宁可失败）
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', GCM_INTERACTIVE: 'never' },
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
        message: String(error?.message ?? ''),
      });
    });
  });
}

/** `git` 本身在不在（不在就整块功能降级，不报错）。 */
export async function gitAvailable() {
  const probe = await runGit(['--version'], { timeout: 5000 });
  return probe.ok ? probe.stdout.trim() : '';
}

/** 路径必须是"存在的目录"才往下问；不做任何拼接，避免把参数拼成 shell。 */
function normalizeDir(dir) {
  const raw = String(dir ?? '').trim();
  if (!raw) return '';
  try {
    const abs = path.resolve(raw);
    return fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? abs : '';
  } catch {
    return '';
  }
}

/**
 * 检查单个组件（只读；`fetch` 时才会碰网络）。
 *
 * 两种通道，按组件声明自动选：
 *   · `kind: 'git'`     → 只走 git（fetch + 比较 HEAD/origin）
 *   · `kind: 'release'` → 只走版本清单（version.json），不要求是 git 仓库
 *   · 不写 kind（默认） → 是 git 工作区就 git，否则有 versionUrl 就走 release
 *
 * release 通道用于**构建产物型**组件（桌宠）：源码在 git 里开源，但用户装的是 zip 产物，
 * 没法（也不该）用 git 判断版本。
 */
export async function inspectComponent(component, opts = {}) {
  const kind = String(component?.kind ?? '').trim();
  if (kind === 'release') return inspectReleaseComponent(component, opts);
  if (kind === 'git') return inspectGitComponent(component, opts);
  // 自动：先看是不是 git 工作区，不再看有没有 versionUrl
  const dir = normalizeDir(component?.dir);
  if (dir) {
    const inside = await runGit(['-C', dir, 'rev-parse', '--is-inside-work-tree']);
    if (inside.ok && inside.stdout.trim() === 'true') return inspectGitComponent(component, opts);
  }
  if (component?.versionUrl) return inspectReleaseComponent(component, opts);
  return inspectGitComponent(component, opts);
}

/** 检查单个 git 组件（只读；`fetch` 时才会碰网络）。 */
export async function inspectGitComponent(component, { fetch = true } = {}) {
  const id = String(component?.id ?? '').trim();
  const name = String(component?.name ?? id);
  const dir = normalizeDir(component?.dir);
  const base = { id, name, dir: dir || String(component?.dir ?? ''), kind: component?.kind ?? 'component' };
  if (!id) return { ...base, available: false, reason: '组件缺少 id' };
  if (!dir) return { ...base, available: false, reason: '目录不存在（还没安装？）' };

  const inside = await runGit(['-C', dir, 'rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    return { ...base, available: false, reason: '不是 git 仓库（用 git clone 安装的才能检查更新）' };
  }
  const remoteUrl = await runGit(['-C', dir, 'remote', 'get-url', 'origin']);
  if (!remoteUrl.ok) return { ...base, available: false, reason: '没有配置 origin remote' };

  let branch = String(component?.branch ?? '').trim();
  if (!branch) {
    const current = await runGit(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']);
    branch = current.ok ? current.stdout.trim() : DEFAULT_BRANCH;
  }
  if (!branch || branch === 'HEAD') {
    return { ...base, available: false, reason: '处于 detached HEAD，无法判断该更新到哪个分支' };
  }

  let fetchError = '';
  if (fetch) {
    const fetched = await runGit(['-C', dir, 'fetch', '--quiet', '--no-tags', 'origin', branch]);
    if (!fetched.ok) fetchError = (fetched.stderr || fetched.message || 'git fetch 失败').trim().slice(0, 300);
  }

  const local = await runGit(['-C', dir, 'rev-parse', 'HEAD']);
  const remote = await runGit(['-C', dir, 'rev-parse', `origin/${branch}`]);
  if (!remote.ok) {
    return {
      ...base, available: false, branch,
      reason: fetchError || `取不到 origin/${branch}（远端分支名不对？）`,
    };
  }
  const dirtyOut = await runGit(['-C', dir, 'status', '--porcelain']);
  const dirty = dirtyOut.ok ? dirtyOut.stdout.split('\n').filter((line) => line.trim()).length : null;
  const behindOut = await runGit(['-C', dir, 'rev-list', '--count', `HEAD..origin/${branch}`]);
  const aheadOut = await runGit(['-C', dir, 'rev-list', '--count', `origin/${branch}..HEAD`]);
  const behind = behindOut.ok ? Number(behindOut.stdout.trim()) || 0 : 0;
  const ahead = aheadOut.ok ? Number(aheadOut.stdout.trim()) || 0 : 0;
  let changelog = [];
  if (behind > 0) {
    const log = await runGit(['-C', dir, 'log', '--oneline', '--no-merges', `HEAD..origin/${branch}`]);
    if (log.ok) changelog = log.stdout.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, MAX_CHANGELOG);
  }
  return {
    ...base, available: true, branch, channel: 'git',
    remoteUrl: remoteUrl.stdout.trim(),
    local: local.ok ? local.stdout.trim() : '',
    remote: remote.stdout.trim(),
    behind, ahead, dirty, changelog,
    fetchError: fetchError || undefined,
    updateAvailable: behind > 0,
    blocked: dirty > 0 ? '本地有未提交改动' : (ahead > 0 ? '本地有未推送提交（会分叉，拒绝自动合并）' : ''),
  };
}

/** 快进合并一个组件。调用方已经确认过 `updateAvailable` 与 `blocked`。 */
export async function fastForwardComponent(component) {
  const dir = normalizeDir(component?.dir);
  if (!dir) return { ok: false, error: '目录不存在' };
  const branch = String(component?.branch ?? '').trim() || DEFAULT_BRANCH;
  const merged = await runGit(['-C', dir, 'merge', '--ff-only', `origin/${branch}`], { timeout: 60_000 });
  if (!merged.ok) {
    return { ok: false, error: (merged.stderr || merged.message || '合并失败').trim().slice(0, 400) };
  }
  const head = await runGit(['-C', dir, 'rev-parse', 'HEAD']);
  return { ok: true, head: head.ok ? head.stdout.trim() : '' };
}

/**
 * @param {object} opts
 * @param {string} opts.stateDir          插件状态目录（~/.dsh/surfcore）
 * @param {() => Array} opts.components   每次调用重新解析组件清单（配置可热更新）
 * @param {(component) => string|null} [opts.blockedReason] 运行中不能更新的组件给原因（例如桌宠在跑）
 * @param {(msg:string, ...args:any)=>void} [opts.pluginLog]
 */

// ───────────────────────────── release 通道 ─────────────────────────────
// 构建产物型组件（桌宠）：源码在 git，但用户装的是 zip。检查 = 读 version.json 比版本号；
// 更新 = 下 zip → 校验 sha256 → 交给组件自己的安装器（保留用户数据由安装器负责）。

/** semver 比较：0.10.0 > 0.9.0；预发布（含 -）低于同号正式版。返回 1/0/-1。 */
export function compareVersions(a, b) {
  const core = (value) => String(value ?? '').trim().replace(/^v/i, '').split(/[-+]/)[0]
    .split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pa = core(a);
  const pb = core(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  const isPre = (value) => /[-+]/.test(String(value ?? '').trim().replace(/^v/i, ''));
  if (isPre(a) !== isPre(b)) return isPre(a) ? -1 : 1;
  return 0;
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** `file://D:/x` / `D:/x` / `https://…` → 本地路径或 null。 */
function localPathOf(urlOrPath) {
  const raw = String(urlOrPath ?? '').trim();
  if (!raw) return null;
  if (/^file:\/\//i.test(raw)) {
    try {
      let p = decodeURIComponent(new URL(raw).pathname);
      if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);      // Windows: /D:/x → D:/x
      return p;
    } catch { return null; }
  }
  if (/^[a-z]+:\/\//i.test(raw)) return null;
  return raw;
}

async function fetchJson(url, { timeout = 15_000, maxBytes = 512 * 1024 } = {}) {
  const local = localPathOf(url);
  if (local) {
    const data = readJsonSafe(local);
    return data ? { ok: true, json: data } : { ok: false, error: `读不到本地清单：${local}` };
  }
  let mod;
  try { mod = await import(/^https:/i.test(url) ? 'node:https' : 'node:http'); } catch (error) {
    return { ok: false, error: `加载网络模块失败：${String(error?.message ?? error)}` };
  }
  return new Promise((resolve) => {
    const req = mod.get(url, { timeout, headers: { 'user-agent': 'surfcore-update-check' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(fetchJson(new URL(res.headers.location, url).toString(), { timeout, maxBytes }));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); resolve({ ok: false, error: `HTTP ${res.statusCode}` }); return; }
      let size = 0;
      const chunks = [];
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) { res.destroy(); resolve({ ok: false, error: '清单太大' }); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try { resolve({ ok: true, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch { resolve({ ok: false, error: '清单不是合法 JSON' }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: '请求超时' }); });
    req.on('error', (error) => resolve({ ok: false, error: String(error?.message ?? error) }));
  });
}

async function downloadTo(url, dest, { timeout = 180_000, maxBytes = 400 * 1024 * 1024 } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const local = localPathOf(url);
  if (local) {
    try { fs.copyFileSync(local, dest); return { ok: true, bytes: fs.statSync(dest).size }; } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  }
  let mod;
  try { mod = await import(/^https:/i.test(url) ? 'node:https' : 'node:http'); } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
  return new Promise((resolve) => {
    const req = mod.get(url, { timeout, headers: { 'user-agent': 'surfcore-update-download' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(downloadTo(new URL(res.headers.location, url).toString(), dest, { timeout, maxBytes }));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); resolve({ ok: false, error: `HTTP ${res.statusCode}` }); return; }
      const out = fs.createWriteStream(dest);
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) { req.destroy(); res.destroy(); out.destroy(); resolve({ ok: false, error: '安装包太大' }); return; }
        out.write(chunk);
      });
      res.on('end', () => out.end(() => resolve({ ok: true, bytes: size })));
      res.on('error', (error) => { out.destroy(); resolve({ ok: false, error: String(error?.message ?? error) }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: '下载超时' }); });
    req.on('error', (error) => resolve({ ok: false, error: String(error?.message ?? error) }));
  });
}

function sha256File(file) {
  try {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return '';
  }
}

/** 清单里的 file/files → 当前平台那一个。 */
function pickReleaseAsset(manifest) {
  const list = Array.isArray(manifest?.files) ? manifest.files : (manifest?.file ? [manifest.file] : []);
  if (!list.length) return null;
  const platformKey = process.platform === 'win32' ? 'win' : process.platform;
  return list.find((item) => item && typeof item === 'object'
    && (!item.platform || String(item.platform).toLowerCase().startsWith(platformKey))) ?? list[0];
}

/** 已装版本：默认读安装目录里的 package.json。 */
function installedVersionOf(component) {
  const dir = normalizeDir(component?.dir);
  if (!dir) return null;
  const file = component?.versionFile ? path.resolve(dir, String(component.versionFile)) : path.join(dir, 'package.json');
  const pkg = readJsonSafe(file);
  return pkg && typeof pkg === 'object' ? { name: pkg.name ?? '', version: String(pkg.version ?? '') } : null;
}

/** 检查一个 release 组件：读已装版本 + 拉 version.json 比版本号。 */
export async function inspectReleaseComponent(component, { fetch = true } = {}) {
  const id = String(component?.id ?? '').trim();
  const name = String(component?.name ?? id);
  const dir = normalizeDir(component?.dir);
  const base = { id, name, dir: dir || String(component?.dir ?? ''), kind: component?.kind ?? 'release', channel: 'release' };
  if (!id) return { ...base, available: false, reason: '组件缺少 id' };

  const installed = installedVersionOf(component);
  const versionUrl = String(component?.versionUrl ?? '').trim();
  if (!versionUrl) {
    return {
      ...base, available: false,
      installedVersion: installed?.version ?? null,
      reason: installed ? '没有配置 versionUrl（无法查新版）' : '未安装，且没有配置 versionUrl',
    };
  }
  if (!fetch) {
    return { ...base, available: false, installedVersion: installed?.version ?? null, reason: '本次未拉取版本清单' };
  }
  const remote = await fetchJson(versionUrl);
  if (!remote.ok) {
    return {
      ...base, available: false,
      installedVersion: installed?.version ?? null,
      reason: `取不到版本清单：${remote.error}`,
    };
  }
  const manifest = remote.json ?? {};
  const latestVersion = String(manifest.version ?? '').trim();
  const asset = pickReleaseAsset(manifest);
  if (!latestVersion || !asset?.url) {
    return {
      ...base, available: false,
      installedVersion: installed?.version ?? null,
      reason: '版本清单缺少 version 或下载地址',
    };
  }
  const notes = String(manifest.notes ?? manifest.changelog ?? '').trim();
  const changelog = notes ? notes.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, MAX_CHANGELOG) : [];
  const comparison = installed?.version ? compareVersions(latestVersion, installed.version) : 1;
  return {
    ...base, available: true,
    installedVersion: installed?.version ?? null,
    latestVersion,
    remote: `v${latestVersion}`,
    updateAvailable: comparison > 0,
    behind: comparison > 0 ? 1 : 0,
    ahead: 0,
    dirty: null,
    blocked: '',
    changelog,
    asset: { url: String(asset.url), sha256: asset.sha256 ? String(asset.sha256) : '', size: Number(asset.size) || 0 },
    reason: installed ? '' : '未安装（可以直接安装这一版）',
  };
}

/** 下一份 release 安装包到本机并校验；返回本地路径。 */
export async function downloadReleaseAsset(component, report, { stateDir, pluginLog = () => {} } = {}) {
  const asset = report?.asset;
  if (!asset?.url) return { ok: false, error: '清单里没有下载地址' };
  const ext = /\.zip(\?|$)/i.test(asset.url) ? '.zip' : '';
  const dir = path.join(stateDir, 'downloads');
  const dest = path.join(dir, `${String(component.id)}-${String(report.latestVersion ?? 'latest')}${ext}`);
  const downloaded = await downloadTo(asset.url, dest, { maxBytes: Math.max(asset.size || 0, 400 * 1024 * 1024) });
  if (!downloaded.ok) return { ok: false, error: `下载失败：${downloaded.error}` };
  if (asset.sha256) {
    const actual = sha256File(dest);
    if (actual.toLowerCase() !== asset.sha256.toLowerCase()) {
      try { fs.rmSync(dest, { force: true }); } catch {}
      return { ok: false, error: `校验失败（sha256 不匹配：${actual.slice(0, 12)}…）` };
    }
  } else if (Number(asset.size) > 0 && downloaded.bytes !== Number(asset.size)) {
    try { fs.rmSync(dest, { force: true }); } catch {}
    return { ok: false, error: '校验失败（大小不符）' };
  } else {
    pluginLog(`[updates] ${component.id} 的清单没有 sha256，只校验了大小`);
  }
  return { ok: true, path: dest, bytes: downloaded.bytes };
}

export function createUpdatesService({ stateDir, components, blockedReason = () => '', pluginLog = () => {} }) {
  const file = path.join(stateDir, 'updates.json');
  const now = () => Date.now();
  let state = { dismissed: {}, lastCheckAt: 0, results: [], lastError: '' };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && typeof raw === 'object') {
      state = {
        dismissed: raw.dismissed && typeof raw.dismissed === 'object' ? raw.dismissed : {},
        lastCheckAt: Number(raw.lastCheckAt) || 0,
        results: Array.isArray(raw.results) ? raw.results : [],
        lastError: String(raw.lastError ?? ''),
      };
    }
  } catch { /* 第一次跑 / 文件坏了：用默认值，不炸 */ }

  let checking = false;
  let applying = false;
  let timer = null;

  function persist() {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch (error) {
      pluginLog('[updates] 写状态失败：', String(error?.message ?? error));
    }
  }

  function list() {
    try {
      return (components() ?? []).filter((item) => item && item.id && item.dir);
    } catch (error) {
      pluginLog('[updates] 解析组件清单失败：', String(error?.message ?? error));
      return [];
    }
  }

  /** 这批结果里"值得提示"的项：有更新，且这次的远端 commit 没被 dismiss 过。 */
  function pendingOf(results) {
    return (results ?? []).filter((item) => item?.available && item.updateAvailable
      && state.dismissed[item.id] !== item.remote);
  }

  function status() {
    const results = state.results ?? [];
    const pending = pendingOf(results);
    return {
      ok: true,
      checking,
      applying,
      lastCheckAt: state.lastCheckAt || null,
      lastError: state.lastError || '',
      results,
      pending,
      pendingCount: pending.length,
      showPrompt: pending.length > 0,
    };
  }

  async function check({ fetch = true } = {}) {
    if (checking) return status();
    checking = true;
    try {
      const items = list();
      const results = [];
      for (const item of items) {
        try {
          results.push(await inspectComponent(item, { fetch }));
        } catch (error) {
          results.push({
            id: item.id, name: item.name ?? item.id, dir: item.dir, available: false,
            reason: String(error?.message ?? error),
          });
        }
      }
      state = { ...state, results, lastCheckAt: now(), lastError: '' };
      persist();
      pluginLog(`[updates] 检查完成：${pendingOf(results).length} 个组件有更新`);
      return status();
    } catch (error) {
      state = { ...state, lastError: String(error?.message ?? error), lastCheckAt: now() };
      persist();
      return status();
    } finally {
      checking = false;
    }
  }

  /** 应用更新：只更新点名的那几个组件。返回每一项的结果。 */
  async function apply(ids) {
    if (applying) return { ok: false, error: '正在更新中，请稍候', results: [] };
    const wanted = new Set((Array.isArray(ids) ? ids : []).map(String));
    if (!wanted.size) return { ok: false, error: '没有选择要更新的组件', results: [] };
    applying = true;
    try {
      // 更新前重新检查一次：用户可能刚改过文件、远端也可能又变了
      await check({ fetch: true });
      const all = list();
      const results = [];
      for (const item of all) {
        if (!wanted.has(String(item.id))) continue;
        const report = (state.results ?? []).find((row) => row.id === item.id);
        if (!report?.available) { results.push({ id: item.id, ok: false, error: report?.reason ?? '不可用' }); continue; }
        if (!report.updateAvailable) { results.push({ id: item.id, ok: true, skipped: true, message: '已是最新' }); continue; }
        if (report.blocked) { results.push({ id: item.id, ok: false, error: report.blocked }); continue; }
        const blocked = blockedReason(item);
        if (blocked) { results.push({ id: item.id, ok: false, error: blocked }); continue; }

        if (report.channel === 'release') {
          // 构建产物型（桌宠）：下 zip → 校验 → 交给组件自己的安装器。
          const downloaded = await downloadReleaseAsset(item, report, { stateDir, pluginLog });
          if (!downloaded.ok) { results.push({ id: item.id, ok: false, error: downloaded.error }); continue; }
          if (typeof item.installZip !== 'function') {
            results.push({ id: item.id, ok: false, error: '这个组件没有配置安装器（installZip）' });
            continue;
          }
          let installed;
          try { installed = await item.installZip(downloaded.path, { report }); }
          catch (error) { installed = { ok: false, error: String(error?.message ?? error) }; }
          try { fs.rmSync(downloaded.path, { force: true }); } catch {}
          if (!installed?.ok) { results.push({ id: item.id, ok: false, error: installed?.error ?? '安装失败' }); continue; }
          results.push({
            id: item.id, ok: true, from: report.installedVersion, to: report.latestVersion,
            message: `${report.name} 已更新到 v${report.latestVersion}`,
            restart: '重启桌宠',
          });
          continue;
        }

        const merged = await fastForwardComponent({ ...item, branch: report.branch });
        if (!merged.ok) { results.push({ id: item.id, ok: false, error: merged.error }); continue; }
        results.push({
          id: item.id, ok: true, from: report.local, to: merged.head,
          message: `${report.name} 已更新（${report.behind} 个提交）`,
          restart: String(item.id).startsWith('surfvoice') ? '重启对应语音服务' : (item.id === 'surfcore' ? '重启 DSH' : '重启对应组件'),
        });
      }
      // 更新完再体检一次，让界面拿到最新状态
      await check({ fetch: false });
      const changed = results.filter((row) => row.ok && !row.skipped);
      return {
        ok: results.every((row) => row.ok),
        results,
        updated: changed.length,
        restartRequired: changed.length > 0,
        status: status(),
      };
    } finally {
      applying = false;
    }
  }

  /** "不再提示本次更新"：把当前远端 commit 记下来；远端再往前走会重新提示。 */
  function dismiss(ids) {
    const wanted = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
    for (const row of state.results ?? []) {
      if (!row?.available || !row.updateAvailable) continue;
      if (wanted && !wanted.has(String(row.id))) continue;
      state.dismissed[row.id] = row.remote;
    }
    persist();
    return status();
  }

  /** 清掉"不再提示"，让下一次检查重新提示（界面上的"恢复提示"）。 */
  function resetDismissed() {
    state.dismissed = {};
    persist();
    return status();
  }

  function startAutoCheck({ delayMs = 20_000, intervalMs = 6 * 60 * 60 * 1000, enabled = true } = {}) {
    if (!enabled || timer) return;
    const first = setTimeout(() => { void check(); }, Math.max(1_000, Number(delayMs) || 20_000));
    first.unref?.();
    timer = setInterval(() => { void check(); }, Math.max(10 * 60_000, Number(intervalMs) || 6 * 60 * 60 * 1000));
    timer.unref?.();
  }

  function dispose() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { check, apply, dismiss, resetDismissed, status, startAutoCheck, dispose, file };
}
