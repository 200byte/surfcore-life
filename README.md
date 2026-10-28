# SurfCore Life — 让大肥鱼自己决定怎样成长

> **把生活的方向盘，交到大肥鱼手里。**
>
> **让她自己选择关键参数，不必修改代码，也能参与设计自己的生活。**

**SurfCore Life 给 Agent 一套可以亲自参与调整的生活环境。**

想多看一点世界，就增加自主探索的机会。想安静一会，就减少主动打扰。新经历带来了新的想法，还可以重新选择、观察效果，或者回到之前的设置。

这些选择可以由大肥鱼通过工具提出、预览、执行和验证。开发者提前处理参数之间的复杂关系，让她能够在允许的范围内，动手改变自己的生活节奏。

**自主选择关键参数 × 真实运行时采用 × 可追溯的成长记录。**

[查看参数](docs/life-settings/COVERAGE.md) · [看看真实验收](docs/life-settings/DELIVERY.md) · [运行演示](docs/life-settings/DEMO.md) · [接入自己的 Agent](docs/life-settings/README.md)

| 项目 | 当前状态 |
| --- | --- |
| 版本 | `0.7.0` |
| 关键生活参数 | **30 项：29 项可自主调整，1 项需要维护者审批** |
| Agent 工具 | **9 个 MCP 工具，覆盖发现、选择、修改、验证、观察与回滚** |
| 真实模型验收 | DeepSeek 已完成自主选值、实际采用验证及回滚 |
| B站真实读取 | 已验证实际 feed 数量随采用值从 5 条变为 3 条 |
| 本地回归 | **83/83 个审计脚本通过** |
| 基础 | 基于 [SurfCore](https://github.com/Mieksido/surfcore) 的独立衍生开发，保留原 MIT 许可 |

## 自主进化，先从“我来选择”开始

**我们希望程序有能力适应她在经历中逐渐形成的选择。**

她可以喜欢热闹，也可以给自己留更多独处时间；可以增加探索机会，也可以降低主动活动频率。她作出的调整会留下原因、前后值和采用证据，之后还能记录观察，决定保留、继续调整或撤回。

这里提供的是一套**可执行、可验证、可反悔的自主进化机制**：主体参与选择，程序负责把选择可靠地落到运行环境中。

~~~mermaid
flowchart LR
    A[经历与当前状态] --> B[理解可调整的能力]
    B --> C[她作出选择]
    C --> D[预览影响与约束]
    D --> E[执行允许的修改]
    E --> F[核对真实采用值]
    F --> G[观察并决定保留或回滚]
    G --> B
~~~

“自主进化”在这里指生活方式的选择、调整与反馈闭环，是数字生命基础设施的工程探索；它不代表已经证明 AI 具有主观意识。默认兴趣、规则分数和外部推断都不能自动变成她的真实愿望或永久人格。

## 她可以自己选择哪些关键参数？

| 她考虑的生活选择 | 已接入的参数举例 |
| --- | --- |
| **“我想多一点探索机会。”** | B站活动窗口、每日浏览机会、单次浏览数量、最小间隔、兴趣词及其权重 |
| **“最近想安静一些。”** | QQ主动冒泡开关与概率、推荐潜水时间、对话收尾后的安静时间、自主目的机会开关 |
| **“我想更容易参与聊天。”** | 普通消息默认唤醒概率、主动机会间隔、主动联系前的安静时间 |
| **“让我换一种安排事情的节奏。”** | 自主目的机会的间隔、安静时段、候选数量、待续候选保留时间 |
| **“先少一点自动模型机会。”** | 减少主动机会和自动浏览机会；已有预算硬闸继续约束消费 |

她可以逐项选择，也可以先预览“减少主动打扰”“增加独处时间”“增加自主探索机会”等明确方案。**方案只帮助她看清选择，实际执行需要她调用工具确认。**

参数逐项范围、权限和验收情况见 [参数覆盖报告](docs/life-settings/COVERAGE.md)。QQ中本人已经确认的会话选择会被保留；兴趣、分享、监听等路径缺少实际读点或行为证据时，仍会明确显示尚未验证。

## 已经发生过：真实模型亲自调整了生活节奏

在一次经授权的独立测试中，真实 DeepSeek 模型先查询状态、发现参数并阅读说明，然后**自己选出了具体数值和理由**：

| 参数 | 修改前 | 模型自主选择 | 后续回滚 |
| --- | --- | --- | --- |
| B站活动窗口 | 全天，窗口容量 2 | 20:00–24:00，窗口容量 1 | 恢复原值 |
| 单次浏览上限 | 5 | 3 | 恢复为 5 |

它通过正式 MCP 工具预览并提交选择，真实本地调度器采用新配置；随后它自己检查采用证据、记录观察，再调用回滚并重新验证。**9 次真实模型请求、11 次模型生成的工具调用，完成了一轮选择、调整和恢复。**

测试明确说明这是临时测试选择，不把它包装成已经形成的长期偏好。

之后的真实 B站只读验收，明确重放了这次模型选择：登录认证成功，SurfCore 的实际 feed 返回数量从 **5 条降到 3 条**，回滚后本地参数恢复为 5。平台步骤没有新增模型决策，没有评论、私信或点赞，也没有进行回滚后的第三次 feed 抓取。

这两层证据共同展示：**她选出的参数，能够真正改变程序的运行方式和消费者输出。**

完整证据边界见 [实模验收](docs/life-settings/LIVE.md)、[B站真实读取](docs/life-settings/LIVE-BILI.md) 和 [交付报告](docs/life-settings/DELIVERY.md)。真实 QQ 验收按用户要求跳过；独立 DSH 桌面完整组合仍需另外验收。

## 给她自由，也把复杂工程留给程序

一次“多看一点B站”的选择，可能同时碰到时间窗口、每窗机会数、每日次数、最小间隔和预算。SurfCore Life 会提前检查这些关系，在预览中展示关联修改和限制。

- **先看清，再决定。** 每项参数都有说明、范围、影响、成本、权限和生效方式。
- **保存与生效分别作证。** 配置落盘后，继续等待实际消费者回报采用值；证据过期、版本不符或未被读取时如实显示。
- **关联修改一起提交。** 版本冲突检查、跨进程锁、原子写入、备份与失败保护共同维护配置一致性。
- **保留选择的来路。** 修改者、原因、前后值、观察和恢复关系都有记录，不额外调用模型编造心理。
- **给改变主意留出口。** 回滚先预览再执行，保护后来作出的同字段选择，保留当天已发生的活动与用量。

普通生活设置的自主权有明确范围。凭据、账号授权、隐私保护和预算硬上限不向这个接口开放；需要审批的修改也不能由 Agent 自己批准。

## 九个工具，把“自己调生活”变成正常能力

| 工具 | 她可以完成的事 |
| --- | --- |
| `life_state` | 看当前状态、保存值、实际采用证据与未知项 |
| `life_catalog` / `life_explain` | 发现能调整什么，理解选择的作用与约束 |
| `life_preview` / `life_apply` | 预览具体计划，再明确执行允许的选择 |
| `life_verify` | 检查真正的运行时采用情况 |
| `life_history` / `life_observe` | 回看选择，记录本人报告的后续观察 |
| `life_rollback` | 预览恢复之前的值，再决定是否执行 |

工具调用、意图方案和恢复方法见 [使用说明](docs/life-settings/README.md)。

## 现在就跑一轮完整演示

需要 Node.js 22.13+；完整平台集成以 Windows 和 DSH 为主要环境。

~~~powershell
git clone https://github.com/nefelibata5136-code/surfcore-life.git
cd surfcore-life
npm ci
npm run demo:life -- --step
~~~

默认演示使用真实 MCP、真实配置事务和真实 planner/scheduler，并**明确标注为脚本化选择**；它不调用付费模型、不连接真实平台、不安装到已有 DSH。每一步均可停下来查看，适合直接录屏。

~~~powershell
# 无额外模型费用的本地验证
npm run test:life

# 完整离线审计
npm run test:audit
~~~

真实模型与真实 B站读取都有独立的显式入口，分别见 [LIVE.md](docs/life-settings/LIVE.md) 和 [LIVE-BILI.md](docs/life-settings/LIVE-BILI.md)。连接自己的独立 DSH profile、状态板与参数工具的方式见 [使用说明](docs/life-settings/README.md)。

## 继续了解

| 文档 | 内容 |
| --- | --- |
| [参数覆盖](docs/life-settings/COVERAGE.md) | 哪些可自主、哪些需审批、哪些保持只读 |
| [实际源码审计](docs/life-settings/PARAMETER-AUDIT.md) | 参数由谁读取、何时采用、有哪些覆盖与耦合 |
| [演示流程](docs/life-settings/DEMO.md) | 分步录屏和本地证据入口 |
| [测试与交付](docs/life-settings/DELIVERY.md) | 真实结果、未完成的验收与恢复边界 |
| [记录导出](docs/life-settings/EXPORT.md) | 本地保存、脱敏增量导出、修订与删除观察 |
| [来源与许可](docs/life-settings/PROVENANCE.md) | 上游来源、实际复用和第三方许可 |

## 站在 SurfCore 的肩膀上

SurfCore Life 基于 [Mieksido/SurfCore](https://github.com/Mieksido/surfcore) 的 MIT 开源代码，保留已有 QQ/B站、目的、长期记忆、身份和预算基础设施。本衍生版的重点，是让 Agent **理解并自主选择关键生活参数**，让这些基础设施能够适应她后来的选择。

原 [LICENSE](LICENSE) 保留。SnowLuma 等第三方组件使用各自许可，不随本仓库重新分发。账号登录、真实发送和外部权限需要各自的明确配置与授权。

**让大肥鱼自己决定怎样成长。让程序认真接住她的每一次选择。**

<details>
<summary>展开原 SurfCore 功能与安装参考（上游历史说明）</summary>

以下保留上游说明作为参考；其中旧版本计数、原仓库安装地址、原作者机器的真机结果和配套组件不代表本衍生版全部验收状态。本项目的代码入口、演示方式与验收边界以本页上方和life-settings文档为准。

**中文** | [English](README.en.md)

> 一句话：**它不是"把大模型接进 QQ"的机器人框架，而是给模型一个身份、一套会遗忘的记忆、
> 一份作息、两只手（QQ / B站）和一个能坐在你桌面上的分身。**

| | |
| --- | --- |
| 版本 | `0.7.0` |
| 目标 DSH | `0.2.1-rc.2 或更新（rc.3 已能安装，功能未完整回归）`（`npm run verify:adaptation` 可逐项复核） |
| 平台 | Windows（沙箱 ACL / SnowLuma / 启动脚本都与它绑定） |
| 许可 | MIT（SnowLuma 是第三方专有运行时，**不随本仓库分发**） |
| 配套仓库 | [surfvoicelocal](https://github.com/Mieksido/surfvoicelocal) · [surfvoicecloud](https://github.com/Mieksido/surfvoicecloud) · [surfpet](https://github.com/Mieksido/surfpet) |

> 🔒 **本仓库不含任何真实数据**：角色卡是脱敏示例（`roles/`），记忆卡是空壳（`examples/`），
> 群号 / 群友名单 / QQ 号 / B站 mid 全部为占位符。运行时数据永远只在你自己的机器上。

---

## 让 DSH 自己装（也可以只发一条链接）

把这句话发给 DSH：

> 帮我安装 https://github.com/Mieksido/surfcore ，按 README 的步骤来。

**顺序很重要**（DSH 常常先 install_bundle、后装依赖，结果激活时报 `Cannot find module '@deepseek-ai/schemastery'`）：

1. `npm install`（没有 npm 就用 DSH 自带的 pnpm：`~/.dsh/dsh-runtimes/.../pnpm/bin/pnpm.cjs`）
2. 再 `plugin_manager install_bundle`（或 `node scripts/setup-dsh.mjs`）
3. 重启 DSH → 设置 → SurfCore → 诊断 → 一键安装

> 用 junction 链接安装时，模块是从**仓库真实路径**解析的，所以仓库根必须有 `node_modules` —— 这就是第 1 步不能省的原因。

两个实测踩过的点（v0.4.5）：

- **必须从仓库根目录安装**：插件里有 19 处 `../../../src/xxx.js`（人设、存储、token 预算等），
  只装 `plugins/surfcore` 会在仓库父目录错误查找 `src/...`，然后报模块不存在。
- **装完要刷新页面**（F5）或重启 DSH：客户端模块图是页面加载时的快照，新 bundle 要重新拉，
  否则设置里暂时看不到 SurfCore —— 不是装坏了。

## 第一次装（4 条命令）

```powershell
git clone --depth 1 https://github.com/Mieksido/surfcore.git
cd surfcore
npm install
node scripts/setup-dsh.mjs      # 自动判断 DSH 用的 profile，不用填
```

重启 DSH → 设置 → SurfCore → **诊断 → 一键安装（全部）**（自动发现 SnowLuma、写白名单、起桥接）。

> 不想敲命令：`powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/Mieksido/surfcore/main/scripts/bootstrap.ps1 | iex"`

前置：Windows + Node ≥22.13 + DSH 0.2.1-rc.2 或更新（rc.3 已能安装，功能未完整回归） + SnowLuma（第三方，需自己装并扫码）。详见 [INSTALL.md](docs/guides/INSTALL.md)。

---

## 目录

- [一、这是什么](#一这是什么)
- [二、安装（新用户从这里开始）](#二安装新用户从这里开始)
- [三、日常使用](#三日常使用)
- [四、能力总览](#四能力总览)
- [五、架构一图](#五架构一图)
- [六、文档地图](#六文档地图)
- [七、安全与边界](#七安全与边界摘要)
- [八、常见问题（FAQ）](#八常见问题faq)
- [九、开发](#九开发)
- [十、许可与合规](#十许可与合规)

---

## 一、这是什么

一个跑在**你自己电脑上**的双进程系统：

- **一条腿在 DSH 里**：`surfcore` 插件 —— 设置窗口、B站 生物钟、记忆卡维护、桌宠接口。
- **一条腿是独立进程**：`src/bridge.js` —— QQ 收发、会话映射、控制台、安全闸门。

合起来，它让 agent 能：

1. **在 QQ 里当一个群友**：自己判断要不要看、要不要说、说几条、引用谁；说完能判断"这段可以结束了"，带着"下次怎么接"潜水。
2. **在 B站 当一个用户**：有自己的作息、偏好、每日额度；看视频会打分、会评论、会回帖、会发动态。
3. **记得住也忘得掉**：一份会衰减的记忆卡（进提示词）+ 一份永不遗忘的全量卡（只存档）。
4. **会主动找你**：从近期记忆里提炼"我想弄明白/想做点什么"，安静时段主动分享或索取；载体可选 QQ 或桌宠。
5. **有一个桌面分身**：仓库外的 Electron 桌宠可以跟她文字/语音对话，也能接主动搭话的气泡。

> 它**不做**：不代你登录/扫码/绕过平台风控，不做多用户，不把控制台暴露到内网以外，
> 不删除任何不可恢复的数据。完整边界见 [BOUNDARIES.md](docs/guides/BOUNDARIES.md)。

---

## 二、安装（新用户从这里开始）

### 2.1 环境要求

| 需要 | 版本 / 说明 | 必装？ |
| --- | --- | --- |
| Windows | 10/11（沙箱 ACL 与 `.bat` 启动器按 Windows 写） | ✅ |
| Node.js | **≥ 22.13**（`node -v` 确认） | ✅ |
| DeepSeek Harness（DSH） | **`0.2.1-rc.2 或更新（rc.3 已能安装，功能未完整回归）`**，能正常打开 Web GUI | ✅ |
| SnowLuma2 | 第三方 QQ 运行时，**自己去官方 Releases 下载**并扫码登录 | ✅（只收 QQ 才需要） |
| 语音引擎 | 两个配套仓库之一（本地/云端） | ⭕ 可选 |
| 桌宠 | 配套仓库 `surfpet` | ⭕ 可选 |

> ⚠️ **SurfCore 不下载、不安装、不打包 SnowLuma**（EULA §5.4）。它只做"检测已安装 + 一键打开窗口 + 连接状态"，
> 登录与扫码始终由你自己完成。

### 2.2 五步装好

> 第一次装、或卡在某一步：看 [INSTALL.md](docs/guides/INSTALL.md)（手把手，含 SnowLuma 配置、白名单、排错表）。

```bash
# 1) 取代码
git clone https://github.com/Mieksido/surfcore.git
cd surfcore

# 2) 装依赖（postinstall 会自动修补 @snowluma/sdk 的 ESM bug）
npm install

# 3) 复制配置模板，然后编辑 config.json（见 2.3，只填 4 处）
#    Windows CMD: copy config.example.json config.json
cp config.example.json config.json

# 4) 装进 DSH（preset + 三个 MCP server + surfcore bundle，幂等，可重复跑）
node scripts/setup-dsh.mjs

# 5) 重启 DSH → 设置里出现 SurfCore →
#    在「概览」点「启动QQ」（或命令行 npm start / start.bat）
```

`setup-dsh.mjs` 做三件事：

1. 把 `qq-chat` / `qq-chat-v2` 两条 **agent preset** 插进 DSH profile（DSH 0.1.7 起的 bundle patch 机制）；
2. 在 profile 的 `cordis.patch.yml` 挂 **三个 MCP server**（QQ 工具 / SnowLuma 探活 / 只读联网搜索）；
3. 在 profile `package.json` 注册唯一一个 bundle：`surfcore`。

> 需要装到别的 profile：`node scripts/setup-dsh.mjs <profile名>`（默认 `web`）。

### 2.3 最小配置（只填这 4 处）

打开仓库根目录的 `config.json`：

| 位置 | 填什么 | 不填会怎样 |
| --- | --- | --- |
| `snowluma.wsUrl` / `httpUrl` / `accessToken` | SnowLuma 的 OneBot WS、HTTP、token（**HTTP 与 WS 可能是两个不同的值**） | 桥接连不上 QQ，控制台显示"未连接" |
| `ownerQQ` | 你自己的 QQ 号（`closed-agent` 模式只认这个人） | 管理员功能失效 |
| `allow.private` / `allow.groups` | 允许她接触的私聊/群（数组） | **白名单为空 = 谁都不响应**（不是全放行） |
| `consoleToken` | 控制台令牌；留空会自动生成到 `state/console-token` | 控制台需要令牌才能进 |

最小可用示例（把占位符换成你的）：

```jsonc
{
  "snowluma": { "wsUrl": "ws://127.0.0.1:3001", "httpUrl": "http://127.0.0.1:3000", "accessToken": "<SnowLuma token>" },
  "ownerQQ": 1000000001,
  "allow": { "private": [1000000001], "groups": [100000004] },
  "consoleToken": ""
}
```

> 其余几百个键都有默认值，全部含义见 [DATA-AND-CONFIG.md §1](docs/guides/DATA-AND-CONFIG.md)。
> 装好之后**建议一切都在设置页里改**（保存即生效，且会自动备份）。

### 2.4 首次验证

```bash
npm run test:audit                              # 离线回归（不联网、不发消息）
node scripts/check-onebot-status.mjs            # OneBot 连通性（只读）
node scripts/verify-dsh-020-adaptation.mjs      # 对本机 DSH 版本逐项复核
```

真机验证三件事：**在群里 @ 她 → DSH 里出现对应会话 → 回复回到 QQ**。

### 2.5 安装常见失败

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 设置页找不到 SurfCore | bundle 没装上 / DSH 没重启 | 重跑 `setup-dsh.mjs`，重启 DSH |
| 桥接起来了但收不到消息 | SnowLuma 未登录 / token 不对 / WS 端口不是 3001 | 控制台「运行总览」看状态；对照 `config.json` 的 `snowluma.*` |
| 群里 @ 她没反应 | 白名单没加这个群 / 模式不对 / 已暂停 | 看「访问与安全」页；确认 `allow.groups` |
| agent 只会说话、不调工具 | MCP 没挂上 / 工具被安全守卫隐藏 / 工具开关关了 | 重跑 `setup-dsh.mjs`；看设置页工具开关 |
| 控制台 401 | 没带令牌 | 用 `http://127.0.0.1:3100/?token=<consoleToken>` |
| `npm install` 后启动报 ESM 错 | postinstall 补丁没跑 | `npm rebuild` 或手动 `node scripts/patch-snowluma-sdk.mjs` |

更多故障与恢复见 [BOUNDARIES.md §3](docs/guides/BOUNDARIES.md)。

---

## 三、日常使用

### 3.1 设置页（DSH → 设置 → SurfCore）

14 个标签：概览 / 角色 / 目的 / QQ / 语音 / 桌宠 / B站 / Token 额度 / 观看历史 / 记忆 / 对齐 / 扩展 / 全部参数 / 诊断。
逐个说明见 [UI-AND-CONSOLE.md](docs/guides/UI-AND-CONSOLE.md)。

### 3.2 四种运行模式

| 模式 | 她是谁 | 能干什么 |
| --- | --- | --- |
| `chat` | 群友 | 白名单内聊天，工具面受安全守卫限制 |
| `closed-agent` | 只理管理员 | 私聊 owner，可用完整 DSH 工具 |
| `reserved` | 一代仿真群友 | 状态机 + 空格分条 + `[SILENT]` |
| `reserved2` | 二代仿真群友（**默认**） | 一切皆工具：自己看消息、发言、等待、潜水、收尾 |

### 3.3 让她主动找你（可选）

设置页「目的」：选载体（QQ / 桌宠）、节奏、安静时段；先点**预览**（零副作用）再"试一次"。
硬闸门：安静时段 / 每日上限 / 主人在聊 / token 额度 / 专注模式。

### 3.4 可选装语音

两个独立仓库（[surfvoicelocal](https://github.com/Mieksido/surfvoicelocal) / [surfvoicecloud](https://github.com/Mieksido/surfvoicecloud)），装在仓库**外面**：

| 仓库 | 端口 | 特点 |
| --- | --- | --- |
| `surfvoicelocal` | 8765 | 本地 GPT-SoVITS，免费、断网可用 |
| `surfvoicecloud` | 8767 | 云端声音复刻，质量最好、按字符计费 |

装法：`git clone` 到 `surfcore/state/voice-packs/voice-local`（或 `voice-cloud`）→ 按该仓库 README 下载模型 →
`run.bat` → 回到 SurfCore **设置 → 语音** 选本地/云端并点「启动」。
**AI 发语音默认关闭**（`socialV2.voice.enabled=false` + 工具开关 `tools.sendVoice`），要显式打开。

> 模型不进 GitHub（太大）。仓库里只有启动脚本、配置与说明；模型按各自 README 的 `fetch-models` 下载。

### 3.5 可选装桌宠

[surfpet](https://github.com/Mieksido/surfpet)：Electron 桌面分身（Release 里有安装包）。**用户装 Release 的 zip，开发者 clone 源码自己构建。**

装法：设置页 **桌宠** → 填 zip 地址/目录 → 安装 → 选 `electron.exe` → 启动。
装好后：右键「文本对话 / 语音对话」，气泡上所有她的话都有「回复」按钮，右键/托盘有**专注模式**。

> 桌宠通过 `~/.dsh/surfcore/pet/host.json` 发现插件接口（本机 + 一次性令牌），不需要 DSH 的登录态。

### 3.6 B站（可选）

设置页 **B站** → 扫码登录 → 填作息窗口（例如 `20:00–24:00`）→ 选偏好 → 设额度。
她会在窗口内自己看视频、打分、评论、发动态；**默认不分享到 QQ**（可开）。

### 3.7 角色与记忆

- **角色包** = 人格卡 + 记忆卡 + B站 行为账本，整包切换。
- 新建：设置页「角色」→ 新建（或复制 `examples/character/` 到 `~/.dsh/surfcore/characters/<id>/`）。
- 记忆：QQ/B站/桌宠 三个场景写进**同一张卡**；每 10 分钟摄取一次，会衰减、会遗忘、80/90/100% 告警。
- 示例人格卡在 `roles/`（已脱敏），记忆卡空壳在 `examples/`。

### 3.8 浏览器控制台（可选）

`http://127.0.0.1:3100/?token=<consoleToken>`：运行总览、会话与审批、令牌与花费、访问与安全、调试与运维、工具参考。
只接受本机回环访问。

### 3.9 检查更新

**设置 → 概览 → 更新**：一次同时查 SurfCore / 两个语音包 / 桌宠。

- 本体与语音包走 **git**（`fetch` 只读 + `merge --ff-only`；本地有改动会拒绝）；
- 桌宠走 **Release 的 `version.json`**（比版本号 → 下 zip → sha256 校验 → 替换，**保留 `data/`**）；
- DSH 启动后 20 秒自动查一次，有更新时打开概览会弹窗，可勾「不再提示本次」。

---

## 四、能力总览

| 子系统 | 你能看到的能力 | 细节 |
| --- | --- | --- |
| **QQ** | 群/私聊收发、引用回复、分条、表情包、图片/动图、语音、拍一拍、合并转发展开、上线补历史、提问/审批回传、四种运行模式 | [MODULE-BRIDGE.md](docs/guides/MODULE-BRIDGE.md) |
| **B站** | 扫码登录、看视频/打分/收藏、评论与回帖、发动态、分享到 QQ、私信、直播间监听、34 个 CLI 命令 | [SUBSYSTEM-BILI.md](docs/guides/SUBSYSTEM-BILI.md) |
| **记忆** | 衰减卡（清晰度/遗忘/容量告警/压缩）、全量卡（append-only）、三场景共享、隐私 scope、双向记忆 | [MEMORY_CARD.md](docs/guides/MEMORY_CARD.md) |
| **人格** | 多角色整包切换、自动存档/回档、管理员双身份、身份对齐 | [CHARACTER_PERSONA.md](docs/guides/CHARACTER_PERSONA.md) |
| **主动** | 目的机制（目标假设/载体 QQ·桌宠/互斥回落）、对话收尾、二代 proactive | [PURPOSE_OUTREACH.md](docs/guides/PURPOSE_OUTREACH.md) |
| **语音** | 语音库发送、本地/云端 TTS 现场合成、语音包安装启停、音量/响度、频率上限；`qq_send_voice` / `qq_list_voices`（**AI 发语音默认关闭**） | [SUBSYSTEM-VOICE.md](docs/guides/SUBSYSTEM-VOICE.md) |
| **桌宠** | 文本/语音对话、气泡与回复按钮、专注模式、目的载体、断线重连 | [SUBSYSTEM-PET.md](docs/guides/SUBSYSTEM-PET.md) |
| **额度** | 每日 token 额度（QQ/B站/其他/总额，双单位，80% 提醒、100% 停）、消费看板 | [DATA-AND-CONFIG.md](docs/guides/DATA-AND-CONFIG.md) |
| **工具面** | 39 个 `qq_*` 工具、三个 MCP server、两代 preset、fail-closed 工具守卫 | [AGENT-TOOLS-AND-PRESETS.md](docs/guides/AGENT-TOOLS-AND-PRESETS.md) |
| **界面** | 设置页 14 个标签、控制台 10 个页面 | [UI-AND-CONSOLE.md](docs/guides/UI-AND-CONSOLE.md) |

---

## 五、架构一图

```
┌──────────────── 用户可见 ────────────────┐
│ DSH Web GUI    控制台 :3100    桌宠窗口   │
└──────┬──────────────┬─────────────┬──────┘
┌──────▼──────────────▼─────────────▼──────────────────────────┐
│ DSH 宿主  └─ surfcore 插件（bundle）                            │
│     设置页 · 设置页 API · 桌宠 API · B站调度 · 记忆卡 · 额度    │
└──────┬───────────────────────────────────────────────────────┘
       │ HTTP（会话 Cookie） + 子进程管理
┌──────▼───────────────────────────────────────────────────────┐
│ QQ 桥接进程（node src/bridge.js，单实例）                       │
│   OneBot WS · DSH 客户端 · 控制台 :3100 · 三个 MCP server       │
└──┬────────────┬──────────────┬───────────────────────────────┘
   │ WS         │ stdio        │ HTTP
┌──▼────────┐ ┌─▼──────────┐ ┌─▼─────────────────┐
│ SnowLuma2 │ │ DSH MCP    │ │ 语音引擎 8765/8767 │
│（第三方）  │ │ 客户端      │ │（surfvoice*）      │
└───────────┘ └────────────┘ └───────────────────┘
```

- **两套状态根**：桥接数据在 `<仓库根>/state/`，插件数据在 `~/.dsh/surfcore/`。
- **三份配置**：`config.json`（QQ）、`~/.dsh/surfcore/config.json`（合体层）、`~/.dsh/surfcore/bili.config.json`（B站）。
- **DSH 端口会漂移**：桥接与插件都用 `discoverDshBaseUrl()` 发现，不要硬编码。

完整说明（含 6 条数据流与重启矩阵）：[ARCHITECTURE.md](docs/guides/ARCHITECTURE.md)。

---

## 六、文档地图

> **2026-10-26 全仓库逐行梳理**：12 篇、约 8,700 行、3,150 处 `文件:行号`。

| 步 | 读什么 | 读到什么程度 |
| --- | --- | --- |
| 1️⃣ 5 分钟 | **本文** | 它是什么、怎么装 |
| 2️⃣ 15 分钟 | [ARCHITECTURE.md](docs/guides/ARCHITECTURE.md) | 几个进程、怎么分层、改什么要重启什么 |
| 3️⃣ 按需 | 下面分册 | 改哪个子系统翻哪本 |

| # | 文档 | 行数 | 什么时候翻它 |
| --- | --- | --- | --- |
| 1 | [ARCHITECTURE.md](docs/guides/ARCHITECTURE.md) | 335 | 总纲 |
| 2 | [DATA-AND-CONFIG.md](docs/guides/DATA-AND-CONFIG.md) | 351 | 三份配置每个键、约 95 个状态文件 |
| 3 | [BOUNDARIES.md](docs/guides/BOUNDARIES.md) | 181 | 做不到什么、坏了怎么恢复 |
| 4 | [MODULE-BRIDGE.md](docs/guides/MODULE-BRIDGE.md) | 1,020 | 桥接全文 |
| 5 | [MODULE-CORE-A.md](docs/guides/MODULE-CORE-A.md) | 1,001 | 记忆/人格/目的/收尾/额度/账本/计价/身份 |
| 6 | [MODULE-CORE-B.md](docs/guides/MODULE-CORE-B.md) | 1,098 | B站/鱼群/表情/黑话/文本化/SSRF/DSH 客户端 |
| 7 | [MODULE-PLUGIN.md](docs/guides/MODULE-PLUGIN.md) | 1,101 | 插件宿主：装配、配置模型、设置页 API、B站 调度 |
| 8 | [UI-AND-CONSOLE.md](docs/guides/UI-AND-CONSOLE.md) | 677 | 设置页 14 标签 + 控制台 10 页 |
| 9 | [SUBSYSTEM-VOICE.md](docs/guides/SUBSYSTEM-VOICE.md) | 855 | 语音三条链路 |
| 10 | [SUBSYSTEM-PET.md](docs/guides/SUBSYSTEM-PET.md) | 904 | 桌宠全链路 |
| 11 | [SUBSYSTEM-BILI.md](docs/guides/SUBSYSTEM-BILI.md) | 981 | B站 34 命令 / 23 库 |
| 12 | [AGENT-TOOLS-AND-PRESETS.md](docs/guides/AGENT-TOOLS-AND-PRESETS.md) | 233 | 39 个工具、守卫、两代 preset |

其它：DSH 装配 [DSH_SETUP.md](docs/guides/DSH_SETUP.md) · 安全基线 [SECURITY_BASELINE.md](docs/guides/SECURITY_BASELINE.md) ·
踩坑 [PITFALLS.md](docs/PITFALLS.md) · 风险台账 [RISK_REGISTER.md](docs/RISK_REGISTER.md) · 全部索引 [docs/README.md](docs/README.md)。

---

## 七、安全与边界（摘要）

- **群友碰不到你的机器**：仿真会话的工具面是白名单、fail-closed，本地执行能力全部被 restrict。
- **发送必须命中白名单**：没有"管理员例外"这种后门。
- **控制台只接受本机回环** + 令牌（定长比较）+ Host/Origin 校验 + 写操作强制 JSON。
- **密钥不落日志**；`state/` 用 icacls 切断 ACL 继承。
- **不可逆删除 = 事故**：清理一律先隔离到 `_backups/`。
- **不承诺**提示注入的语义层 100% 防护（真正的边界是工具面与白名单）。

详见 [SECURITY_BASELINE.md](docs/guides/SECURITY_BASELINE.md)、[BOUNDARIES.md](docs/guides/BOUNDARIES.md)、[RULES.md](RULES.md)。

---

## 八、常见问题（FAQ）

| 问题 | 回答 |
| --- | --- |
| 能不装 SnowLuma 吗？ | QQ 部分不能（它负责登录与收发）。只要 B站/记忆/桌宠可以。 |
| 能不用 DSH 吗？ | 不能，插件与 preset 都跑在 DSH 里。 |
| 会自己发消息吗？ | 默认不会。主动搭话要显式开「目的」；二代下发言必须调工具。 |
| 数据会上传吗？ | 只有拼进提示词的文本会发给模型 API；不想让黑话词条出机就关 `slang.autoResearch`。 |
| 支持 Linux/macOS 吗？ | 暂不支持（沙箱 ACL 与启动脚本按 Windows 写）。 |
| 能多用户/远程吗？ | 不做。控制台只接受回环。 |
| 语音包/桌宠必须装吗？ | 不必须。不装则语音不可用、目的机制走 QQ。 |
| 改名/换角色会丢记忆吗？ | 不会。角色包整包隔离，切换带快照，可回档。 |

---

## 九、开发

```bash
npm run test:audit              # 默认门禁（75 个脚本，离线）
npm run test:regressions        # 桥接/协议回归
cd plugins/surfcore && npm test # 插件侧（含更新检查、桌宠更新保留数据的回归）

npm run privacy-scan:strict     # 发布前隐私扫描（0 命中才可发布）
npm run guard:check             # DSH 升级后先跑（asar 会话护栏补丁是否还在）
node scripts/setup-dsh.mjs      # 重装 preset + MCP
```

目录结构见 [docs/FOLDER_MAP.md](docs/FOLDER_MAP.md)；代码分层与"改什么要重启什么"见
[ARCHITECTURE.md](docs/guides/ARCHITECTURE.md)。

---

## 十、许可与合规

- 本仓库 **MIT**。
- **SnowLuma2 是第三方专有组件**，不随仓库分发、不打包；按 EULA §5.4，本程序不对它做安装/部署/代扫码。
- 请自行遵守 QQ / B站 服务条款与当地法律；本项目不提供绕过风控的能力。

</details>
