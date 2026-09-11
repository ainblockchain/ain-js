const assert = require('assert/strict');
const fs = require('fs');
const { execFileSync } = require('child_process');

function inspectRuntime(project = 'ain-cert-docker') {
  const ids = execFileSync('docker', ['ps', '-q', '--filter', `label=com.docker.compose.project=${project}`], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
  assert.ok(ids.length, 'development chain containers are absent');
  const inspected = JSON.parse(execFileSync('docker', ['inspect', ...ids], { encoding: 'utf8', maxBuffer: 10 * 1024 ** 2 }));
  return inspected.filter(container => /^node\d+$/.test(container.Config.Labels['com.docker.compose.service'])).map(container => {
    const settings = Object.fromEntries(container.Config.Env.map(entry => {
      const separator = entry.indexOf('=');
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }));
    return { name: container.Name, id: container.Id, image: container.Image, pid: container.State.Pid,
      startedAt: container.State.StartedAt, running: container.State.Running, dockerHealth: container.State.Health?.Status,
      port: Number(settings.PORT), signatureBypass: settings.ENABLE_TX_SIG_VERIF_WORKAROUND,
      feeFreeMode: settings.ENABLE_GAS_FEE_WORKAROUND,
      limits: { cpuQuota: container.HostConfig.CpuQuota, cpuPeriod: container.HostConfig.CpuPeriod,
        cpuSet: container.HostConfig.CpusetCpus, memory: container.HostConfig.Memory,
        memorySwap: container.HostConfig.MemorySwap, gpu: container.HostConfig.DeviceRequests } };
  }).sort((left, right) => left.port - right.port);
}

function assertRuntime(manifest) {
  assert.equal(manifest.length, 10, 'exactly ten chain containers required');
  assert.equal(new Set(manifest.map(node => node.id)).size, 10, 'distinct containers required');
  for (let index = 0; index < manifest.length; index++) {
    const node = manifest[index];
    assert.equal(node.port, 18081 + index, 'unexpected development-chain endpoint');
    assert.equal(node.running, true, 'chain container is not running');
    assert.equal(node.signatureBypass, 'false', 'signature verification bypass enabled or unproven; refuse native escrow');
    assert.equal(node.feeFreeMode, 'true', 'this development-only runner requires explicitly enabled zero gas prices');
  }
}

function assess(manifest, before, after) {
  const complete = before.length === 10 && after.length === 10;
  let signatureEnforced = false;
  try { assertRuntime(manifest); signatureEnforced = true; } catch {}
  const checks = {
    runtimePreconditions: signatureEnforced,
    tenDistinctValidators: complete && new Set(after.map(node => node.status?.address).filter(Boolean)).size === 10,
    consensusHealthy: complete && after.every(node => node.status?.state === 'SERVING' && node.status?.health === true),
    everyChainAdvancing: complete && after.every((node, index) => node.url === before[index].url
      && Number.isSafeInteger(node.block?.number) && Number.isSafeInteger(before[index].block?.number)
      && node.block.number > before[index].block.number),
  };
  return { checks, pass: Object.values(checks).every(Boolean) };
}

async function snapshot() {
  const result = [];
  for (let index = 0; index < 10; index++) {
    const url = `http://127.0.0.1:${18081 + index}`;
    const entry = { url, at: new Date().toISOString() };
    for (const [name, path] of [['status', '/node_status'], ['block', '/last_block']]) {
      try {
        const response = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(15000) });
        assert.equal(response.status, 200);
        const value = await response.json();
        assert.equal(value.code, 0);
        entry[name] = name === 'block' ? { number: value.result.number, hash: value.result.hash, timestamp: value.result.timestamp } : value.result;
      } catch (error) { entry[`${name}Error`] = error.message; }
    }
    result.push(entry);
  }
  return result;
}

async function main() {
  const [mode, output] = process.argv.slice(2);
  assert.ok(output && !fs.existsSync(output), 'pass a new evidence filename');
  const manifest = inspectRuntime();
  if (mode === 'inspect') {
    fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return;
  }
  assert.equal(mode, 'observe');
  const startedAt = new Date().toISOString();
  const before = await snapshot();
  await new Promise(resolve => setTimeout(resolve, 10000));
  const after = await snapshot();
  const report = { startedAt, finishedAt: new Date().toISOString(), scope: 'read-only preflight; no transactions or restarts', manifest, before, after, ...assess(manifest, before, after) };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, checks: report.checks, pass: report.pass }));
  process.exitCode = report.pass ? 0 : 1;
}

module.exports = { inspectRuntime, assertRuntime, assess };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
