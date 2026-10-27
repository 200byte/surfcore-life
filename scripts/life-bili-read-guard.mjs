/** Opt-in QA preloader: credentials remain in native consumer memory. */
import fs from 'node:fs'
import path from 'node:path'

const originalFetch = globalThis.fetch
const allowed = new Set(['/x/web-interface/nav', '/x/web-interface/popular'])
const root = path.resolve(process.env.SURFCORE_ROOT || '.')
const logFile = path.join(root, 'state', 'bili-qa-requests.jsonl')
fs.mkdirSync(path.dirname(logFile), { recursive: true })
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  const method = String(init.method || input?.method || 'GET').toUpperCase()
  if (method !== 'GET' || url.protocol !== 'https:' || url.hostname !== 'api.bilibili.com' || !allowed.has(url.pathname)) throw new Error('BILI_QA_READ_ONLY_REQUEST_DENIED')
  const used = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).length : 0
  if (used >= 5) throw new Error('BILI_QA_REQUEST_LIMIT')
  const start = Date.now()
  try {
    const response = await originalFetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) })
    fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), method, host: url.hostname, path: url.pathname, status: response.status, durationMs: Date.now() - start }) + '\n')
    return response
  } catch (error) {
    fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), method, host: url.hostname, path: url.pathname, errorType: error?.name || 'Error', durationMs: Date.now() - start }) + '\n')
    throw new Error('BILI_QA_READ_FAILED: ' + (error?.name || 'Error'))
  }
}
