// 先确认"这串 cookie 是哪个号"——任何写操作之前都该跑一次。
import { createHash } from 'node:crypto'
import { loadBiliCredential, redactBiliCredentialText } from '../lib/session.mjs'

async function main() {
let loaded
try { loaded = loadBiliCredential() }
catch (error) {
  console.error(String(error.message))
  process.exitCode = 3
  return
}
const { credential: cred, source } = loaded
const credPath = source.file
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const nav = await (await fetch('https://api.bilibili.com/x/web-interface/nav', {
  headers: {
    'user-agent': UA,
    referer: 'https://www.bilibili.com/',
    cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}`,
  },
})).json()
if (nav.code !== 0) {
  console.error(redactBiliCredentialText(`登录态无效: code=${nav.code} ${nav.message}（cookie 过期或抄错，重新复制一次）`, cred))
  process.exitCode = 4
  return
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    ok: true, loggedIn: nav.data?.isLogin === true,
    uidHash: createHash('sha256').update(String(nav.data?.mid ?? '')).digest('hex'),
    source: { kind: source.kind, readOnly: true, copied: false },
  }))
  // Let HTTPS/stdio handles close naturally. Forced exit after an async TLS
  // request can hit UV_HANDLE_CLOSING on Windows Node 24.
  process.exitCode = nav.data?.isLogin === true ? 0 : 4
  return
}
console.log('凭据有效 ✓')
console.log(`  账号      : ${nav.data.uname}`)
console.log(`  mid       : ${nav.data.mid}`)
console.log(`  手机绑定  : ${nav.data.mobile_verified ? '是（发评论/动态需要）' : '否 ← 会被拒'}`)
console.log(`  硬币      : ${nav.data.money}   等级: ${nav.data.level_info?.current_level ?? '-'}`)
console.log(`  凭据文件  : ${credPath}`)
console.log('\n⚠️ 确认这就是你要用来操作的那个号；若显示的是主号，请换成小号再继续。')
}

await main().catch((error) => {
  // Avoid vendor stacks/headers; a failed request is not a successful login.
  console.error('BILI_SESSION_READ_FAILED: ' + (error?.name || 'Error'))
  process.exitCode = 4
})
