# 生活参数源码审计

审计日期：2026-10-27。范围是本独立衍生仓库中的实际消费者。下表记录上游配置来源、读取时机和耦合；“候选”不代表已经开放。正式支持 ID、权限、保存值与运行证据以新增工具目录和最终验证报告为准。

## 配置层与真实生效的区别

| 来源 | 读写者 | 实际行为与覆盖 |
| --- | --- | --- |
| 仓库 `config.json` | `src/bridge.js:loadConfig()`、插件 `store.js:readQqConfig/saveQqConfig` | 桥接 `main()` 启动读入 `cfg`；部分控制台路由会同时改内存，不能据“已写盘”推断任意参数热生效 |
| `<DSH_HOME>/surfcore/bili.config.json` | 插件 store、scheduler，B站 CLI `tools/lib/config.mjs` | CLI 按 mtime/size 缓存；调度器与短命令读取路径必须相同。旧实现 CLI 默认只认 USERPROFILE/.dsh，隔离环境需特别核对 DSH_HOME/SURFCORE_BILI_CONFIG |
| `<DSH_HOME>/surfcore/config.json` | `store.js:readUnified/saveUnified`、identity、memory、平台管理 | 合并默认值；保存接口还会重建简报、重排调度、启动/停止平台，直接编辑文件不等同调用保存接口 |
| 角色 B站 `whale-night.config.json` | `tools/commands/whale-night.mjs` | 遗留覆盖在 `config().night` 之后应用；如果不显式处理，会吞掉新生物钟选择 |
| `social-v2.json` 中各会话 wakeConfig | 桥接，`qq_set_wake_config` | 是每会话真实潜水与触发状态，推荐默认值不等于已经存在的会话选择 |
| 角色 `purpose-outreach.json` | QQ 或桌宠目的载体 | 包含 nextFireAt、今日次数、候选和待续目标；改间隔后要处理既有排程，不能仅换配置 |
| `token-budget.json` 与 usage 快照 | 插件 budget 服务、桥接、B站 prompt 闸 | 额度和用量分开；使用 session events + 价格表，不是官方扣款账 |
| 新 `life-settings.json` | 受限参数事务服务；已接线消费者 | 只保存正式目录允许的覆盖、版本与历史。生效需消费者证据，不能以本文件内容自证 |

上游 `store.js` 每个文件使用临时文件 + rename，并保存备份；这解决单文件撕裂，不提供多个进程之间的 CAS，也不让三份配置变成一次跨文件事务。上游 `backupFile()` 失败可返回 null；“调用了备份”不等于备份一定成功。受管参数采用独立原子事务，避免替新功能扩大上述写入范围。

## QQ：机会、潜水、收尾和安全边界

