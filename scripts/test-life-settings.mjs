import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createManager } from '../src/life-settings/manager.js';
import { scopePaths, emptyState, atomicWrite, readState, readJson, withStateLock } from '../src/life-settings/file-store.js';
import { applyManagedSettings, extractManagedValues, publishRuntimeEvidence, readRuntimeEvidence, compactLifeState } from '../src/life-settings/runtime.js';
import { writeDailyUsage } from '../src/token-budget.js';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'surfcore-life-core-'));
const root=path.join(temp,'root'), dshHome=path.join(temp,'home'), scope={root,dshHome};
fs.mkdirSync(root,{recursive:true});
const paths=scopePaths(scope), manager=createManager(scope);
atomicWrite(paths.qq,{socialV2:{proactive:{probability:0.3}},secretNeverExpose:'PRIVATE_SENTINEL',dsh:{authToken:'PRIVATE_SENTINEL'}});
const original=fs.readFileSync(paths.qq,'utf8');
let passed=0;
const test=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
try {
  await test('state never claims configuration as adopted or exposes secrets',()=>{
    const state=manager.state();assert.ok(state.parameters.every((p)=>p.effectiveValue===null));
    assert.ok(!JSON.stringify(state).includes('PRIVATE_SENTINEL'));
    assert.equal(state.budget.officialBookedAmount,null);
  });
  await test('catalog discovery / description / protected writes',()=>{
    assert.ok(manager.catalog('群聊').parameters.some((p)=>p.id.startsWith('qq.')));
    assert.equal(manager.explain('qq.dsh.reasoningEffort').reason.includes('实际请求'),true);
    for(const patch of [
      {'qq.dsh.authToken':'secret'},{'qq.socialV2.tokenGuard.maxDailyCostCNY':999},
      {'__proto__.polluted':true},{'bili.agent.sandbox':'danger-full-access'},
      {'qq.socialV2.proactive.probability':NaN},{'qq.socialV2.proactive.probability':1.1},
      {'qq.socialV2.proactive.enabled':'true'},{'purpose.dailyMax':0},
    ])assert.throws(()=>manager.preview({patch,reason:'boundary test'}));
    assert.equal({}.polluted,undefined);
  });
  let plan,changed;
  await test('preview couples sleep range but does not apply or alter base',()=>{
    plan=manager.preview({patch:{'qq.socialV2.wake.recommendedSleepMinMs':10800000},reason:'想多独处一会'});
    assert.equal(plan.changes.find((c)=>c.id.endsWith('MaxMs')).after,10800000);
    assert.equal(manager.state().revision,0);
    assert.equal(readState(paths).overrides['qq.socialV2.wake.recommendedSleepMinMs'],undefined);
    assert.equal(fs.readFileSync(paths.qq,'utf8'),original);
  });
  await test('single atomic revision / idempotency / independent proof',()=>{
    changed=manager.apply(plan.id);
    assert.equal(changed.status,'saved-unverified');assert.equal(changed.revision,1);
    assert.equal(manager.apply(plan.id).status,'already-applied');
    assert.equal(manager.verify(changed.changeId).status,'saved-unverified');
    const adopted=applyManagedSettings({socialV2:{}},'qq',scope);
    publishRuntimeEvidence('qq',{revision:1,values:extractManagedValues(adopted,'qq'),details:{mode:'local-simulation'}},scope);
    assert.equal(manager.verify(changed.changeId).status,'runtime-adopted');
    assert.equal(manager.verify(changed.changeId).validationScope,'local-simulation');
    assert.equal(fs.readFileSync(paths.qq,'utf8'),original);
  });
  await test('old/dead/stopped/mismatched evidence is not adoption',()=>{
    const e=readJson(path.join(paths.runtime,'qq.json'),null);
    for(const patch of [
      {observedAt:new Date(Date.now()-1000000).toISOString()},
      {scopeId:'different-life'},{pid:2147483647},{details:{running:false}},
    ]) {
      atomicWrite(path.join(paths.runtime,'qq.json'),{...e,...patch});
      assert.equal(manager.verify(changed.changeId).status,'saved-unverified');
    }
    atomicWrite(path.join(paths.runtime,'qq.json'),{...e,revision:0});
    assert.equal(manager.verify(changed.changeId).checks[0].status,'pending-runtime-reload');
    atomicWrite(path.join(paths.runtime,'qq.json'),e);
  });
  await test('history, observation and rollback restore prior values',()=>{
    manager.observe({changeId:changed.changeId,text:'隔离计时器采用了更长时间，未发生平台活动',decision:'consider-revert'});
    const undo=manager.rollback({changeId:changed.changeId,reason:'恢复之前设置'});
    assert.equal(manager.state().revision,1);
    const reverted=manager.apply(undo.id);
    assert.equal(reverted.revision,2);
    assert.equal(readState(paths).overrides['qq.socialV2.wake.recommendedSleepMinMs'],300000);
    assert.equal(manager.history().observations[0].kind,'agent-reported-observation');
    assert.equal(manager.verify(changed.changeId).status,'superseded');
  });
  await test('approval cannot be self-granted or reused for changed plan',()=>{
    const p=manager.preview({patch:{'qq.socialV2.context.wakeMaxChars':8000},reason:'需要更多上下文'});
    assert.equal(p.status,'approval-required');
    assert.throws(()=>manager.apply(p.id),/APPROVAL_REQUIRED/);
    assert.throws(()=>manager.approve({planId:p.id,reason:'self',expectedRevision:2}),/OPERATOR_ONLY/);
    const operator=createManager({...scope,operator:true});
    operator.approve({planId:p.id,reason:'批准此隔离测试计划',expectedRevision:2});
    assert.equal(manager.apply(p.id).revision,3);
  });
  await test('stale plan and base-file changes rejected',()=>{
    const p=manager.preview({patch:{'purpose.enabled':false},reason:'conflict1'});
    const q=manager.preview({patch:{'qq.socialV2.proactive.enabled':false},reason:'conflict2'});
    manager.apply(q.id);
    assert.throws(()=>manager.apply(p.id),/CONFIG_CONFLICT/);
    const r=manager.preview({patch:{'purpose.enabled':false},reason:'base conflict'});
    atomicWrite(paths.qq,{...readJson(paths.qq,{}),humanUnrelatedChange:true});
    assert.throws(()=>manager.apply(r.id),/CONFIG_CONFLICT/);
    assert.equal(readJson(paths.qq,{}).humanUnrelatedChange,true);
  });
  await test('rollback refuses later same-field decision / locked precondition',()=>{
    const p=manager.preview({patch:{'qq.socialV2.proactive.probability':0.5},reason:'first'});
    const c=manager.apply(p.id);
    manager.apply(manager.preview({patch:{'qq.socialV2.proactive.probability':0.6},reason:'later'}).id);
    assert.throws(()=>manager.rollback({changeId:c.changeId,reason:'undo'}),/ROLLBACK_CONFLICT/);
    assert.throws(()=>manager.preview({patch:{'purpose.enabled':false},reason:'interleaved rollback',expectedRevision:0}),/ROLLBACK_CONFLICT/);
  });
  await test('Bili coupling rejects impossible global gaps and accepts inactive capacity',()=>{
    assert.throws(()=>manager.preview({patch:{
      'bili.night.windows':[{start:'20:00',end:'20:01',wakes:1},{start:'20:01',end:'20:02',wakes:1}],
      'bili.night.maxWakesPerDay':2,'bili.night.minGapMin':120,
    },reason:'impossible'}),/INFEASIBLE_GLOBAL_GAP/);
    assert.ok(manager.preview({patch:{'bili.night.windows':[{start:'20:00',end:'24:00',wakes:4}],'bili.night.maxWakesPerDay':1,'bili.night.minGapMin':120},reason:'capacity is not mandatory'}));
    const p=manager.preview({intent:'more-exploration',reason:'想增加浏览机会'});
    assert.equal(p.changes.find((c)=>c.id==='bili.night.windows').coupled,true);
    assert.throws(()=>manager.preview({patch:{'bili.night.windows':[]},reason:'empty'}),/INVALID_VALUE/);
  });
  await test('interest dependencies are explicit, unknown topic weights rejected',()=>{
    assert.throws(()=>manager.preview({patch:{'bili.preferences.weights':{unknown:2}},reason:'weight'}),/UNKNOWN_INTEREST_WEIGHT/);
    const p=manager.preview({patch:{'bili.preferences.like':['编程'],'bili.preferences.keywords':['编程','猫'],'bili.preferences.weights':{'编程':2}},reason:'explicit preference'});
    assert.deepEqual(p.changes.find((c)=>c.id==='bili.preferences.keywords').after,['猫']);
  });
  await test('fresh budget is estimate only; stale usage is unknown',()=>{
    writeDailyUsage(paths.dir,{qq:{cost:2,tokens:1234}});
    const b=manager.state().budget;assert.equal(b.scopes.qq.remaining.estimatedCny,6);assert.equal(b.officialBookedAmount,null);
    assert.equal(b.latestCacheHitRate,null);
    const board=compactLifeState({platform:'qq',wakeReason:'local-test'},scope);
    assert.ok(board.includes('本地预算余量'));assert.ok(board.length<1100);
    writeDailyUsage(paths.dir,{qq:{cost:2}},{at:Date.now()-600000});
    assert.equal(manager.state().budget.scopes.qq.remaining,null);
  });
  await test('cross-process contention commits exactly one revision',async()=>{
    const p=manager.preview({patch:{'purpose.enabled':false},reason:'writer1'});
    const q=manager.preview({patch:{'qq.socialV2.proactive.probability':0.7},reason:'writer2'});
    const before=manager.state().revision;
    const moduleUrl=new URL('../src/life-settings/manager.js',import.meta.url).href;
    const code="import {createManager} from "+JSON.stringify(moduleUrl)+";try{createManager(JSON.parse(process.argv[1])).apply(process.argv[2]);process.exitCode=0;}catch{process.exitCode=2;}";
    const run=(id)=>new Promise((resolve)=>{
      const child=spawn(process.execPath,['--input-type=module','-e',code,JSON.stringify(scope),id],{stdio:'ignore',windowsHide:true});
      child.on('exit',(code)=>resolve(code));child.on('error',(e)=>{throw e;});
    });
    const outcomes=await Promise.all([run(p.id),run(q.id)]);
    assert.equal(outcomes.filter((x)=>x===0).length,1);assert.equal(manager.state().revision,before+1);
  });
  await test('failure and abandoned lock preserve previous bytes',()=>{
    const before=fs.readFileSync(paths.state,'utf8');
    withStateLock(paths,()=>assert.throws(()=>manager.preview({patch:{'purpose.enabled':false},reason:'busy'}),/CONFIG_BUSY/));
    assert.equal(fs.readFileSync(paths.state,'utf8'),before);
    const backupPath=paths.backups;
    const quarantine=backupPath+'.test-quarantine';
    fs.renameSync(backupPath,quarantine);fs.writeFileSync(backupPath,'block backup directory');
    assert.throws(()=>manager.preview({patch:{'qq.socialV2.proactive.probability':0.8},reason:'disk failure'}));
    assert.equal(fs.readFileSync(paths.state,'utf8'),before);
    fs.unlinkSync(backupPath);fs.renameSync(quarantine,backupPath);
    fs.writeFileSync(paths.state,'{broken');
    assert.throws(()=>manager.state(),/CORRUPT_FILE/);
    assert.throws(()=>manager.preview({patch:{'purpose.enabled':false},reason:'corrupt'}),/CORRUPT_FILE/);
    assert.equal(fs.readFileSync(paths.state,'utf8'),'{broken');
  });
  console.log(passed+'/'+passed+' core settings scenarios passed');
}finally{
  // Only the absolute directory returned by mkdtempSync for this fixture.
  fs.rmSync(temp,{recursive:true,force:true});
}
