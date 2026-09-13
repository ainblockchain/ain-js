const { test } = require('node:test');
const assert = require('assert/strict');
const { loadNetwork, validatePlan, assertProtocol, assertFreshAudit } = require('./escrow-network');
const hash = '1'.repeat(64);

function fixture() {
  const runtimeHashes = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`db/source-${index}.js`, hash]));
  for (const name of ['db/escrow-units.js', 'db/functions.js', 'common/constants.js']) runtimeHashes[name] = hash;
  const plan = { nativeReleaseVersion: 2, project: 'ain-units-test', rpcPortBase: 21081, peerPort: 21041,
    activationBlock: 2, chainImage: `sha256:${hash}`, genesisHash: `0x${hash}`, clientHash: hash, uid: 1000, gid: 1000,
    validators: Array.from({ length: 10 }, (_, index) => `0x${String(index).padStart(40, '0')}`), runtimeHashes,
    configHashes: Object.fromEntries(['blockchain_params.json', 'genesis_accounts.json', 'genesis_block.json.gz', 'timer_flags.json'].map(name => [name, hash])) };
  const manifest = plan.validators.map((address, index) => ({ id: `node-${index}`, image: plan.chainImage,
    port: plan.rpcPortBase + index, running: true, signatureBypass: 'false', feeFreeMode: 'true', readOnlyRoot: true,
    configDirectory: '/network', user: '1000:1000', limits: { cpuQuota: 3200000, cpuPeriod: 100000, cpuSet: '0-7', memory: 128 * 1024 ** 3, memorySwap: 128 * 1024 ** 3 },
    startedAt: '2026-09-11T12:00:00.000Z', command: ['--max-old-space-size=8192', '/experiment/escrow-network-client.js'], entrypoint: ['node'],
    mounts: [{ destination: '/network', readWrite: false }, { destination: '/experiment', readWrite: false }, { destination: '/data', readWrite: true }] }));
  const reports = manifest.map(node => ({ containerId: node.id, runtimeHashes: structuredClone(runtimeHashes),
    configHashes: structuredClone(plan.configHashes), clientHash: hash,
    activation: { enabled_block: 2, has_bandage: false }, precision: { enabled_block: 2, has_bandage: true },
    validators: [...plan.validators], epochMs: 1000, latestConfigMtime: Date.parse('2026-09-11T11:00:00.000Z') }));
  return { plan, manifest, reports };
}

test('default still selects legacy chain; explicit validated plan is needed for v2', () => {
  assert.equal(loadNetwork('').nativeReleaseVersion, 1);
  assert.equal(loadNetwork('').rpcPortBase, 18081);
  const { plan } = fixture();
  assert.equal(validatePlan(plan), plan);
  for (const change of [{ nativeReleaseVersion: 1 }, { activationBlock: null }, { project: 'ain-cert-docker' }, { rpcPortBase: 0 }, { chainImage: 'mutable-tag' }, { clientHash: undefined }, { runtimeHashes: {} }]) {
    assert.throws(() => validatePlan({ ...plan, ...change }));
  }
});

test('mixed images, disabled flags and changed native sources fail before funding', () => {
  const valid = fixture();
  assert.doesNotThrow(() => assertProtocol(valid.manifest, valid.plan, valid.reports));
  for (const mutate of [
    state => { state.manifest[9].image = `sha256:${'2'.repeat(64)}`; },
    state => { state.reports[9].activation.enabled_block = null; },
    state => { state.reports[9].runtimeHashes['db/functions.js'] = '2'.repeat(64); },
    state => { state.reports[9].precision.enabled_block = 999; },
    state => { state.reports[9].clientHash = '2'.repeat(64); },
    state => { state.reports[9].configHashes['timer_flags.json'] = '2'.repeat(64); },
  ]) {
    const state = fixture(); mutate(state);
    assert.throws(() => assertProtocol(state.manifest, state.plan, state.reports));
  }
});

test('bypass, writable executable/config mounts, resource or identity drift fail closed', () => {
  for (const mutate of [
    state => { state.manifest[0].signatureBypass = 'true'; },
    state => { state.manifest[0].readOnlyRoot = false; },
    state => { state.manifest[0].mounts[0].readWrite = true; },
    state => { state.manifest[0].mounts.push({ destination: '/app/ain-blockchain/db', readWrite: false }); },
    state => { state.manifest[0].limits.memorySwap *= 2; },
    state => { state.manifest[0].limits.gpu = [{ Count: 1 }]; },
    state => { state.reports[0].latestConfigMtime = Date.parse('2026-09-11T13:00:00.000Z'); },
    state => { state.reports[0].validators[0] = state.reports[0].validators[1]; },
    state => { state.manifest[0].id = state.manifest[1].id; },
  ]) {
    const state = fixture(); mutate(state);
    assert.throws(() => assertProtocol(state.manifest, state.plan, state.reports));
  }
});

test('a stale audit or replaced container cannot authorize funding', () => {
  const state = fixture();
  const audit = { ...structuredClone(state), pass: true, at: '2026-09-11T12:01:00.000Z' };
  const now = Date.parse('2026-09-11T12:01:30.000Z');
  assert.doesNotThrow(() => assertFreshAudit(audit, state.manifest, state.plan, now));
  assert.throws(() => assertFreshAudit(audit, state.manifest, state.plan, now + 120000));
  assert.throws(() => assertFreshAudit(audit, state.manifest, state.plan, now - 60000));
  state.manifest[0].id = 'replaced';
  assert.throws(() => assertFreshAudit(audit, state.manifest, state.plan, now));
});