| 参数族（基础配置路径） | 默认 / 语义 | 真实读取与生效 | 耦合、边界与回滚 |
| --- | --- | --- | --- |
| `socialV2.proactive.enabled` | true | `scheduleProactiveCheckV2()` 排主动机会；只在 reserved2、未暂停且会话允许时 | 关闭应取消已排 timeout；恢复先前覆盖时重新排程，不恢复旧发送 |
| `proactive.checkIntervalMinMs/MaxMs` | 30/90 分钟 | 排 timeout 时读取，并在闭包捕获 `p` | max≥min；已有 timeout 不自动缩短，必须明确取消/重排；机会不是必然发言 |
| `proactive.idleThresholdMs` | 15 分钟 | 主动 timeout 执行时使用捕获对象 | 0 在上游 `Number(...) || 默认` 路径会被默认替代；开放前须按实际消费范围收敛 |
| `proactive.probability` | 0.3 | timeout 内算概率 | 待续想法×1.4，近期回复×0.5，夜间×0.3，自身发言较多×0.3；另受忙碌、自然收尾、预算与频率闸 |
| `wake.recommendedProbability` | 0.05 | 默认 wakeConfig 生成、默认迁移、提示建议 | 不等于已由 Agent 明确确认过的会话概率；不得悄悄重写本人已选 wakeConfig |
| `wake.recommendedSleepMinMs/MaxMs` | 5/120 分钟建议 | 提示建议，不是实际定时器 | 真正睡到何时由会话 `sleepUntil/infinite` 控制；min/max 联动 |
| `wake.sleepMinMs/MaxMs` | 1 分钟 / 0（无最高值） | `qq_set_wake_config` 校验 | 是允许范围；潜水工具还受沉睡前观察保护；不开放为安全绕过 |
| `wake.recommendedDefaultInfinite` | true | 生成默认 wakeConfig | 不表示“不会再醒”：@、名字、提问等触发仍可能唤醒 |
| `wake.recommendedAtMention/NameMention/Question/Poke/Keywords` | 多项 true，关键词有上游默认 | 默认会话触发与推荐 | 逐会话覆盖、白名单/模式、tokenGuard 可能压住；关键词不是主体自己形成的兴趣 |
| `wake.batchWindowMs` | 8 秒 | 真发送唤醒前聚合；已建会话也可能保存自己的 batchWindowMs | 受 maxWake/minute/hour 与其他唤醒闸约束 |
| `wake.maxWakePerMinute/Hour` | 1 / 12 | 运行时频率检查 | 防刷与费用边界，仅只读/操作员处理；生活概率不能绕过 |
| `wake.preSleepWaitEnabled/preSleepWaitMs` | true / 5 分钟 | 休眠确认前的等待保护 | 不以“生活偏好”关闭现有保护 |
| `socialV2.closure.cooldownMs` | 20 分钟；规范化 1 分钟至24小时 | `closureConfigV2()` 基于桥接内存；结束记录另存冷却时间 | 只抑制普通概率/回复检查/主动机会；私聊、@、提问等可重开；旧记录的 cooldownUntil 不应当作刚保存的值 |
| `closure.enabled/promptInWake` | true / true | 收尾判断与唤醒提示 | 判断给建议，不能凭评分替她作结束决定 |
| `closure.requireNoOpenQuestion` | true | `closeGate()` 在对方明确提问/求助时拒绝收尾 | 保护条件，不经普通参数放宽 |
| `send.*` | 单回合最多8条，单条500字，分钟/小时频率等 | 真正出站时仍审计、白名单与模式复查 | 外部发言硬边界，不开放给参数工具绕过 |
| `tokenGuard.*` | 每群日20、私聊10、最小2分钟、每回合8条、成本闸 | 唤醒与出站附近检查，直接叫到只可越过特定间隔 | 硬预算、用量、权限保留；0 在部分字段意为无限，不能泛化成“关闭活动” |
| `context.*` | recent100/unread30/wake消息12/最近4/6000字 | 创建唤醒快照时消费 | `wakeFoldOld=true` 会折叠旧未读；回滚配置不能找回已移出的未读，仅能查有限 recent；本轮只读 |
| `history.*` | enabled、30条、最近720分钟、可唤醒 | QQ上线/重新上线补历史 | 会改变读取范围、触发与隐私，本轮不开放 |

主要源码：`src/bridge.js` 的 `loadConfig`、`defaultWakeConfigV2`、`scheduleProactiveCheckV2`、`sendWakePromptV2`、`closureConfigV2`；`src/conversation-closure.js`。桥接不是每次调用都重新读基础配置，本轮的热采用必须有新增消费者接线。

## B站：作息与社交

