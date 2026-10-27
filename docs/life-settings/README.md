# Agent 自主生活参数

入口是本仓库 src/mcp-life-settings.js，通过标准 MCP stdio 注册九个工具。普通生活参数的发现、解释、预览、执行、验证、回滚都走同一个受限接口，无需读写源码。

## 快速使用

~~~powershell
npm ci
npm run test:life
npm run demo:life
npm run demo:life -- --step
~~~

默认演示不调用模型、不连接平台。真实模型验收需显式启用另一个入口，见 [LIVE.md](LIVE.md)。[DEMO.md](DEMO.md) 给出录屏步骤和证据目录。

## 正式工具

| 工具 | 用法与语义 |
| --- | --- |
| life_state | 系统事实、保存值、实际采用证据、调度状态、预算口径、待验和未知项。 |
| life_catalog | 按中文或稳定 ID 发现参数、意图方案和只读边界。搜索不会执行。 |
| life_explain | 查询作用、范围、权限、成本、生效时机、依赖和恢复方式。 |
| life_preview | patch 或 intent 二选一，附本人明确给出的 reason；返回全部关联改动、版本、风险与验证方式。 |
| life_apply | 只接受预览返回的 planId；明确执行后才改修订，不接任意文件或路径。 |
| life_verify | 从独立消费者证据核对 changeId；保存、采用、行为效果分开。 |
| life_history | offset/limit 分页，保留每次选择、前后值、修改者、原因、观察及恢复关系。 |
| life_rollback | 接收 changeId/reason，生成恢复前值的计划；仍需本人 apply，不覆盖后续同字段选择。 |
| life_observe | 记录本人报告的 text、evidenceRef 和 undecided/keep/consider-revert；不自动改人格或设置。 |

例如先查询“群聊参与”，再解释某个参数。需要调整时：

~~~json
{
  "patch": {
    "qq.socialV2.proactive.probability": 0.4
  },
  "reason": "这里填写本人实际表达的原因，不由外部程序编造"
}
~~~

也可选择目录中明确的 intent：less-disturbance、more-group-opportunities、more-solitude、more-exploration、fewer-model-opportunities。预览展示确定的多参数修改；模型需自行决定是否执行。它们不是自动识别关键词后替主体作出的决定。

## 状态证据

| 状态 | 含义 |
| --- | --- |
| saved-unverified | 已保存，尚无相应消费者证据。 |
| pending-runtime-reload | 消费者回报的是旧修订；不能认为已采用。 |
| runtime-adopted | 相应实际消费者在新修订回报相同值；同时看 mode。 |
| verification-failed | 消费者已回报当前修订，但实际值与保存值不同。 |
| superseded | 待核对修改已被更新修订取代，不能用当前值证明旧修改。 |
| local-simulation | 真实本地配置/调度代码，平台或 DSH 投递端为模拟接收器。 |
| stale-or-inactive | 超过 90 秒、进程退出、scope 不符或运行时已停止。 |

QQ 已排定的回复/主动机会/目的计时器保留原时间，之后新建计时器才采用新范围；显式本人/管理员会话选择优先。B站按真实 planner 采用新节奏，保留当天使用量、上次活动时间和旧计划，不补跑错过机会。maxWakesPerDay=0 只关闭自动浏览机会，独立监听和在途请求仍需分别判断。skipChance 跳过浏览仍会轻醒，不能把它当作零费用休息。

思考档位只读显示 requested 保存值；没有官方 wire 证据就不显示实际生效。最新缓存与官方入账金额未知时明确为 null。预算余量来自已有 SurfCore 会话事件/价格估算；用量过期时显示未知。

## 接入独立 DSH

~~~powershell
npm run life:connection -- --dsh-home "<独立测试DSH_HOME>" --out "<新的待审阅patch文件>"
~~~

该命令只生成待审阅 patch，不安装、不修改现有 DSH、不唤醒任何主体。将它与本衍生版 SurfCore 放入同一个独立 DSH profile；操作员确认后按本机 DSH 的正常方式加载。桥接、B站 scheduler 和 MCP 必须使用相同的 SURFCORE_ROOT、DSH_HOME；B站配置如另指定 SURFCORE_BILI_CONFIG，也须对齐。保存文件绑定 root/home scope，不能把另一主体的文件直接复制进来冒充当前设置。

QQ preset 仅精确允许这九个 MCP 名称，life_approve、任意命令和任意命名空间均不放行。当前已完成 MCP 真正 stdio 的发现、调用与守卫测试，实际桌面 DSH composition/账号验收另列交付边界。不要安装到正在生活的主体上做测试。

## 事务与审批

唯一新增权威来源为独立 DSH_HOME/surfcore/life-settings.json。一次关联修改与历史是一个原子提交；读写锁跨进程，预览绑定修订和基础文件 hash。临时文件刷盘后 rename；备份失败就拒绝提交。原基础配置保留，受管参数最后覆盖，设置页改同字段不会暗中取消主体已经保留的覆盖。

未受管的上游设置页/控制台基础配置写入仍是原有机制；本层不宣称已修复上游所有字段的双写问题。本层不跨文件回写基础配置，因此不会用旧整份 JSON 覆盖另一进程的无关修改。基础文件采样变化会使已预览计划失效；受管覆盖的优先级是显式契约。

普通 Agent 不拥有 approve 工具。当前需审批的是 QQ 唤醒上下文字数，维护者可在核对计划后使用：

~~~powershell
npm run life -- approve --dsh-home "<同一独立home>" --plan "<planId>" --revision <N> --reason "<批准这个具体计划的原因>"
~~~

审批绑定精确计划 digest、当前修订、来源 hash 和 15 分钟有效期，不能转用于其他计划。模型、硬预算、账号、凭据、跨平台隐私和外部权限保持只读/禁止；不会为了方便而开放万能 JSON 写入器。上游 B站 shell 的既有广泛权限不等于操作系统级隔离，本接口也不宣称能防同权限本地进程篡改。

## 恢复与维护

正常恢复用 history → rollback → preview → apply → verify。若修改前有有效消费者证据，恢复那个真实采用值；没有证据时只恢复历史保存值，不能保证那是此前真实运行值。恢复仍形成新修订，不删历史或把当天额度归零。

坏配置保留现场，不自动以默认值覆盖。进程意外退出可能留下 lock；维护者先检查 owner PID，确认该进程已不存在后可用 recover-lock 入口隔离旧锁。该入口不向模型注册，不强制打断仍存在的进程。文件写入失败时旧配置和备份仍可供核对。

源码边界集中在 src/life-settings：catalog 是正式目录，constraints 是耦合与意图预览，manager 是事务接口，runtime 是采用/证据，qq-runtime 是 QQ 热采用。B站集成在原 config、whale-night、scheduler 中。修改后先跑 test:life；碰实际协议、桥接再跑 test:audit / test:regressions 和相关插件脚本。[PARAMETER-AUDIT.md](PARAMETER-AUDIT.md) 保留消费者审计，[EXPORT.md](EXPORT.md) 说明本地脱敏增量导出。
