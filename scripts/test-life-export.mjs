/** Reproducible local export acceptance: real manager, private fixtures, no live platforms. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createManager } from '../src/life-settings/manager.js';
import { atomicWrite, emptyState, readState, scopePaths } from '../src/life-settings/file-store.js';
import { exportLifeSettings } from './export-life-settings.mjs';

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'surfcore-life-export-test-'));
const priorBiliConfig = process.env.SURFCORE_BILI_CONFIG;
const root = path.join(fixture, 'repo');
const dshHome = path.join(fixture, 'dsh');
const out = path.join(fixture, 'export');
const options = { root, dshHome, out };
const secret = 'PRIVATE_REASON_SENTINEL_REMAINS_LOCAL';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const allFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? allFiles(file) : [file];
});
const latestPath = path.join(out, 'public', 'LATEST.json');
function snapshotRows(output = out) {
  const pointer = JSON.parse(fs.readFileSync(path.join(output, 'public', 'LATEST.json'), 'utf8'));
  const directory = path.join(output, 'public', 'snapshots', pointer.snapshot_id);
  const manifestBytes = fs.readFileSync(path.join(directory, 'manifest.json'));
  assert.equal(sha256(manifestBytes), pointer.manifest_sha256);
  const manifest = JSON.parse(manifestBytes);
  const rows = [];
  for (const file of manifest.files.records) {
    const bytes = fs.readFileSync(path.join(directory, 'records', file.file));
    assert.equal(bytes.byteLength, file.bytes);
    assert.equal(sha256(bytes), file.sha256);
    const records = bytes.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.equal(records.length, file.records);
    rows.push(...records);
  }
  return { rows, manifest, directory };
}
try {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'config.json'), '{}');
  process.env.SURFCORE_BILI_CONFIG = path.join(dshHome, 'surfcore', 'bili.config.json');
  const manager = createManager({ ...options, actor: 'agent:export-test-fixture' });
  const firstChange = manager.apply(manager.preview({ patch: { 'qq.socialV2.proactive.probability': 0.1 }, reason: secret }).id);
  const secondChange = manager.apply(manager.preview({ patch: { 'purpose.gapMinMs': 3600000 }, reason: secret }).id);
  const observation = manager.observe({ changeId: secondChange.changeId, text: secret, decision: 'keep' });
  assert.notEqual(firstChange.changeId, secondChange.changeId);
  const first = exportLifeSettings(options);
  assert.equal(first.current_records, 3);
  assert.equal(first.new_versions, 3);
  const repeated = exportLifeSettings(options);
  assert.equal(repeated.new_versions, 0);
  assert.equal(repeated.snapshot_id, first.snapshot_id);
  assert.equal(first.github_published, false);
  assert.equal(first.dots_read_verified, false);
  let snapshot = snapshotRows();
  assert(snapshot.rows.every((row) => row.occurred_at !== null));
  assert(snapshot.rows.some((row) => row.content.related_change_record_id));
  assert(allFiles(path.join(out, 'public')).every((file) => !fs.readFileSync(file, 'utf8').includes(secret)));
  console.log('PASS real manager two changes + observation, stable IDs, exact source times, repeat zero, privacy');

  const paths = scopePaths(options);
  const state = readState(paths);
  state.observations[0].text += ' revised';
  atomicWrite(paths.state, state);
  assert.equal(exportLifeSettings(options).total_versions, 4);
  state.observations = [];
  atomicWrite(paths.state, state);
  assert.equal(exportLifeSettings(options).total_versions, 5);
  snapshot = snapshotRows();
  assert.equal(snapshot.rows.filter((row) => row.status === 'removed').length, 1);
  assert.equal(snapshot.rows.find((row) => row.status === 'removed').occurred_at, null);
  state.observations = [observation];
  atomicWrite(paths.state, state);
  assert.equal(exportLifeSettings(options).total_versions, 6);
  assert.equal(snapshotRows().rows.filter((row) => row.status === 'restored').length, 1);
  exportLifeSettings({ ...options, includePrivateReasons: true });
  assert(allFiles(path.join(out, '.private', 'full')).some((file) => fs.readFileSync(file, 'utf8').includes(secret)));
  assert(allFiles(path.join(out, 'public')).every((file) => !fs.readFileSync(file, 'utf8').includes(secret)));
  console.log('PASS modified observation versions, source-removed marker, restore, opt-in stays private');

  const pointerBefore = fs.readFileSync(latestPath, 'utf8');
  fs.renameSync(paths.state, paths.state + '.temporarily-absent');
  assert.equal(exportLifeSettings(options).source_status, 'missing');
  assert.equal(fs.readFileSync(latestPath, 'utf8'), pointerBefore);
  fs.renameSync(paths.state + '.temporarily-absent', paths.state);
  const originalSource = fs.readFileSync(paths.state, 'utf8');
  fs.writeFileSync(paths.state, '{bad');
  assert.throws(() => exportLifeSettings(options), /CORRUPT_FILE/);
  assert.equal(fs.readFileSync(latestPath, 'utf8'), pointerBefore);
  fs.writeFileSync(paths.state, originalSource);
  snapshot = snapshotRows();
  const partPath = path.join(snapshot.directory, 'records', snapshot.manifest.files.records[0].file);
  const originalPart = fs.readFileSync(partPath);
  fs.appendFileSync(partPath, 'tampering');
  assert.throws(() => exportLifeSettings(options), /SNAPSHOT_HASH_MISMATCH/);
  assert.equal(fs.readFileSync(latestPath, 'utf8'), pointerBefore);
  fs.writeFileSync(partPath, originalPart);
  console.log('PASS missing/corrupt source retains checkpoint, output hash mismatch rejected');

  const chunkOptions = { root: path.join(fixture, 'chunk-repo'), dshHome: path.join(fixture, 'chunk-dsh'), out: path.join(fixture, 'chunk-export') };
  const chunkPaths = scopePaths(chunkOptions);
  const many = emptyState(chunkPaths);
  for (let revision = 1; revision <= 2100; revision++) many.history.push({
    id: 'change-' + randomUUID(), revision, createdAt: revision === 1 ? null : '2026-10-27T00:00:00.000Z',
    changes: [{ id: 'purpose.enabled', before: true, after: false }], reason: secret,
  });
  many.revision = 2100;
  atomicWrite(chunkPaths.state, many);
  assert.equal(exportLifeSettings(chunkOptions).current_records, 2100);
  const chunkSnapshot = snapshotRows(chunkOptions.out);
  assert(chunkSnapshot.manifest.files.records.length > 1);
  assert.equal(chunkSnapshot.rows.length, 2100);
  assert.equal(chunkSnapshot.rows.filter((row) => row.occurred_at === null).length, 1);
  assert.equal(exportLifeSettings(chunkOptions).new_versions, 0);
  console.log('PASS 2100 synthetic records: complete chunk boundaries, hashes, unknown time and idempotence');

  const chunkPointerPath = path.join(chunkOptions.out, 'public', 'LATEST.json');
  const priorPointer = fs.readFileSync(chunkPointerPath, 'utf8');
  many.history.push({ id: 'change-' + randomUUID(), revision: 2101, createdAt: '2026-10-27T01:00:00.000Z', changes: [] });
  many.revision = 2101;
  atomicWrite(chunkPaths.state, many);
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (String(from).includes('staging-')) throw new Error('SIMULATED_SNAPSHOT_INTERRUPTION');
    return rename(from, to);
  };
  try { assert.throws(() => exportLifeSettings(chunkOptions), /SIMULATED_SNAPSHOT_INTERRUPTION/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(chunkPointerPath, 'utf8'), priorPointer);
  assert.equal(exportLifeSettings(chunkOptions).new_versions, 1);
  console.log('PASS snapshot interruption preserves pointer; rerun recovers exactly one version');
  console.log('life export tests OK (local fixtures only; no GitHub publication or dots read)');
} finally {
  if (priorBiliConfig === undefined) delete process.env.SURFCORE_BILI_CONFIG;
  else process.env.SURFCORE_BILI_CONFIG = priorBiliConfig;
  // This exact mkdtemp directory is the only recursive cleanup target.
  assert.equal(path.dirname(path.resolve(fixture)), path.resolve(os.tmpdir()));
  assert(path.basename(fixture).startsWith('surfcore-life-export-test-'));
  fs.rmSync(fixture, { recursive: true, force: true });
}
