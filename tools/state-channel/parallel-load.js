const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { PaymentChannel } = require('../../lib/state-channel');
const { createPaymentPeer, postPayment } = require('../../lib/state-channel/http-peer');
const { createBatchPaymentPeer, PaymentBatchClient } = require('../../lib/state-channel/batch-peer');
const { GroupCommitJournal, replayGroupJournal } = require('../../lib/state-channel/group-journal');

const directory = process.env.EVIDENCE || '/evidence';
const privateRoot = process.env.PRIVATE_KEYS || '/private';
const write = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name)));
const cgroup = () => Object.fromEntries(['cpu.max', 'cpu.weight', 'cpu.stat', 'cpuset.cpus.effective', 'memory.max', 'memory.swap.max'].map(name => [name, fs.readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim()]));
const monotonic = () => Number(process.hrtime.bigint()) / 1e6;

async function peerState(port, channelId) {
  const response = await fetch(`http://127.0.0.1:${port}/state${channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  return response.json();
}

async function worker() {
  const { mode, index, workers, basePort, batch, delay, runId, duration, warmup, transport, transportBatch } = workerData;
  const prepared = read('prepared.json');
  assert.equal(prepared.runId, runId);
  const selected = prepared.openings.map((opening, ordinal) => ({ opening, ordinal })).filter(item => item.ordinal % workers === index);
  if (mode === 'audit') {
    const checked = {};
    for (const role of ['server', 'client']) {
      const channels = new Map(selected.map(item => [item.opening.channelId, new PaymentChannel(item.opening)]));
      const replay = await replayGroupJournal(path.join(directory, `${role}-${index}.jsonl`), entry => {
        assert.ok(channels.has(entry.channelId), 'journal entry assigned to wrong worker');
        channels.get(entry.channelId).commit(entry.receipt);
      });
      assert.equal(replay.incompleteTailBytes, 0);
      checked[role] = { entries: replay.entries, states: [...channels.values()].map(channel => channel.snapshot()) };
    }
    assert.deepEqual(checked.server, checked.client);
    const recorded = read(`client-${index}-result.json`);
    assert.equal(checked.server.entries, recorded.acknowledged);
    selected.forEach((item, position) => {
      const expected = recorded.channels.find(channel => channel.ordinal === item.ordinal);
      assert.deepEqual(checked.server.states[position], expected.state);
      assert.deepEqual(expected.remote, expected.state);
    });
    const result = { index, entries: checked.server.entries, channels: selected.length,
      statesSha256: crypto.createHash('sha256').update(JSON.stringify(checked.server.states)).digest('hex') };
    write(`audit-${index}.json`, result);
    parentPort.postMessage({ audited: result });
    return;
  }
  const models = selected.map(({ opening, ordinal }) => ({ ordinal, opening, channel: new PaymentChannel(opening),
    key: crypto.createPrivateKey(fs.readFileSync(path.join(privateRoot, `${ordinal}.pem`))) }));
  const beforeCpu = process.cpuUsage();
  const journal = await GroupCommitJournal.create(path.join(directory, `${mode}-${index}.jsonl`), { maxBatchRecords: batch, maxDelayMs: delay });
  if (mode === 'server') {
    if (transport === 'batch') {
      const contexts = new Map(models.map(item => [item.opening.channelId, { channel: item.channel, key: item.key }]));
      await new Promise(resolve => createBatchPaymentPeer(contexts, (channelId, receipt) => journal.append({ channelId, receipt }))
          .listen(basePort + 1024 + index, '127.0.0.1', resolve));
    }
    for (const { opening, channel, key, ordinal } of transport === 'single' ? models : []) {
      await new Promise(resolve => createPaymentPeer(channel, key, receipt => journal.append({ channelId: opening.channelId, receipt }))
          .listen(basePort + ordinal, '127.0.0.1', resolve));
    }
    parentPort.postMessage({ ready: true, index });
    parentPort.on('message', async message => {
      if (message === 'checkpoint') {
        await journal.flush();
        write(`server-${index}-checkpoint.json`, { metrics: journal.metrics, channels: models.map(item => ({ ordinal: item.ordinal, state: item.channel.snapshot() })) });
        parentPort.postMessage({ checkpoint: true, index });
      }
    });
    return;
  }
  assert.equal(mode, 'client');
  const current = await Promise.all(models.map(item => transport === 'batch' ? peerState(basePort + 1024 + index, item.opening.channelId) : peerState(basePort + item.ordinal)));
  current.forEach((state, ordinal) => assert.deepEqual(state, models[ordinal].channel.snapshot()));
  const starting = new Promise(resolve => parentPort.once('message', resolve));
  parentPort.postMessage({ ready: true, index });
  const { startAt } = await starting;
  await new Promise(resolve => {
    const wait = () => { const remaining = startAt - monotonic(); if (remaining > 0) setTimeout(wait, remaining); else resolve(); };
    wait();
  });
  const measureAt = startAt + warmup;
  const deadline = measureAt + duration;
  const client = transport === 'batch' ? new PaymentBatchClient(`http://127.0.0.1:${basePort + 1024 + index}`, transportBatch) : null;
  const counts = Array(Math.ceil(duration / 1000)).fill(0);
  const histogram = Array(10001).fill(0);
  let acknowledged = 0;
  let drain = 0;
  let warmed = 0;
  const timingsMs = { propose: 0, networkWait: 0, commit: 0, journalWait: 0 };
  const errors = [];
  const channels = await Promise.all(models.map(async ({ opening, channel, key, ordinal }) => {
    while (monotonic() < deadline) {
      const started = monotonic();
      const proposal = channel.propose(0, '1', key);
      const proposed = monotonic();
      timingsMs.propose += proposed - started;
      try {
        const receipt = client ? await client.submit({ channelId: opening.channelId, proposal }) : await postPayment(`http://127.0.0.1:${basePort + ordinal}`, proposal);
        const received = monotonic();
        timingsMs.networkWait += received - proposed;
        channel.commit(receipt);
        const committed = monotonic();
        timingsMs.commit += committed - received;
        await journal.append({ channelId: opening.channelId, receipt });
        const completed = monotonic();
        timingsMs.journalWait += completed - committed;
        acknowledged++;
        if (completed < measureAt) warmed++;
        else if (completed < deadline) {
          counts[Math.floor((completed - measureAt) / 1000)]++;
          histogram[Math.min(10000, Math.floor(completed - started))]++;
        } else drain++;
      } catch (error) { errors.push({ ordinal, sequence: proposal.state.sequence, error: error.message }); break; }
    }
    const remote = transport === 'batch' ? await peerState(basePort + 1024 + index, opening.channelId) : await peerState(basePort + ordinal);
    const state = channel.snapshot();
    return { ordinal, state, remote, agrees: JSON.stringify(state) === JSON.stringify(remote) };
  }));
  await journal.close();
  const result = { index, acknowledged, warmed, drain, counts, histogram, errors, channels, journal: journal.metrics, timingsMs,
    timingScope: 'summed operation wall times; concurrent waits overlap', cpu: process.cpuUsage(beforeCpu), cpuScope: 'whole process, do not sum workers' };
  write(`client-${index}-result.json`, result);
  parentPort.postMessage({ result });
}

async function main() {
  const mode = process.argv[2];
  const runId = process.env.RUN_ID;
  const count = Number(process.env.CHANNELS || 128);
  const workers = Number(process.env.WORKERS || 4);
  const duration = Number(process.env.DURATION_MS || 60000);
  const warmup = Number(process.env.WARMUP_MS || 0);
  const basePort = Number(process.env.CHANNEL_PORT || 22000);
  const batch = Number(process.env.JOURNAL_BATCH || 64);
  const delay = Number(process.env.JOURNAL_DELAY_MS || 2);
  const transport = process.env.CHANNEL_TRANSPORT || 'single';
  const transportBatch = Number(process.env.TRANSPORT_BATCH || 32);
  assert.ok(['single', 'batch'].includes(transport));
  assert.match(runId, /^[a-z0-9_-]{1,60}$/);
  assert.ok(Number.isInteger(count) && count >= 1 && count <= 1024);
  assert.ok(Number.isInteger(workers) && workers >= 1 && workers <= 16 && workers <= count);
  assert.ok(Number.isInteger(basePort) && basePort >= 1024 && basePort + count <= 65535);
  assert.ok(Number.isInteger(duration) && duration >= 1000 && duration <= 3600000);
  assert.ok(Number.isInteger(warmup) && warmup >= 0 && warmup <= 600000);
  if (mode === 'init') {
    const openings = [];
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const keys = [crypto.generateKeyPairSync('ed25519'), crypto.generateKeyPairSync('ed25519')];
      for (const [participant, role] of ['client', 'server'].entries()) {
        const target = path.join(privateRoot, role);
        fs.mkdirSync(target, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(target, `${ordinal}.pem`), keys[participant].privateKey.export({ format: 'pem', type: 'pkcs8' }), { flag: 'wx', mode: 0o600 });
      }
      openings.push({ channelId: `${runId}-${ordinal}`, chainId: `capacity-${runId}`, openingReference: crypto.createHash('sha256').update(runId).digest('hex'),
        balances: ['10000000', '10000000'], publicKeys: keys.map(key => key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')) });
    }
    write('prepared.json', { runId, openings, funding: 'unfunded capacity diagnostic; no onchain KPI pass' });
    return;
  }
  const prepared = read('prepared.json');
  assert.equal(prepared.openings.length, count);
  assert.equal(prepared.runId, runId);
  if (mode === 'audit') {
    const results = await Promise.all(Array.from({ length: workers }, (_, index) => new Promise((resolve, reject) => {
      const child = new Worker(__filename, { workerData: { mode, index, workers, runId } });
      child.on('error', reject);
      child.on('message', message => { if (message.audited) resolve(message.audited); });
      child.on('exit', code => { if (code) reject(new Error(`audit worker exited ${code}`)); });
    })));
    const entries = results.reduce((total, result) => total + result.entries, 0);
    write('journal-audit.json', { pass: true, entries, channels: count, workers: results,
      scope: 'both durable journals independently replayed in disjoint workers with two signatures and sequence/balance validation; not funding or settlement' });
    console.log(JSON.stringify({ audit: true, entries, channels: count }));
    return;
  }
  assert.ok(['server', 'client'].includes(mode));
  write(`${mode}-environment.json`, { at: new Date().toISOString(), node: process.version, runId, count, workers, duration, warmup, batch, delay, transport, transportBatch, cgroup: cgroup() });
  const results = [];
  let ready = 0;
  const pool = Array.from({ length: workers }, (_, index) => new Worker(__filename,
    { workerData: { mode, index, workers, basePort, batch, delay, runId, duration, warmup, transport, transportBatch } }));
  for (const child of pool) {
    child.on('error', error => { console.error(error); process.exit(1); });
    child.on('message', message => {
      if (message.ready && ++ready === workers) {
        write(`${mode}-ready.json`, { ready: true }); console.log(`${mode} ready`);
        if (mode === 'client') {
          const startAt = monotonic() + 500;
          for (const worker of pool) worker.postMessage({ startAt });
        }
      }
      if (message.result) {
        results.push(message.result);
        if (results.length === workers) {
          const counts = Array(Math.ceil(duration / 1000)).fill(0);
          const histogram = Array(10001).fill(0);
          for (const result of results) {
            result.counts.forEach((value, index) => { counts[index] += value; });
            result.histogram.forEach((value, index) => { histogram[index] += value; });
          }
          const acknowledged = results.reduce((total, result) => total + result.acknowledged, 0);
          const measured = counts.reduce((total, value) => total + value, 0);
          const warmed = results.reduce((total, result) => total + result.warmed, 0);
          const drain = results.reduce((total, result) => total + result.drain, 0);
          assert.equal(acknowledged, warmed + measured + drain);
          assert.equal(histogram.reduce((total, value) => total + value, 0), measured);
          const percentile = fraction => { if (!measured) return null; let seen = 0; for (let index = 0; index < histogram.length; index++) { seen += histogram[index]; if (seen >= measured * fraction) return index; } return null; };
          const summary = { runId, count, workers, duration, warmup, warmed, acknowledged, measured, averageTPS: measured * 1000 / duration,
            peakTPS: Math.max(...counts), counts, p50ms: percentile(0.5), p99ms: percentile(0.99),
            drain, latencyScope: 'acknowledgements completed inside the predeclared measurement window; warmup and drain excluded',
            errors: results.flatMap(result => result.errors), statesAgree: results.every(result => result.channels.every(channel => channel.agrees)),
            journal: results.map(result => result.journal), cgroupAfter: cgroup(),
            scope: 'parallel signed channel updates with both peers fsynced before counting; unfunded diagnostic, not complete 7000 TPS KPI' };
          write('summary.json', summary);
          console.log(JSON.stringify({ runId, averageTPS: summary.averageTPS, peakTPS: summary.peakTPS, p99ms: summary.p99ms, errors: summary.errors.length }));
          if (summary.errors.length || !summary.statesAgree) process.exitCode = 1;
        }
      }
    });
  }
}

if (isMainThread) main().catch(error => { console.error(error); process.exitCode = 1; });
else worker().catch(error => { throw error; });
