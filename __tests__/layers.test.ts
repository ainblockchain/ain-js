import axios from 'axios';
import Ain from '../src/ain';

jest.mock('axios');
const post = jest.fn();
const genesis = '0x' + 'a'.repeat(64);
const info = {
  version: 1, default_layer: 'L2',
  layers: { L1: { chain_id: 101, genesis_hash: genesis }, L2: { chain_id: 103, genesis_hash: genesis } },
  status: { L1: { healthy: true }, L2: { healthy: true } },
};
beforeEach(() => {
  post.mockReset();
  (axios.create as jest.Mock).mockReturnValue({ post, defaults: {} });
  post.mockResolvedValue({ data: { result: { result: info } } });
});

test('default negotiation pins L2; explicit L1 has an independent signing wallet', async () => {
  const [l2, l1] = await Promise.all([Ain.connect('http://gateway'), Ain.connect('http://gateway', { layer: 'L1' })]);
  expect(l2.executionLayer).toBe('L2'); expect(l2.wallet.chainId).toBe(103);
  expect(l1.executionLayer).toBe('L1'); expect(l1.wallet.chainId).toBe(101);
  const privateKey = '1'.padStart(64, '0'); // Public test fixture; never deployed.
  const address = l2.wallet.add(privateKey);
  l1.wallet.add(privateKey);
  const body = { operation: { type: 'SET_VALUE' as const, ref: '/apps/probe/x', value: 1 }, timestamp: 1, nonce: -1 };
  const signature = l2.wallet.signTransaction(body, address);
  expect(l2.wallet.verifySignature(body, signature, address)).toBe(true);
  let acceptedOnL1 = false;
  try { acceptedOnL1 = l1.wallet.verifySignature(body, signature, address); } catch {}
  expect(acceptedOnL1).toBe(false);
  expect(() => l2.setProvider('http://elsewhere')).toThrow(/pinned/);
});

test('provider carries the pinned layer without mutating params or allowing another layer', async () => {
  const ain = await Ain.connect('http://gateway');
  const params = { ref: '/apps/a', type: 'GET_VALUE' };
  post.mockResolvedValue({ data: { result: { result: 1 } } });
  expect(await ain.provider.send('ain_get', params)).toBe(1);
  expect(post.mock.calls.at(-1)[1].params.layer).toBe('L2');
  expect(params).toEqual({ ref: '/apps/a', type: 'GET_VALUE' });
  await expect(ain.provider.send('ain_get', { ...params, layer: 'L1' })).rejects.toThrow(/signing domain/);
});

test('unavailable capabilities, wrong genesis and RPC errors fail before signing', async () => {
  await expect(Ain.connect('http://gateway', { expectedGenesisHash: '0x' + 'b'.repeat(64) })).rejects.toThrow(/genesis/);
  post.mockResolvedValue({ data: { result: { result: { ...info, status: { L2: { healthy: false } } } } } });
  await expect(Ain.connect('http://gateway')).rejects.toThrow(/not ready/);
  post.mockResolvedValue({ data: { error: { code: -32052, message: 'L2 unavailable' } } });
  await expect(Ain.connect('http://gateway')).rejects.toThrow('L2 unavailable');
});

test('legacy P256 signatures without a chain domain are not allowed on a pinned layer', async () => {
  const ain = await Ain.connect('http://gateway');
  const address = ain.wallet.create('p256') as string;
  const body = { operation: { type: 'SET_VALUE' as const, ref: '/apps/probe/x', value: 1 }, timestamp: 1, nonce: -1 };
  expect(() => ain.wallet.signTransaction(body, address)).toThrow(/chain-domain-bound/);
});

