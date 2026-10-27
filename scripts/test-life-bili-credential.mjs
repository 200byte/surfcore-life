// Fixture only: no real credential source or platform network is accessed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { loadBiliCredential, redactBiliCredentialText } from '../plugins/surfcore/tools/lib/session.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
assert.doesNotMatch(fs.readFileSync(path.join(repo, 'plugins/surfcore/tools/verify/session.mjs'), 'utf8'), /process\.exit\s*\(/, 'HTTPS session reader must exit naturally after async work')
assert.doesNotMatch(fs.readFileSync(path.join(repo, 'plugins/surfcore/tools/commands/feed.mjs'), 'utf8'), /process\.exit\s*\(/, 'HTTPS feed reader must exit naturally after async work')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'surfcore-bili-credential-'))
const defaultFile = path.join(temp, 'default.json')
const refFile = path.join(temp, 'reference.json')
const marker = { sessdata: 'fixture-session-marker', bili_jct: 'fixture-csrf-marker', buvid3: 'fixture-buvid-marker', dedeuserid: '100000003', unrelated: 'must not be returned' }
fs.writeFileSync(defaultFile, JSON.stringify({ ...marker, sessdata: 'default-marker' }))
fs.writeFileSync(refFile, JSON.stringify(marker))
assert.equal(loadBiliCredential({ env: {}, fallbackFile: defaultFile }).credential.sessdata, 'default-marker')
const loaded = loadBiliCredential({ env: { SURFCORE_BILI_CREDENTIAL_FILE: refFile }, fallbackFile: defaultFile })
assert.equal(loaded.credential.sessdata, marker.sessdata)
assert.equal(loaded.source.kind, 'operator-file-reference')
assert.equal(loaded.source.readOnly, true)
assert.equal(loaded.source.copied, false)
assert.ok(!Object.hasOwn(loaded.credential, 'unrelated'))
const redacted = redactBiliCredentialText('Cookie SESSDATA=' + marker.sessdata + '; error=' + marker.bili_jct, loaded.credential)
assert.ok(!redacted.includes(marker.sessdata) && !redacted.includes(marker.bili_jct))
assert.throws(() => loadBiliCredential({ env: { SURFCORE_BILI_CREDENTIAL_FILE: 'relative.json' }, fallbackFile: defaultFile }), /ABSOLUTE/)
const bad = path.join(temp, 'bad.json')
fs.writeFileSync(bad, JSON.stringify({ ...marker, sessdata: 'unsafe; header=value' }))
assert.throws(() => loadBiliCredential({ env: { SURFCORE_BILI_CREDENTIAL_FILE: bad } }), /INVALID_FIELD: sessdata/)
fs.writeFileSync(bad, '{bad-json')
assert.throws(() => loadBiliCredential({ env: { SURFCORE_BILI_CREDENTIAL_FILE: bad } }), /INVALID_JSON/)

const root = path.join(temp, 'root')
const home = path.join(temp, 'home')
fs.mkdirSync(root, { recursive: true })
fs.mkdirSync(path.join(home, 'surfcore'), { recursive: true })
const cfg = path.join(home, 'surfcore', 'bili.config.json')
fs.writeFileSync(cfg, JSON.stringify({ preferences: { like: [], keywords: [], weights: {} } }))
// Fake transport is injected before the real read guard/native scripts; these
// calls never leave the process. Only synthetic marker credentials are used.
const preload = path.join(temp, 'offline-fetch.mjs')
fs.writeFileSync(preload, `
import assert from 'node:assert/strict';
globalThis.fetch = async (input,init={}) => {
  assert.equal(init.method || 'GET','GET');
  assert.ok(init.headers.cookie.includes('fixture-session-marker'));
  const url=new URL(input);
  if(url.pathname==='/x/web-interface/nav') return new Response(JSON.stringify({code:0,data:{isLogin:true,mid:'100000003',wbi_img:{img_url:'https://i.test/abcdefghijklmnopqrstuvwxyz012345.png',sub_url:'https://i.test/abcdefghijklmnopqrstuvwxyz012345.png'}}}));
  assert.equal(url.pathname,'/x/web-interface/popular');
  return new Response(JSON.stringify({code:0,data:{list:Array.from({length:8},(_,i)=>({bvid:'BV'+String(i).padStart(10,'0'),title:'fixture '+i,duration:90,stat:{danmaku:1,view:1000},owner:{name:'fixture'}}))}}));
};\n`)
const env = { ...process.env, DSH_HOME: home, SURFCORE_ROOT: root, SURFCORE_QQBOT_ROOT: root, USERPROFILE: temp, SURFCORE_BILI_CONFIG: cfg, SURFCORE_BILI_CREDENTIAL_FILE: refFile }
const invoke = (script, args) => JSON.parse(execFileSync(process.execPath, ['--import', pathToFileURL(preload).href, '--import', pathToFileURL(path.join(repo, 'scripts', 'life-bili-read-guard.mjs')).href, path.join(repo, script), ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
const login = invoke('plugins/surfcore/tools/verify/session.mjs', ['--json'])
assert.equal(login.loggedIn, true)
assert.equal(typeof login.uidHash, 'string')
assert.equal(login.uidHash.length, 64)
assert.ok(!JSON.stringify(login).includes(marker.dedeuserid))
const before = invoke('plugins/surfcore/tools/commands/feed.mjs', ['--source','popular','--pages','1','--n','5','--no-remember','--json'])
const after = invoke('plugins/surfcore/tools/commands/feed.mjs', ['--source','popular','--pages','1','--n','3','--no-remember','--json'])
assert.equal(before.items.length, 5)
assert.equal(after.items.length, 3)
assert.ok(!fs.existsSync(path.join(home,'surfcore','bili','credentials.json')))
assert.equal(fs.readFileSync(refFile,'utf8'), JSON.stringify(marker))
const requests = fs.readFileSync(path.join(root,'state','bili-qa-requests.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
assert.equal(requests.length,5)
assert.ok(requests.every((r)=>r.method==='GET'))
console.log('PASS credential ref/default/schema/redaction + native nav/feed 5->3 through GET-only guard (offline fixtures only)')
console.log('fixture:',temp)
