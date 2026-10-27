import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManager } from '../src/life-settings/manager.js';
import { scopePaths, readJson } from '../src/life-settings/file-store.js';

const args=process.argv.slice(2);
const command=args.shift() || 'help';
const option=(name)=> {const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const root=path.resolve(option('root') || path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
// CLI defaults to the independent repository's local state, never a user's active DSH home.
const dshHome=path.resolve(option('dsh-home') || path.join(root,'state','life-local-home'));
const manager=createManager({root,dshHome,operator:command==='approve'});
const input=()=> option('input')?JSON.parse(fs.readFileSync(option('input'),'utf8')):JSON.parse(option('json') || '{}');
try {
  let output;
  switch(command) {
    case 'state': output=manager.state();break;
    case 'catalog': output=manager.catalog(option('query')||'');break;
    case 'explain': output=manager.explain(option('id'));break;
    case 'preview': output=manager.preview(input());break;
    case 'apply': output=manager.apply(option('plan'));break;
    case 'verify': output=manager.verify(option('change'));break;
    case 'history': output=manager.history(input());break;
    case 'rollback': output=manager.rollback(input());break;
    case 'observe': output=manager.observe(input());break;
    case 'approve': output=manager.approve({planId:option('plan'),expectedRevision:Number(option('revision')),reason:option('reason')});break;
    case 'recover-lock': {
      const paths=scopePaths({root,dshHome});
      const lock=readJson(path.join(paths.lock,'owner.json'),null);
      if (!lock || !Number.isInteger(lock.pid) || lock.pid<1) throw new Error('锁归属不明；保留现场供人工检查');
      let alive=false;try{process.kill(lock.pid,0);alive=true;}catch{}
      if(alive)throw new Error('锁持有进程仍存在，禁止恢复');
      const quarantine=paths.lock+'.abandoned-'+Date.now();
      fs.renameSync(paths.lock,quarantine);
      output={status:'abandoned-lock-quarantined',quarantine};break;
    }
    default: output={usage:'node scripts/life-settings.mjs <state|catalog|explain|preview|apply|verify|history|rollback|observe|approve|recover-lock> [--dsh-home isolatedHome] [--root independentRepo]',
      inputs:'preview/rollback/observe 接受 --input UTF-8.json；apply --plan ID；explain --id 参数ID；approve --plan ID --revision N --reason 维护者说明',
      home:dshHome,note:'此 CLI 默认本仓库隔离 home；接入 DSH 使用显式准备的 MCP patch。'};
  }
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
}catch(error){process.stderr.write(JSON.stringify({status:'rejected',error:error.message})+'\n');process.exitCode=1;}
