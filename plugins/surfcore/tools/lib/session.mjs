/** Operator-only credential source reference for the two read-only consumers. */
import fs from 'node:fs'
import path from 'node:path'
import { accountBili } from './state-paths.mjs'

export function loadBiliCredential({ env = process.env, fallbackFile = accountBili('credentials.json') } = {}) {
  const reference = env.SURFCORE_BILI_CREDENTIAL_FILE
  if (reference && !path.isAbsolute(reference)) throw new Error('BILI_CREDENTIAL_REF_MUST_BE_ABSOLUTE')
  const file = reference || fallbackFile
  let data
  try { data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }
  catch { throw new Error('BILI_CREDENTIAL_UNAVAILABLE_OR_INVALID_JSON') }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('BILI_CREDENTIAL_INVALID_OBJECT')
  const credential = {}
  for (const key of ['sessdata', 'bili_jct', 'buvid3']) {
    const value = data[key]
    if (typeof value !== 'string' || !value.trim() || value.length > 10_000 || /[;\r\n\0]/.test(value)) throw new Error('BILI_CREDENTIAL_INVALID_FIELD: ' + key)
    credential[key] = value.trim()
  }
  if (data.dedeuserid !== undefined && data.dedeuserid !== '') {
    const id = typeof data.dedeuserid === 'number' && Number.isSafeInteger(data.dedeuserid) ? String(data.dedeuserid) : data.dedeuserid
    if (typeof id !== 'string' || !/^\d{1,24}$/.test(id)) throw new Error('BILI_CREDENTIAL_INVALID_FIELD: dedeuserid')
    credential.dedeuserid = id
  }
  return { credential, source: { kind: reference ? 'operator-file-reference' : 'default-local-file', file, readOnly: true, copied: false } }
}

export function redactBiliCredentialText(text, credential = {}) {
  let value = String(text)
  for (const secret of Object.values(credential)) if (typeof secret === 'string' && secret) value = value.split(secret).join('[REDACTED_BILI_CREDENTIAL]')
  return value.replace(/(?:SESSDATA|bili_jct|buvid3)\s*=\s*[^;\s]+/gi, '[REDACTED_COOKIE]')
}
