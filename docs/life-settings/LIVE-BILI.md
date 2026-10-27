# B站真实只读消费者验收

## 本轮真实执行结果

用户明确授权后，北京时间2026-10-28 00:18:02–00:18:03，成功执行官方登录认证和实际热门候选读取。最终一次验收报告位于本地state/life-bili-platform下runId末尾d0d9e852的目录；RESULT为passed。

- 实际session读取loggedIn=true；只保存账号UID的hash。
- 原始已采用maxVideos=5时，真实feed返回5条；重放此前实模选择、真实调度器采用maxVideos=3后，真实feed返回3条。
- 随后恢复隔离配置，调度器证据确认maxVideos重新为5；最后调度器停止。没有为恢复值再发第三次feed请求。
- 这次五个GET均HTTP200，只有nav和popular两个官方路径。平台写入0，新增模型请求0。
- 原凭据文件字节保持不变，隔离账号目录没有credentials.json；没有把凭据迁入新项目。

前两次启动分别在Windows preload路径和异步HTTPS后的强制进程退出处停止；第一次没有平台请求，第二次仅nav HTTP200，未作为认证成功证据。修复文件URL和自然退出后，才取得上述完整通过结果。没有自动重试循环，也没有隐瞒失败后把固定结果当成功。全部尝试总计六个只读GET，无平台写入。

这项结果与前面的真实模型验收组合证明“模型能选择参数、真实运行时采用、实际平台读取的消费者数量随之变化”。本次平台步骤是已说明的选择重放，并非又一次新模型决策；仍不宣称完成视频播放、评论/私信、自然偏好形成或长期在线验收。

## 操作与边界

`scripts/test-life-bili-platform.mjs` 在新的独立 profile 中重放此前实模已明确作出的普通作息参数选择，运行真实 SurfCore `session` 和 `feed`，比较修改前后实际采用的单次候选数量，并恢复隔离配置。它不新增模型调用，也不会把重放描述为又一次自主选择。之前实模的原生预览、理由、执行和验证回执必须能定位。

默认执行仅显示用法，不联网。维护者先运行：

```powershell
node scripts/test-life-bili-platform.mjs --prepare --model-evidence 'C:\explicit\prior-run\receipts.json'
```

只有取得本次真实 B站读取授权后，才指定已有凭据来源：

```powershell
node scripts/test-life-bili-platform.mjs --live --credential-file 'C:\explicit\existing\bili_credential.json' --model-evidence 'C:\explicit\prior-run\receipts.json'
```

维护者进程环境 `SURFCORE_BILI_CREDENTIAL_FILE` 是明确的文件引用。两个只读消费者在进程内读取 `sessdata`、`bili_jct`、`buvid3` 和可选 `dedeuserid`，其余字段忽略。不会复制 Cookie 到新 profile、日志或源码，也不会修改原凭据文件。此引用不属于 Agent 参数目录，普通工具不能修改。未提供引用时仍使用原账号目录 `credentials.json`，保持原有安装行为。

验收器最多发起五次 GET：认证 nav 一次，修改前后 feed 各使用 nav 和一页热门。维护者加载的只读 transport guard 只允许这两个官方路径，拒绝其他方法、目标、重定向和超过五次的请求。搜索词为空，禁用推荐记忆写入；不登录或启动 QQ、云宝或其他生命，不发送评论、私信、点赞、动态等操作。认证或网络失败后停止，不重试；已经发生的隔离参数变更仍会尝试安全恢复。

产物保存在忽略的 `state/life-bili-platform/<时间与随机 ID>/`。账号仅保存 UID hash；视频仅保留公开 BV ID、时长和来源，不保存标题、账号昵称、Cookie 或个人主页数据。结果分别报告实模选择的来源、这次重放、真实外部读取、实际返回数量与回滚证据。真实返回数量未变化时标记部分完成，不能宣称已经演示数量效果。输出不能证明真实平台发言、自然偏好形成或持续在线生活。