| 参数族 | 默认 / 语义 | 谁读取、何时与覆盖 | 耦合、风险与恢复 |
| --- | --- | --- | --- |
| `night.windows` | 默认20:00–24:00一次 | `whale-night.mjs` 每个进程开始读配置；scheduler 经 CLI 规划日程 | 支持跨午夜；每窗 wakes、总上限、最小间隔及当天已用次数共同决定 slots；改后需重算旧计划 |
| `night.maxWakesPerDay` | store默认1；CLI历史代码默认12，上游注释有陈旧“3” | CLI算 MAX_WAKES，真实上限12 | 上游 `Number(...) ||12` 把显式0变12，导致停止分支不可达；开放0休息前必须修并测，不能按注释宣称成功 |
| `windows[].wakes` | 调度纯逻辑允许0不醒；store归一化却最少1 | `night-schedule.mjs` 分配保底与额外slots | 同名窗口 label 会影响计数映射；重叠/过窄/间隔冲突应预览拒绝或明确警告，不静默吞计划 |
| `night.skipChance` | 0.3；store允许至0.95 | 规划slot时掷骰子，结果进入持久化schedule | 改值不改变旧slot，需重算；skip仍可能“轻醒”并调用模型，不等同零费用休息 |
| `night.maxVideos` | 5；store范围1..20 | CLI计划输出和B站唤醒说明 | 主要是告知Agent的一轮浏览上限，不证明实际看了N条；还受时间/选择/外部资源可用性影响 |
| `night.minGapMin` | 20；store范围0..120 | CLI与纯排程逻辑 | 上游 CLI `Number(...) ||20` 吞掉0；必须与窗口容量联合验证 |
| scheduler tick | 固定60秒 | `startScheduler` 注册真实 interval | 把活动间隔改5分钟不会变成每5分钟精确检查；停止/未登录/预算阻断时不自动启动 |
| `preferences.like/dislike/keywords/weights` | 有上游人类默认词；权重0..5，主偏好缺省1、额外关键词缺省0.75 | `feed-core`/feed在选题时消费，工具config按mtime读取 | 0停用该词；like优先keywords、去重/近期pick也影响结果；候选权重不是主体真实兴趣证明 |
| `share.enabled/via/minScore` | true / dynamic / 13 | 分享工具及唤醒说明 | 动态、评论、额度、沉默天数、分享评分共同约束；dm旧分支未完整支持，不能因枚举可存就当功能可用 |
| `share.silentAfterDays/decayPerDay` | 3天 / 每天1 | 分享评分与沉默反馈 | 不是强制主体“想分享”；生活调整不开放绕过外发许可 |
| `quota.shareDaily` | 3 | 分享时记账检查 | 0等字段语义需跟工具闸核实；本轮硬额度只读/操作员处理 |
| `limits.*` | 评论30、回复50、主动搭话15、动态类10、每人1；另有UP/视频/线程/全局冷却 | `tools/lib/limits.mjs`→free-gate在行动时检查 | 多数字段0表示无限，不能当停止；属于防刷硬闸，本轮不开放普通接口放大 |
| `listen.commentIntervalSec/comment/allDay/scope` | 300秒 / true / false / both | scheduler 独立监听循环重读，最小60秒 | allDay会绕开作息时段影响活动成本；不能只改night就宣称所有自动B站活动都停 |
| `listen.dm/live` | 默认false | 独立循环；直播有明确未实现标记 | 不因字段存在宣称支持；通知外部账号/范围不是生活参数授权 |
| `dynamics.enabled/gapMin/kinds` | true / 30分钟 / 四种时段 | scheduler日常提醒与daily工具，实际发布另走闸 | 关夜间浏览不自动关闭动态提醒；时窗/每日类额度/长度/冷却耦合 |
| `agent.sandbox`、notify、工具路径 | 上游B站默认danger-full-access | scheduler对专用会话设置权限；notify可运行命令/访问URL | 安全与外部资源边界，只读说明，不可通过参数接口修改 |

主要源码：`plugins/surfcore/lib/scheduler.js`、`store.js`、`tools/lib/config.mjs`、`night-schedule.mjs`、`limits.mjs`、`commands/whale-night.mjs`。停止某类主动活动不能冒充整个B站子系统已停止；正式目录须讲清调整所覆盖的活动路径。

## 自主目的

| 参数族（`purpose.*`） | 默认与规范化 | 消费时机与重要约束 |
| --- | --- | --- |
| enabled | true | QQ `purposeTick` 检查；carrier=pet时由原桌宠载体负责，不得两边同时执行 |
| gapMinMs/gapMaxMs | 150/300分钟；5分钟..24小时，max≥min | `ensurePurposeSchedule/planNextFire/evaluatePurposeTick`；已有nextFireAt不会因写盘自然失效，新增接线需明确重排 |
| initialDelayMinMs | 30分钟；1分钟..12小时 | 首次/中断恢复排程，不等同日常间隔 |
| dailyMax | 4；0..24，0=无限 | tick结合countToday检查；“增加探索”不得自动清零今日次数或解除预算 |
| quietStart/quietEnd | 23:30/08:30 | 每次评估本地时钟；相等=禁用安静时段，绝不是全天休息 |
| idleThresholdMs | 30分钟；0..12小时 | 主人正在聊/双方近期活动、busy、friend、模式、预算共同决定是否出发 |
| materialWindowHours/biliWindowDays | 72小时/7天 | collectMaterials形成素材；范围增加会扩大历史访问与提示成本，本轮优先只读 |
| maxMaterials/minMaterials | 36/2；6..80/0..20 | 素材少且无待续/自身来源会跳过；最小不得高于实际候选容量 |
| retryMs/maxAttempts | 15分钟/3；1分钟..6小时/1..10 | 失败或跳过后的排程；不应无限重试模型 |
| maxCandidates/promptMaxChars | 6/16000；3..10/4000..30000 | 选择与提示构造；预算裁剪会使保存候选数不等于真正注入数 |
| pendingTtlDays/historyLimit | 14天/60；1..90/10..200 | prune保留期限/历史长度；缩短后被清掉的目标不是恢复参数就可复原，本轮谨慎只读 |
| carrier/专注 | 默认QQ；专注由pet/focus.json读取 | QQ carrier约30秒缓存，focus约10秒；上游只有carrier热读，不应据此推定purpose全部字段热读 |

