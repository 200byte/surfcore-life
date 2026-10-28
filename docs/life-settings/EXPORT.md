# 生活参数记录的本地导出

记录先由事务服务保存在指定 DSH_HOME 的 `surfcore/life-settings.json`。导出器只读其中 history 和 observations，不读凭据、记忆正文、模型提示或其他生命的目录，不启动平台、模型、服务、计划任务或网络同步。

一次手动导出：

```powershell
node scripts/export-life-settings.mjs --root "C:\path\surfcore-life" --dsh-home "C:\path\authorized-dsh-home" --out "C:\path\surfcore-life-export"
```

必须显式提供三条路径，不隐式扫描用户默认 `.dsh`。输出放独立专用目录。默认可共享候选入口是 `public/LATEST.json`，按 manifest 读取完整 JSONL 分片：

- `records/` 是当前版本，包括明确的移除观察。
- `versions/` 保存首次、修改、移除和恢复的每次导出观察。
- `timeline/` 是证据定位索引，发生时间未知保留 null，不借导出时间或 mtime 补作发生时间。
- `HEALTH.json` 是最新检查状态；文件存在不代表 dots 已读。
- `.private/ledger.json` 保存稳定ID、原始内容hash、当前指针和版本检查点，不属于交付包。

稳定ID绑定配置scope、集合和原生事件ID；变更修改时增加版本，重复运行不产生重复版本。只有成功读取并完整扫描两个数组后消失的记录才产生 `source_removed`，它是待核查观察，不推断遗忘或物理删除。源文件缺失或损坏不将旧记录批量删除。每片约1MB，只在完整记录边界拆分；超长单条保留为独立片并在manifest标明，不静默截断。

默认 `public` 只含事务/观察的元数据、修订号、正式参数ID和证据定位；参数值、理由、自由文本观察全部留本地待核查。观察按 Agent 自述标注，不能作为独立平台成功证据。摘要与原始证据分开，任何人都不应把配置记录自动改写为主体的永久兴趣或人类已作决定。

可显式使用 `--include-private-reasons` 生成 `.private/full/` 中的本地完整记录副本；它仍不进入public，不改变共享权限。未经另行逐条核查，不能上传 `.private/` 或原始状态文件。

## 与现有统一导出器衔接

本轮已只读检查本地统一导出器的README.md和export_local.py。该入口使用硬编码的来源collector，尚无通用插件注册表；不能假定新数据会被自动发现。本轮未修改该共享导出器，也未运行其扫描或发布流程。

此来源明确登记为：

```json
{
  "source_id": "surfcore-life-settings",
  "adapter": "scripts/export-life-settings.mjs",
  "entrypoint": "<explicit-output>/public/LATEST.json",
  "collections": ["history", "observations"],
  "privacy": "metadata-only; .private excluded",
  "schedule": "manual only",
  "integration_status": "standalone adapter ready; shared collector not installed"
}
```

若以后获准接入共享collector，最小适配是按此LATEST→manifest读取records，把原生source/record_id/version/content_hash/occurred_at/observed_at/original_location交给已有ledger，保留versions和移除语义；不要再扫描源目录或重复导出私有正文。当前不把“已登记独立适配器”说成“统一导出器已经实际接入”。

验收须使用隔离环境中的真实配置变更，导出两次并确认第二次 `new_versions=0`，再检查修改、移除、恢复与分片hash。具体实测结果由交付报告记录。本地已保存、本地已导出、GitHub已发布、dots已实际读到是四个独立状态；本轮导出器只完成前两项。

## 2026-10-27 隔离验收

实际调用本项目 `createManager().preview/apply` 完成两次参数变更，并用 `observe` 记录一次观察，共导出3条记录；立即重复导出得到 `new_versions=0`，snapshot ID相同。随后在隔离源中模拟观察内容修订、记录移除及恢复，版本总数依次为4、5、6，未覆盖旧版本。

验证了共享候选文件不含测试私密理由，完整副本仅在显式选择后进入`.private/full/`；源缺失/损坏保留旧LATEST，已导出分片被修改会被hash检查拒绝。另以2,100条**合成**事务验证分片：3片、完整解析2,100条，未知发生时间保持null，重跑新增0条。模拟写快照中断后旧指针不变，下一次运行成功导出新增1条。

以上是独立fixture中的实际保存与导出证据，不是大肥鱼本人选择、真实QQ/B站动作、GitHub发布或dots读取验收。
