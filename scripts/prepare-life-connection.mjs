/**
 * Prepare a reviewable patch ONLY. Does not install/modify ~/.dsh or restart anything.
 * The same DSH_HOME and SURFCORE_ROOT must be shared by bridge, scheduler and this MCP.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const option=(key)=>{const i=args.indexOf('--'+key);return i<0?undefined:args[i+1];};
const dshHome=path.resolve(option('dsh-home')||path.join(root,'state','life-local-home'));
const out=path.resolve(option('out')||path.join(root,'state','life-connection','cordis.patch.yml'));
if(fs.existsSync(out))throw new Error('输出已存在；选择新文件供比较，不覆盖');
const yaml=(s)=>JSON.stringify(s);
const text=[
  '# Review then merge into your independently chosen DSH profile. No automatic install.',
  '- insert:',
  '    - id: mcp-surfcore-life',
  "      name: '@deepseek-ai/dsh-mcp-client'",
  '      config:',
  '        serverName: surfcore-life',
  '        transport: stdio',
  '        command: '+yaml(process.execPath),
  '        args:',
  '          - '+yaml(path.join(root,'src','mcp-life-settings.js')),
  '        env:',
  '          DSH_HOME: '+yaml(dshHome),
  '          SURFCORE_ROOT: '+yaml(root),
  '',
].join('\n');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,text,{flag:'wx',mode:0o600});
process.stdout.write(JSON.stringify({status:'prepared-only',file:out,root,dshHome,installed:false,restarted:false})+'\n');
