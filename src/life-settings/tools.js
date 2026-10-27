import { z } from 'zod';
import { createManager } from './manager.js';

/** Native MCP tools, intentionally no approve, source read, shell or arbitrary file writer. */
export function registerLifeTools(server, options = {}) {
  const manager = createManager(options);
  const tool = (name, description, shape, run) => server.registerTool(name, {
    description, inputSchema: z.object(shape).strict(),
  }, async (args) => {
    try { return {content:[{type:'text',text:JSON.stringify(await run(args),null,2)}]}; }
    catch (error) { return {isError:true,content:[{type:'text',text:JSON.stringify({status:'rejected',error:String(error.message)})}]}; }
  });
  const id=z.string().min(1).max(100);
  const reason=z.string().min(1).max(1200);
  tool('life_state','查询系统事实：保存值、运行时采用证据、待生效、调度、预算和未知项。配置采用不是平台行为证明。',{},()=>manager.state());
  tool('life_catalog','发现能自行调整的生活参数和意图方案；不搜索源码，不执行修改。',{query:z.string().max(200).optional()},({query})=>manager.catalog(query));
  tool('life_explain','理解一个参数的影响、成本、依赖、生效和恢复办法。',{id},({id})=>manager.explain(id));
  tool('life_preview','预览精确计划。patch 的键必须是目录中的稳定 ID，或提供一个明确 intent；不会执行。',{patch:z.record(z.string(),z.unknown()).optional(),intent:z.string().max(80).optional(),reason,experience:z.string().max(1200).optional()},(args)=>manager.preview(args));
  tool('life_apply','在本人选择后执行已预览计划；并发或审批不满足时拒绝。返回已保存，之后需 verify。',{planId:id},({planId})=>manager.apply(planId));
  tool('life_verify','检查独立运行时读点；停用、旧版本、过期或未观察都不假装生效。',{changeId:id.optional()},({changeId})=>manager.verify(changeId));
  tool('life_history','分页查修改及后续观察；不把规则推断写成真实心理或自动接受永久偏好。',{offset:z.number().int().min(0).optional(),limit:z.number().int().min(1).max(100).optional()},(args)=>manager.history(args));
  tool('life_rollback','预览恢复某次修改前的值；拒绝覆盖后来改变的同一参数。返回计划，仍需本人调用 apply。',{changeId:id,reason},(args)=>manager.rollback(args));
  tool('life_observe','记录本人明确报告的观察和保留/考虑撤回选择；不自动修改设置或伪造平台结果。',{changeId:id,text:reason,decision:z.enum(['undecided','keep','consider-revert']).optional(),evidenceRef:z.string().max(1200).optional()},(args)=>manager.observe(args));
  return manager;
}
