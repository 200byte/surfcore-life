#!/usr/bin/env node
/** One-shot, local-only evidence adapter. No platform, model or network calls. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BY_ID } from '../src/life-settings/catalog.js';
import { scopePaths, readState, atomicWrite, readJson } from '../src/life-settings/file-store.js';

const SOURCE = 'surfcore-life-settings';
const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const knownTime = (value) => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value))
  ? new Date(value).toISOString() : null;

function sourceRows(state, sourceFile) {
  const rows = [];
  for (const [collection, values] of [['history', state.history], ['observations', state.observations]]) {
    const seen = new Set();
    for (const item of values) {
      const nativeId = typeof item?.id === 'string' && item.id ? item.id
        : collection === 'history' && Number.isSafeInteger(item?.revision) ? `revision-${item.revision}` : null;
      if (!nativeId || !/^(?:change|observation)-[a-fA-F0-9-]{36}$|^revision-\d+$/.test(nativeId) || seen.has(nativeId)) {
        throw new Error(`INVALID_OR_DUPLICATE_RECORD_ID: ${collection}`);
      }
      seen.add(nativeId);
      const changes = Array.isArray(item.changes) ? item.changes : [];
      const parameterIds = [...new Set(changes.map((change) => change?.id).filter((id) => BY_ID.has(id)))].sort();
      const revision = Number.isSafeInteger(item.revision) ? item.revision : null;
      rows.push({
        record_id: `${SOURCE}:${state.scopeId}:${collection}:${digest(nativeId)}`,
        source: `${SOURCE}.${collection}`,
        occurred_at: knownTime(item.occurredAt ?? item.createdAt ?? item.at),
        original_location: { path: sourceFile, collection, native_id: nativeId },
        raw_hash: digest(item), raw: item,
        content: {
          event_kind: collection === 'history' ? 'configuration_change' : 'agent_observation',
          revision, parameter_ids: parameterIds,
          change_count: collection === 'history' ? changes.length : null,
          related_change_record_id: collection === 'observations' && typeof item.changeId === 'string'
            ? `${SOURCE}:${state.scopeId}:history:${digest(item.changeId)}` : null,
          decision: collection === 'observations' && ['undecided', 'keep', 'consider-revert'].includes(item.decision) ? item.decision : null,
          // Never infer emotion, mastery, human choice or platform success from this entry.
          statement_origin: collection === 'observations' ? 'agent_recorded_not_independently_verified' : 'configuration_transaction',
          private_fields: 'withheld_local_review', values_and_reasons_exported: false,
        },
      });
    }
  }
  return rows;
}

function versionRecord(row, previous, at, status = 'present') {
  const version = (previous?.version ?? 0) + 1;
  const content = status === 'removed'
    ? { event_kind: 'source_removed', meaning: 'Absent from a successful complete source scan; pending review, not proof of deletion or forgetting.' }
    : row.content;
  const record = {
    schema_version: 1, source: row.source, record_id: row.record_id,
    version, status, occurred_at: status === 'removed' ? null : row.occurred_at,
    observed_at: at, content, content_hash: digest(content), original_location: row.original_location,
    evidence_type: status === 'removed' ? 'source_removal_observation'
      : row.source.endsWith('.observations') ? 'agent_claim' : 'configuration_change',
    review_status: 'pending',
  };
  record.evidence_id = digest([record.record_id, version, record.content_hash, status]);
  return record;
}

function pieces(directory, prefix, rows, byteLimit = 1_000_000) {
  fs.mkdirSync(directory, { recursive: true });
  const files = [];
  let lines = [], bytes = 0, part = 0;
  const flush = () => {
    if (!lines.length) return;
    const text = lines.join('');
    const file = `${prefix}.${String(++part).padStart(4, '0')}.jsonl`;
    fs.writeFileSync(path.join(directory, file), text, { flag: 'wx', mode: 0o600 });
    files.push({ file, bytes: Buffer.byteLength(text), records: lines.length, sha256: digest(text), oversize_record: lines.length === 1 && bytes > byteLimit });
    lines = []; bytes = 0;
  };
  for (const row of rows) {
    const line = canonical(row) + '\n';
    const size = Buffer.byteLength(line);
    if (lines.length && bytes + size > byteLimit) flush();
    lines.push(line); bytes += size;
    if (size > byteLimit) flush();
  }
  flush();
  return files;
}

/** Safe public projection always excludes reasons, observation text and parameter values. */
export function exportLifeSettings({ root, dshHome, out, includePrivateReasons = false, now = () => new Date().toISOString() } = {}) {
  if (!root || !dshHome || !out) throw new Error('EXPLICIT_PATHS_REQUIRED: --root --dsh-home --out');
  const paths = scopePaths({ root, dshHome });
  const output = path.resolve(out);
  const source = path.resolve(paths.state);
  if (output === paths.dir || output === paths.root || output === paths.dshHome || source.startsWith(output + path.sep) || output.startsWith(source + path.sep)) {
    throw new Error('OUTPUT_MUST_BE_SEPARATE: use a dedicated export directory');
  }
  if (!fs.existsSync(source)) return { ok: true, source_status: 'missing', new_versions: 0, snapshot_id: null,
    gap: 'Source absent; previous exported records were preserved, no removal observations generated.' };
  // Complete validated read happens before any export mutation; bad/mismatched source fails closed.
  const state = readState(paths);
  const rows = sourceRows(state, source);
  const at = knownTime(now());
  if (!at) throw new Error('INVALID_OBSERVATION_TIME');
  fs.mkdirSync(output, { recursive: true });
  const privateDir = path.join(output, '.private');
  fs.mkdirSync(privateDir, { recursive: true });
  const lock = path.join(privateDir, 'export.lock');
  try { fs.mkdirSync(lock); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('EXPORT_BUSY: inspect the existing export lock before retrying');
    throw error;
  }
  const owner = path.join(lock, 'owner.json');
  try {
    fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, at }), { flag: 'wx', mode: 0o600 });
    const ledgerPath = path.join(privateDir, 'ledger.json');
    const ledger = readJson(ledgerPath, { schema: 1, scopeId: paths.scopeId, current: {}, versions: [] });
    if (ledger.schema !== 1 || ledger.scopeId !== paths.scopeId || !Array.isArray(ledger.versions) || !ledger.current || typeof ledger.current !== 'object') {
      throw new Error('INVALID_EXPORT_CHECKPOINT: preserve files and inspect scope');
    }
    const seen = new Set();
    const added = [];
    for (const row of rows) {
      seen.add(row.record_id);
      const previous = ledger.current[row.record_id];
      if (previous?.raw_hash === row.raw_hash && previous.status !== 'removed') continue;
      const record = versionRecord(row, previous, at, previous?.status === 'removed' ? 'restored' : 'present');
      ledger.current[row.record_id] = { raw_hash: row.raw_hash, version: record.version, status: record.status, record };
      ledger.versions.push(record); added.push(record);
    }
    for (const [id, previous] of Object.entries(ledger.current)) {
      if (seen.has(id) || previous.status === 'removed') continue;
      const record = versionRecord(previous.record, previous, at, 'removed');
      ledger.current[id] = { raw_hash: null, version: record.version, status: 'removed', record };
      ledger.versions.push(record); added.push(record);
    }
    if (includePrivateReasons) {
      // Explicit opt-in is still local/private; this file must never enter the public package.
      const privateId = digest(rows.map((row) => [row.record_id, row.raw_hash]));
      const privateFile = path.join(privateDir, 'full', privateId + '.json');
      if (!fs.existsSync(privateFile)) atomicWrite(privateFile, {
        schema: 1, scopeId: paths.scopeId, observed_at: at, source,
        sharing: 'LOCAL_ONLY_PENDING_REVIEW', records: rows.map((row) => ({ record_id: row.record_id, raw: row.raw })),
      });
    }
    const current = Object.values(ledger.current).map((entry) => entry.record).sort((a, b) => a.record_id.localeCompare(b.record_id));
    const snapshotId = digest({ scope: paths.scopeId, current, versions: ledger.versions });
    const publicDir = path.join(output, 'public');
    const snapshotDir = path.join(publicDir, 'snapshots', snapshotId);
    if (!fs.existsSync(snapshotDir)) {
      // Build privately, then rename a complete directory; interruptions never publish half a snapshot.
      const staging = path.join(privateDir, 'staging-' + randomUUID());
      fs.mkdirSync(staging);
      const records = pieces(path.join(staging, 'records'), 'life-settings', current);
      const versions = pieces(path.join(staging, 'versions'), 'life-settings', ledger.versions);
      const timeline = pieces(path.join(staging, 'timeline'), 'index', ledger.versions.map((record) => ({
        record_id: record.record_id, evidence_id: record.evidence_id, version: record.version,
        occurred_at: record.occurred_at, observed_at: record.observed_at, source: record.source,
        time_basis: record.occurred_at ? 'source_event_time' : 'unknown_not_inferred_from_export',
      })));
      atomicWrite(path.join(staging, 'manifest.json'), {
        schema: 'surfcore-life-export/v1', snapshot_id: snapshotId, scope_id: paths.scopeId,
        created_at: at, source_status: 'read_only_complete_state_arrays', source_revision: state.revision,
        privacy: 'metadata_only_reasons_observation_text_and_values_withheld',
        counts: { current: current.length, versions: ledger.versions.length, removed: current.filter((record) => record.status === 'removed').length },
        files: { records, versions, timeline },
        interpretation: 'Agent observations are claims; transactions are configuration facts, not proof of platform action or permanent preference.',
        gaps: ['No private reasons or observation text in public records', 'No raw memory, credentials, plans or runtime prompts exported', 'Official model wire, billing, external platform acceptance are separate evidence', 'No automatic GitHub publication or dots read'],
      });
      fs.mkdirSync(path.dirname(snapshotDir), { recursive: true });
      fs.renameSync(staging, snapshotDir);
    }
    // A failed build leaves the old pointer/checkpoint; next run uses a new private staging directory.
    const manifest = readJson(path.join(snapshotDir, 'manifest.json'), null);
    if (manifest?.snapshot_id !== snapshotId) throw new Error('INCOMPLETE_SNAPSHOT: inspect before updating pointer');
    for (const [directory, files] of Object.entries(manifest.files || {})) {
      if (!['records', 'versions', 'timeline'].includes(directory) || !Array.isArray(files)) throw new Error('INVALID_SNAPSHOT_MANIFEST');
      for (const file of files) {
        if (typeof file.file !== 'string' || path.basename(file.file) !== file.file || !/^[A-Za-z0-9.-]+\.jsonl$/.test(file.file)) throw new Error('INVALID_SNAPSHOT_PATH');
        const data = fs.readFileSync(path.join(snapshotDir, directory, file.file));
        if (data.byteLength !== file.bytes || digest(data.toString('utf8')) !== file.sha256) throw new Error('SNAPSHOT_HASH_MISMATCH: preserve checkpoint and inspect export');
      }
    }
    atomicWrite(ledgerPath, ledger);
    atomicWrite(path.join(publicDir, 'LATEST.json'), {
      schema: 'surfcore-life-export-pointer/v1', snapshot_id: snapshotId,
      manifest: `snapshots/${snapshotId}/manifest.json`,
      manifest_sha256: digest(fs.readFileSync(path.join(snapshotDir, 'manifest.json'), 'utf8')),
      checked_at: at, new_versions: added.length,
    });
    atomicWrite(path.join(publicDir, 'HEALTH.json'), {
      checked_at: at, source_status: 'read_only_complete_state_arrays', source_revision: state.revision,
      snapshot_id: snapshotId, new_versions: added.length, local_exported: true, github_published: false, dots_read_verified: false,
    });
    return { ok: true, source_status: 'read_only_complete_state_arrays', snapshot_id: snapshotId,
      current_records: current.length, total_versions: ledger.versions.length, new_versions: added.length,
      latest: path.join(publicDir, 'LATEST.json'), local_saved: true, local_exported: true,
      github_published: false, dots_read_verified: false };
  } finally {
    if (fs.existsSync(owner)) fs.unlinkSync(owner);
    fs.rmdirSync(lock);
  }
}

function cli(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help') return console.log('node scripts/export-life-settings.mjs --root <repo> --dsh-home <isolated-or-authorized-home> --out <dedicated-output> [--include-private-reasons]');
    if (flag === '--include-private-reasons') { args.includePrivateReasons = true; continue; }
    const key = { '--root': 'root', '--dsh-home': 'dshHome', '--out': 'out' }[flag];
    if (!key || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('UNKNOWN_OR_MISSING_ARGUMENT');
    args[key] = argv[++index];
  }
  console.log(JSON.stringify(exportLifeSettings(args), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(process.argv.slice(2)); }
  catch (error) { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
}
