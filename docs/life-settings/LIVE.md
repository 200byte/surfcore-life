# 实模验收：模型决定临时调整并恢复

`scripts/test-life-live.mjs` 是默认关闭的有限验收器。它使用真实 DeepSeek 官方 API、实际发现的九个 MCP 工具、真实配置事务和 B站调度器。模型自己选择不同的普通 B站作息参数及理由，按查询、说明、预览、执行、验证、观察、回滚、再次执行与验证完成一次闭环。

QQ/B站未登录，DSH 投递端是隔离的本地接收器。这项验收可以证明实模产生的工具调用实际改变配置并被调度器采用；不能证明真实平台互动、自然形成了生活偏好、官方 DSH Adapter wire 或平台扣款。

无需密钥、不会调用模型的准备检查：

```powershell
node scripts/test-life-live.mjs --prepare
```

只有明确允许本次付费验收后才执行：

```powershell
# 首选从当前进程 DEEPSEEK_API_KEY 取得密钥。
node scripts/test-life-live.mjs --live

# 也可明确指定已有本地文件；仅解析其中 DEEPSEEK_API_KEY，不使用其他变量。
node scripts/test-life-live.mjs --live --key-file 'C:\explicitly-authorized\credentials.env'
```

固定请求 `https://api.deepseek.com/chat/completions` 的 `deepseek-flash`，关闭 thinking，每次输出最多 1400 tokens，至多 14 次请求；单次请求最多 45 秒，总计最多五分钟。API、工具或约束失败时停止，不自动重试；只运行短时隔离测试Agent，不唤醒现有数字生命，不自动对外发送。

每次验收建立全新 `state/life-live/<时间与随机 ID>/isolated-root` 和 `isolated-home`，不会读取或改写现有生命的身份、记忆、配置或 Session。密钥仅留在请求进程内存，不传给 MCP 或 planner 子进程，不写日志；错误与产物对密钥进行脱敏。此目录属于运行数据，不能发布或加入普通 Git 提交。

`RESULT.json` 只有在模型实际调用了修改、独立验证、观察、回滚以及回滚后的验证，并且实际采用值恢复初始状态时才标记成功。`requests.json` 保存请求、静态系统头和工具声明的 hash、实际返回模型名和官方响应 usage/cache hit/miss；这些 usage 不能当官方已入账金额。`transcript.json` 只保存普通内容、原生工具调用及实际工具结果，不保存 reasoning trace。调度器关闭前的证据单独保存；结束后进程停止，旧证据不再冒充在线状态。
