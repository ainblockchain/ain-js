const assert = require('assert/strict');
const fs = require('fs');
const { execFileSync } = require('child_process');

function validatePlan(plan) {
  assert.equal(plan.nativeReleaseVersion, 2);
  assert.match(plan.project, /^ain-units-[a-z0-9-]{1,40}$/);
  assert.equal(plan.rpcPortBase, 21081);
  assert.equal(plan.peerPort, 21041);
  assert.equal(plan.activationBlock, 2);
  assert.ok(Number.isSafeInteger(plan.uid) && plan.uid > 0);
  assert.ok(Number.isSafeInteger(plan.gid) && plan.gid > 0);
  assert.match(plan.chainImage, /^sha256:[a-f0-9]{64}$/);
  assert.match(plan.genesisHash, /^0x[a-f0-9]{64}$/i);
  assert.match(plan.clientHash, /^[a-f0-9]{64}$/);
  assert.equal(plan.validators.length, 10);
  assert.equal(new Set(plan.validators).size, 10);
  for (const address of plan.validators) assert.match(address, /^0x[a-f0-9]{40}$/i);
  assert.ok(Object.keys(plan.runtimeHashes).length >= 50, 'full native runtime source manifest required');
  for (const [relative, hash] of Object.entries(plan.runtimeHashes)) {
    assert.match(relative, /^(client|common|p2p|node|consensus|db|blockchain|block-pool|tx-pool|json_rpc|event-handler|logger)\/[A-Za-z0-9_./-]+$/);
    assert.ok(!relative.split('/').includes('..'));
    assert.match(hash, /^[a-f0-9]{64}$/);
  }
  for (const name of ['db/escrow-units.js', 'db/functions.js', 'common/constants.js']) assert.ok(plan.runtimeHashes[name]);
  assert.deepEqual(Object.keys(plan.configHashes).sort(), ['blockchain_params.json', 'genesis_accounts.json', 'genesis_block.json.gz', 'timer_flags.json']);
  for (const hash of Object.values(plan.configHashes)) assert.match(hash, /^[a-f0-9]{64}$/);
  return plan;
}

function loadNetwork(filename = process.env.ESCROW_NETWORK_PLAN) {
  if (!filename) return { project: 'ain-cert-docker', rpcPortBase: 18081, peerPort: 19041, nativeReleaseVersion: 1 };
  return validatePlan(JSON.parse(fs.readFileSync(filename, 'utf8')));
}

function assertProtocol(manifest, plan, reports) {
  validatePlan(plan);
  assert.equal(manifest.length, 10);
  assert.equal(reports.length, 10);
  assert.equal(new Set(manifest.map(node => node.id)).size, 10);
  for (let index = 0; index < 10; index++) {
    const node = manifest[index];
    const report = reports[index];
    assert.equal(node.id, report.containerId);
    assert.equal(node.image, plan.chainImage, 'all ten validators need the same audited image');
    assert.equal(node.port, plan.rpcPortBase + index);
    assert.equal(node.running, true);
    assert.equal(node.signatureBypass, 'false');
    assert.equal(node.feeFreeMode, 'true');
    assert.equal(node.readOnlyRoot, true);
    assert.equal(node.user, `${plan.uid}:${plan.gid}`);
    assert.equal(node.configDirectory, '/network');
    assert.equal(node.limits.cpuQuota, 3200000);
    assert.equal(node.limits.cpuPeriod, 100000);
    assert.equal(node.limits.cpuSet, '0-7');
    assert.equal(node.limits.memory, 128 * 1024 ** 3);
    assert.equal(node.limits.memorySwap, node.limits.memory);
    assert.ok(!node.limits.gpu?.length);
    assert.deepEqual(node.command, ['--max-old-space-size=8192', '/experiment/escrow-network-client.js']);
    assert.deepEqual(node.entrypoint, ['node']);
    assert.ok(node.mounts.some(mount => mount.destination === '/network' && !mount.readWrite));
    assert.ok(node.mounts.some(mount => mount.destination === '/experiment' && !mount.readWrite));
    assert.ok(node.mounts.every(mount => ['/network', '/experiment', '/data'].includes(mount.destination)));
    assert.deepEqual(report.runtimeHashes, plan.runtimeHashes, 'runtime source differs from prepared immutable image');
    assert.deepEqual(report.configHashes, plan.configHashes, 'effective config differs from audited genesis');
    assert.equal(report.clientHash, plan.clientHash, 'loaded client entrypoint differs');
    assert.deepEqual(report.activation, { enabled_block: 2, has_bandage: false });
    assert.deepEqual(report.precision, { enabled_block: 2, has_bandage: true });
    assert.deepEqual(report.validators.sort(), [...plan.validators].sort());
    assert.equal(report.epochMs, 1000);
    assert.ok(report.latestConfigMtime <= Date.parse(node.startedAt), 'configuration changed after node startup');
  }
}

function assertFreshAudit(audit, manifest, plan, now = Date.now()) {
  assert.equal(audit.pass, true);
  assert.ok(now >= Date.parse(audit.at) && now - Date.parse(audit.at) < 120000, 'refresh protocol audit before funding or settlement');
  assert.deepEqual(audit.plan, plan);
  assert.deepEqual(audit.manifest, manifest);
  assertProtocol(manifest, plan, audit.reports);
}

async function main() {
  const [output, filename] = process.argv.slice(2);
  assert.ok(output && filename && !fs.existsSync(output), 'new protocol audit output and explicit network plan required');
  const plan = loadNetwork(filename);
  const { inspectRuntime, assertRuntime } = require('./chain-readiness');
  const manifest = inspectRuntime(plan.project);
  assertRuntime(manifest, plan);
  const script = `const fs=require('fs');const crypto=require('crypto');
const plan=JSON.parse(process.argv[1]);const hash=filename=>crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const runtimeHashes=Object.fromEntries(Object.keys(plan.runtimeHashes).map(name=>[name,hash('/app/ain-blockchain/'+name)]));
const configHashes=Object.fromEntries(Object.keys(plan.configHashes).map(name=>[name,hash('/network/'+name)]));
const flags=JSON.parse(fs.readFileSync('/network/timer_flags.json','utf8'));
const parameters=JSON.parse(fs.readFileSync('/network/blockchain_params.json','utf8'));
console.log(JSON.stringify({runtimeHashes,configHashes,clientHash:hash('/experiment/escrow-network-client.js'),activation:flags.native_escrow_micro_units,precision:flags.allow_up_to_6_decimal_transfer_value_only,
validators:Object.keys(parameters.consensus.genesis_validators),epochMs:parameters.genesis.epoch_ms,
latestConfigMtime:Math.max(fs.statSync('/experiment/escrow-network-client.js').mtimeMs,...Object.keys(plan.configHashes).map(name=>fs.statSync('/network/'+name).mtimeMs))}));`;
  const reports = manifest.map(node => ({ containerId: node.id,
    ...JSON.parse(execFileSync('docker', ['exec', node.id, 'node', '-e', script, JSON.stringify(plan)], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 ** 2 })) }));
  assertProtocol(manifest, plan, reports);
  const report = { at: new Date().toISOString(), pass: true, plan, manifest, reports,
    scope: 'read-only native image/config/activation audit; no funding, replacement or restart' };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, pass: true, validators: manifest.length, image: plan.chainImage }));
}

module.exports = { loadNetwork, validatePlan, assertProtocol, assertFreshAudit };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
