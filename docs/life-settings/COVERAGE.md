# 参数覆盖报告

由实际 catalog 生成；审计覆盖不等于全部开放，运行时采用不等于真实平台行为。

正式参数 30 项；可自主 29 项；需审批 1 项。

| 稳定 ID | 中文名 | 允许范围 | 权限 | 生效方式 | 已有验证 / 缺口 |
| --- | --- | --- | --- | --- | --- |
| qq.socialV2.autoReplyCheckMs | QQ 自动回复检查周期 | {"type":"integer","min":5000,"max":3600000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.wake.recommendedProbability | 普通消息默认唤醒概率 | {"type":"number","min":0,"max":1} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.wake.recommendedSleepMinMs | 推荐潜水最短时间 | {"type":"integer","min":60000,"max":86400000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.wake.recommendedSleepMaxMs | 推荐潜水最长时间 | {"type":"integer","min":60000,"max":86400000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.proactive.enabled | QQ 主动冒泡机会 | {"type":"boolean"} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.proactive.checkIntervalMinMs | 主动机会最短间隔 | {"type":"integer","min":60000,"max":86400000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.proactive.checkIntervalMaxMs | 主动机会最长间隔 | {"type":"integer","min":60000,"max":86400000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.proactive.idleThresholdMs | 主动冒泡前安静时间 | {"type":"integer","min":60000,"max":86400000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.proactive.probability | 主动冒泡机会概率 | {"type":"number","min":0,"max":1} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.closure.cooldownMs | 对话收尾后的安静时间 | {"type":"integer","min":60000,"max":86400000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| qq.socialV2.context.wakeMaxChars | QQ 唤醒上下文字数 | {"type":"integer","min":1000,"max":12000} | 本地维护者审批 | next-wake | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| purpose.enabled | 自主目的机会 | {"type":"boolean"} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| purpose.gapMinMs | 目的机会最短间隔 | {"type":"integer","min":300000,"max":86400000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| purpose.gapMaxMs | 目的机会最长间隔 | {"type":"integer","min":300000,"max":86400000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| purpose.quietStart | 目的安静时段开始 | {"type":"clock"} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| purpose.quietEnd | 目的安静时段结束 | {"type":"clock"} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| purpose.idleThresholdMs | 主动联系前安静时间 | {"type":"integer","min":60000,"max":43200000} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| purpose.maxCandidates | 候选目的数量 | {"type":"integer","min":3,"max":10} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| purpose.pendingTtlDays | 待续目的保留天数 | {"type":"integer","min":1,"max":90} | 可自主调整 | next-schedule | QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号 |
| bili.night.windows | B站活动时间窗口 | {"type":"windows"} | 可自主调整 | next-plan | 真实隔离 planner/scheduler 消费链已验证；平台读取层另见LIVE-BILI |
| bili.night.maxWakesPerDay | B站每日浏览机会 | {"type":"integer","min":0,"max":12} | 可自主调整 | next-plan | 真实隔离 planner/scheduler 消费链已验证；平台读取层另见LIVE-BILI |
| bili.night.skipChance | B站跳过机会概率 | {"type":"number","min":0,"max":0.95} | 可自主调整 | next-plan | 真实隔离 planner/scheduler 消费链已验证；平台读取层另见LIVE-BILI |
| bili.night.maxVideos | B站单次浏览数量 | {"type":"integer","min":1,"max":20} | 可自主调整 | next-plan | 真实登录nav/feed消费者已验收，候选数量5→3；恢复5已由调度器验证 |
| bili.night.minGapMin | B站浏览最短间隔（分钟） | {"type":"integer","min":1,"max":120} | 可自主调整 | next-plan | 真实隔离 planner/scheduler 消费链已验证；平台读取层另见LIVE-BILI |
| bili.preferences.like | 愿意探索的兴趣词 | {"type":"keywords"} | 可自主调整 | next-read | 配置消费者已接线；推荐/分享/监听实际行为尚未验证 |
| bili.preferences.keywords | 额外探索关键词 | {"type":"keywords"} | 可自主调整 | next-read | 配置消费者已接线；推荐/分享/监听实际行为尚未验证 |
| bili.preferences.weights | 兴趣词权重 | {"type":"weights"} | 可自主调整 | next-read | 配置消费者已接线；推荐/分享/监听实际行为尚未验证 |
| bili.share.enabled | B站分享机会 | {"type":"boolean"} | 可自主调整 | next-read | 配置消费者已接线；推荐/分享/监听实际行为尚未验证 |
| bili.share.minScore | B站分享评分门槛 | {"type":"integer","min":0,"max":20} | 可自主调整 | next-read | 配置消费者已接线；推荐/分享/监听实际行为尚未验证 |
| bili.listen.commentIntervalSec | B站评论监听周期（秒） | {"type":"integer","min":60,"max":86400} | 可自主调整 | next-read | 配置消费者已接线；推荐/分享/监听实际行为尚未验证 |

## 只读与未开放

| ID / 分组 | 原因 |
| --- | --- |
| qq.dsh.model | 可能修改 DSH 全局默认；仅显示保存值，wire 未验收。 |
| qq.dsh.reasoningEffort | 配置值不等于实际请求；本轮不经普通接口改模型。 |
| qq.socialV2.tokenGuard | 保护预算和外部活动上限，不允许普通接口放宽。 |
| purpose.dailyMax | 原代码 0 表示不限，故保持只读。 |
| memory.memoryCard | 涉及遗忘和隐私；本轮只读审计。 |
| bili.limits | 普通偏好不改变外部行为授权或硬额度。 |

另不开放：密钥/cookie/账号身份、QQ准入、工具权限、鱼群保护硬闸、通知命令与URL、外部资源授权、记忆原文/遗忘/跨平台私密范围、硬金额和token上限。preferences.dislike 实际 feed 未使用，未列入可调目录。

## 证据层级

本地单元/集成测试、官方 Adapter 离线 wire、真实模型工具选择、真实 QQ/B站平台行为、DSH 桌面 composition 是分别验收的层级。真实模型与平台结果以 DELIVERY/LIVE 中本轮实际记录为准。

QQ 默认推荐不会覆盖本人或管理员的会话选择；已排定计时器保留时间。purpose 载体为 pet 时 QQ 不为该消费者出具采用证明。B站兴趣与分享等参数即使可保存，也会在缺少实际读点证据时保持 saved-unverified。

窗口只允许非重叠同日范围；跨午夜可拆为两窗。本轮受管 minGap 至少1分钟；原有未经管理的历史配置仍按上游兼容路径读取。每日0只禁自动浏览，skipChance仍轻醒。