`src/purpose-engine.js` 把规则输出称为 goal hypothesis，并有置信度、归属、反馈与过期。目录和状态板沿用“候选/假设/建议”语义；不得把驱动分数升级为主体真实内心愿望。

## 记忆、身份、跨平台与模型预算

| 参数族 | 源码事实 | 本轮边界与验证 |
| --- | --- | --- |
| `memoryCard.maxChars/warnChars` | 0软容量无限；warn默认60000；不是文件或模型上下文硬上限 | 只读；调低上限可能触发autoCompact，不可用普通回滚假装恢复被整理内容 |
| `injectMaxChars.qq/bili` | 默认2200/2000字；范围400..8000 | 插件维护生成两份prompt文件，桥接/B站读取生成物；配置值≠已生成文本长度≠模型实际token |
| `recentDays/fuzzyAfterDays/forgetAfterDays` | 7/7/60天；遗忘还依重要度、主人重要性、初次相遇、置顶等规则 | 原始记忆与衰减规则本轮只读；未来修改须区分可逆配置和不可逆整理结果 |
| `dailyHour` 与维护频率 | 默认本地4点后每日衰减；插件启动8秒后维护，之后固定10分钟 | dailyHour不是精确4点timer；memoryCardConfig在维护时读统一配置，不能只改固定计时器的文案 |
| `enabled/autoCompact/maxRecords` | true/true/600；关闭维护会清两份prompt；单写开关未清生成物可能继续注入 | 本轮只读，保留原维护单写者和备份，避免多进程直接改记忆卡 |
| `includeQqInBili` | false | 跨平台隐私边界，不经普通工具开放 |
| `fullMaxBytes/fullMaxRecords/fullMarkdownMaxBytes` | 默认10GB / 不限记录 / 5MB导出阈值；全量档案不生成常驻prompt | 本轮不改、不导出私人档案 |
| QQ→B站 memory同步 | 默认关闭；7天/300条/6000字/30分钟；定时器在启动或设置保存时建立 | 启用会扩大跨平台信息范围；不属于普通生活偏好 |
| B站→QQ memory同步 | 真开关在QQ `biliBridge.memory.enabled`，非统一层previewOnly | 两套记忆同步和记忆卡不同；关闭一个不能代表另一套关闭 |
| identity/admin/alignment | 管理员合体层映射至QQ/B站；注入简报另有生成/缓存 | 身份、账号、对齐审批、凭据原样保留；不从人类默认称呼生成主体自选事实 |
| `dsh.provider/model/reasoningEffort` | QQ `ensureChatModel()`按epoch调用DSH selectModel；effort默认max | selectModel还影响DSH全局新会话默认，操作员审批；需模型实际请求/响应证据，保存high不等于wire high |
| token budget QQ/B站/其他/总额 | QQ默认¥8，其余null；0/负数归一为不限；80%提醒、100%拦截 | 账本session-events估算与平台入账分开；硬上限不经普通工具调整，不能清空账本实现省钱 |
| budget读取 | 插件refreshLimits最多约2秒缓存；QQ读自然日usage快照；B站每次prompt前检查 | 状态标明更新时间/来源；usage缺失不冒充剩余额度充足，线上扣款未知则写未知 |

主要源码：`src/memory-card.js`、插件 `lib/memory-card.js`、`index.js`、`src/token-budget.js`、插件 `lib/token-budget.js`、`src/bridge.js:ensureChatModel()`。

## 如何判定最终覆盖

本审计列出整个主要生活参数面，不承诺全部开放。交付应分别列明：

- **自主可改**：正式目录已登记并由真实消费者采用，具有范围、耦合校验、历史与回滚。
- **只读**：能够安全读取/解释基础约束，但普通接口不能变更。
- **待审批**：提交请求本身没有生效；只有独立操作员流程可以处理，Agent不能自批。
- **不开放**：凭据、身份、安全、隐私、外部授权、原始记忆及未实现功能。
- **隔离已验证**：真实源码消费者在fixture采用新值，可按证据重跑。
- **真实平台待验收**：真实QQ/B站账号、DSH官方Adapter wire、付费模型和平台入账，本轮未获调用授权的部分仍待验收。

回滚恢复“修改前的有效覆盖”，不等于恢复默认，不回退用户后来改过的基础文件，不撤销已经发出的消息，不改变今日已发生用量。若证据过期或消费者尚未采用，回滚同样需要新的生效检查。
