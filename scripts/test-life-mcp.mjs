import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { apply as applyGuard } from '../plugins/surfcore/qq-tool-restrict.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'surfcore-life-mcp-'));
const root=path.join(temp,'root'),dshHome=path.join(temp,'home');
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'config.json'),'{}\n');
let guard;
applyGuard({tools:{restrict(){},guard(fn){guard=fn;}}});
for(const name of ['state','catalog','explain','preview','apply','verify','history','rollback','observe'])assert.equal(guard({name:'mcp__surfcore-life__life_'+name}),undefined);
for(const name of ['life_approve','life_shell','life_write','arbitrary'])assert.ok(guard({name:'mcp__surfcore-life__'+name}));
assert.ok(guard({name:'pwsh'}));assert.ok(guard({name:'write'}));
const client=new Client({name:'isolated-scripted-agent',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(repo,'src','mcp-life-settings.js')],
  env:{...process.env,SURFCORE_ROOT:root,DSH_HOME:dshHome},stderr:'pipe'});
let stderr='';transport.stderr?.on('data',(chunk)=>stderr+=chunk);
try {
  await client.connect(transport);
  const list=await client.listTools();
  assert.equal(list.tools.length,9);
  assert.ok(!list.tools.some((t)=>t.name.includes('approve')));
  const call=async(name,args={})=>client.callTool({name,arguments:args});
  const unpack=(r)=>JSON.parse(r.content[0].text);
  const s=unpack(await call('life_state'));
  assert.equal(s.revision,0);assert.equal(s.runtime.qq.valid,false);
  const p=unpack(await call('life_preview',{intent:'less-disturbance',reason:'隔离脚本选择减少打扰，不代表真实生命选择'}));
  assert.equal(p.status,'ready-for-agent-choice');
  assert.equal(unpack(await call('life_state')).revision,0);
  const c=unpack(await call('life_apply',{planId:p.id}));
  assert.equal(c.revision,1);assert.equal(c.status,'saved-unverified');
  assert.equal(unpack(await call('life_verify',{changeId:c.changeId})).status,'saved-unverified');
  const no=await call('life_preview',{patch:{'qq.dsh.authToken':'forbidden'},reason:'boundary'});
  assert.equal(no.isError,true);assert.match(unpack(no).error,/PROTECTED/);
  const invalid=await call('life_apply',{planId:p.id,operator:true});
  assert.equal(invalid.isError,true);
  const back=unpack(await call('life_rollback',{changeId:c.changeId,reason:'恢复隔离演示初始值'}));
  assert.equal(unpack(await call('life_apply',{planId:back.id})).revision,2);
  const approve=unpack(await call('life_preview',{patch:{'qq.socialV2.context.wakeMaxChars':9000},reason:'approval check'}));
  assert.equal(approve.status,'approval-required');
  assert.equal((await call('life_apply',{planId:approve.id})).isError,true);
  const h=unpack(await call('life_history',{offset:0,limit:1}));
  assert.equal(h.records.length,1);assert.equal(h.total,2);assert.equal(h.nextOffset,1);
  assert.equal(stderr,'');
  console.log('PASS real MCP stdio: 9 discoverable schemas, preview/apply/verify/rollback/history, approval and strict guard boundaries');
}finally{
  await client.close();await transport.close();
  fs.rmSync(temp,{recursive:true,force:true});
}
