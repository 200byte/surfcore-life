import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PARAMETERS,READ_ONLY} from '../src/life-settings/catalog.js';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rows=PARAMETERS.map((p)=>{
  const scope=p.id.startsWith('bili.night.')?'真实隔离 planner/scheduler 消费链已验证；未登录平台':
    p.id.startsWith('qq.')||p.id.startsWith('purpose.')?'QQ 隔离消费者链代表性用例通过；未逐个穷尽边界/未上线账号':
    '配置消费者已接线；推荐/分享/监听实际行为尚未验证';
  return '| '+[p.id,p.name,JSON.stringify(p.rule),p.permission==='approval'?'本地维护者审批':'可自主调整',p.effect,scope].join(' | ')+' |';
});
const text=[
  '# 参数覆盖报告','',
  '由实际 catalog 生成；审计覆盖不等于全部开放，运行时采用不等于真实平台行为。','',
  '正式参数 '+PARAMETERS.length+' 项；可自主 '+PARAMETERS.filter((p)=>p.permission==='autonomous').length+' 项；需审批 '+PARAMETERS.filter((p)=>p.permission==='approval').length+' 项。','',
  '| 稳定 ID | 中文名 | 允许范围 | 权限 | 生效方式 | 已有验证 / 缺口 |',
  '| --- | --- | --- | --- | --- | --- |',...rows,'',
  '## 只读与未开放','',
  '| ID / 分组 | 原因 |','| --- | --- |',
  ...READ_ONLY.map((p)=>'| '+p.id+' | '+p.reason+' |'),'',
  '另不开放：密钥/cookie/账号身份、QQ准入、工具权限、鱼群保护硬闸、通知命令与URL、外部资源授权、记忆原文/遗忘/跨平台私密范围、硬金额和token上限。preferences.dislike 实际 feed 未使用，未列入可调目录。','',
  '## 证据层级','',
  '本地单元/集成测试、官方 Adapter 离线 wire、真实模型工具选择、真实 QQ/B站平台行为、DSH 桌面 composition 是分别验收的层级。真实模型与平台结果以 DELIVERY/LIVE 中本轮实际记录为准。','',
  'QQ 默认推荐不会覆盖本人或管理员的会话选择；已排定计时器保留时间。purpose 载体为 pet 时 QQ 不为该消费者出具采用证明。B站兴趣与分享等参数即使可保存，也会在缺少实际读点证据时保持 saved-unverified。','',
  '窗口只允许非重叠同日范围；跨午夜可拆为两窗。本轮受管 minGap 至少1分钟；原有未经管理的历史配置仍按上游兼容路径读取。每日0只禁自动浏览，skipChance仍轻醒。','',
].join('\n');
fs.writeFileSync(path.join(repo,'docs','life-settings','COVERAGE.md'),text);
console.log(JSON.stringify({parameters:PARAMETERS.length,autonomous:PARAMETERS.filter((p)=>p.permission==='autonomous').length,approval:PARAMETERS.filter((p)=>p.permission==='approval').length}));