test('explicit L1 submissions wrap an L2-signed payload and use the L2 nonce without changing wallet domain', async () => {
  post.mockResolvedValueOnce({ data: { result: { result: { ...info, inbox: { enabled: true } } } } });
  const ain = await Ain.connect('http://gateway', { layer: 'L1' });
  const address = ain.wallet.add('1'.padStart(64, '0'));
  ain.wallet.setDefaultAccount(address);
  post.mockImplementation(async (_url, payload) => ({ data: { result: { result:
    payload.method === 'ain_getNonce' ? 7 : { tx_hash: 'outer-hash', result: { code: 0 } }
  } } }));
  const response = await ain.signer.sendTransaction({ operation: { type: 'SET_VALUE', ref: '/apps/a/x', value: 1 } });
  const nonceRequest = post.mock.calls.find(([, payload]) => payload.method === 'ain_getNonce')[1];
  expect(nonceRequest.params.layer).toBe('L2');
  const sent = post.mock.calls.at(-1)[1];
  expect(sent.params.layer).toBe('L1');
  const outer = sent.params.tx_body, inner = outer.operation.value;
  expect(outer.operation.ref).toMatch(/^\/layer2\/inbox\/0x4c31494e[a-f0-9]{56}$/);
  expect(inner.tx_body.nonce).toBe(7); expect(outer.nonce).toBe(-1);
  expect(inner.tx_body.parent_tx_hash).toBe(response.inbox_marker);
  expect(ain.wallet.verifySignature(outer, sent.params.signature, address, 101)).toBe(true);
  expect(ain.wallet.verifySignature(inner.tx_body, inner.signature, address, 103)).toBe(true);
  expect(ain.wallet.chainId).toBe(101);
});

test('unchanged constructor and database signer negotiate default L2 before signing', async () => {
  const ain = new Ain('http://gateway');
  const address = ain.wallet.add('1'.padStart(64, '0')); ain.wallet.setDefaultAccount(address);
  post.mockImplementation(async (_url, payload) => ({ data: { result: { result:
    payload.method === 'ain_getLayerInfo' ? info : payload.method === 'ain_getNonce' ? 0 : { tx_hash: 'hash', result: { code: 0 } }
  } } }));
  const input = { operation: { type: 'SET_VALUE' as const, ref: '/apps/a/x', value: 1 }, nonce: -1 };
  await Promise.all([ain.signer.sendTransaction(input), ain.signer.sendTransaction(input)]);
  expect(post.mock.calls.filter(([, p]) => p.method === 'ain_getLayerInfo')).toHaveLength(1);
  const sent = post.mock.calls.filter(([, p]) => p.method === 'ain_sendSignedTransaction');
  expect(sent).toHaveLength(2);
  for (const [, p] of sent) {
    expect(p.params.layer).toBe('L2');
    expect(ain.wallet.verifySignature(p.params.tx_body, p.params.signature, address, 103)).toBe(true);
  }
  expect(ain.wallet.chainId).toBe(103);
});

test('automatic discovery never falls back on an outage and retries after recovery', async () => {
  const ain = new Ain('http://gateway');
  post.mockRejectedValueOnce(Error('network unavailable'));
  await expect(ain.ensureDefaultLayer()).rejects.toThrow('network unavailable');
  expect(ain.wallet.chainId).toBe(0); expect(ain.executionLayer).toBeUndefined();
  await ain.ensureDefaultLayer(); expect(ain.executionLayer).toBe('L2');
});

test('explicit chain IDs remain explicit; only method-not-found preserves legacy defaults', async () => {
  const explicit = new Ain('http://gateway', null, 1);
  await explicit.ensureDefaultLayer(); expect(post).not.toHaveBeenCalled(); expect(explicit.wallet.chainId).toBe(1);
  const legacy = new Ain('http://legacy');
  post.mockResolvedValueOnce({data:{error:{code:-32601,message:'Method not found'}}});
  await legacy.ensureDefaultLayer(); await legacy.ensureDefaultLayer();
  expect(post).toHaveBeenCalledTimes(1); expect(legacy.wallet.chainId).toBe(0); expect(legacy.executionLayer).toBeUndefined();
});

test('provider changes before discovery update the default signer endpoint too', async () => {
  const ain = new Ain('http://old'); ain.setProvider('http://new');
  const address = ain.wallet.add('1'.padStart(64, '0')); ain.wallet.setDefaultAccount(address);
  post.mockImplementation(async (_url, payload) => ({data:{result:{result:payload.method === 'ain_getLayerInfo' ? info : {tx_hash:'hash',result:{code:0}}}}}));
  await ain.signer.sendTransaction({operation:{type:'SET_VALUE',ref:'/apps/a/x',value:1},nonce:-1});
  expect(post.mock.calls.every(([url]) => url === 'http://new/json-rpc')).toBe(true);
});
