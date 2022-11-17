// @ts-nocheck
import Ain from '../src/ain';
import { HomomorphicEncryptionParams } from '../src/types';
const { test_node_1 } = require('./test_data');

jest.setTimeout(180000);

describe('Homomorphic Encryption', function() {
  let ain = new Ain(test_node_1);
  const customParams = {
    polyModulusDegree: 4096,
    coeffModulusArray: Int32Array.from([46, 16, 46]),
    scaleBit: 20
  } as HomomorphicEncryptionParams;

  it('initialize with custom params', async function() {
    await ain.he.init(null, customParams);
    expect(ain.he.initialized).toBe(true);
    expect(ain.he.seal).not.toBeNull();
    expect(ain.he.seal.polyModulusDegree).toBe(4096);
    expect(ain.he.seal.coeffModulusArray).toEqual(Int32Array.from([46, 16, 46]));
    expect(ain.he.seal.scale).toBe(Math.pow(2, 20));
  });

  it('initialize with default params and generate keys', async function() {
    await ain.he.init();
    expect(ain.he.initialized).toBe(true);
    expect(ain.he.seal).not.toBeNull();
    expect(ain.he.seal.polyModulusDegree).toBe(8192);
    expect(ain.he.seal.coeffModulusArray).toEqual(Int32Array.from([60, 40, 40, 60]));
    expect(ain.he.seal.scale).toBe(Math.pow(2, 40));
  });

  it('initialize with custom params and existing keys', async function() {
    const keys = require('./test_he_keys_custom_params.json');
    await ain.he.init(keys, customParams);
    expect(ain.he.initialized).toBe(true);
    expect(ain.he.seal).not.toBeNull();
    expect(ain.he.TEST_getKeys()).toEqual(keys);
    expect(ain.he.seal.polyModulusDegree).toBe(4096);
    expect(ain.he.seal.coeffModulusArray).toEqual(Int32Array.from([46, 16, 46]));
    expect(ain.he.seal.scale).toBe(Math.pow(2, 20));
  });

  it('initialize with existing keys', async function() {
    const keys = require('./test_he_keys_default_params.json');
    await ain.he.init(keys);
    expect(ain.he.initialized).toBe(true);
    expect(ain.he.seal).not.toBeNull();
    expect(ain.he.TEST_getKeys()).toEqual(keys);
    expect(ain.he.seal.polyModulusDegree).toBe(8192);
    expect(ain.he.seal.coeffModulusArray).toEqual(Int32Array.from([60, 40, 40, 60]));
    expect(ain.he.seal.scale).toBe(Math.pow(2, 40));
  });

  it('encrypt', function() {
    const TEST_DATA = Float64Array.from({ length: ain.he.seal.encoder.slotCount }).map((x, i) => i);
    const cipherText = ain.he.encrypt(TEST_DATA);
    expect(cipherText).toBeDefined();
    expect(cipherText.instance.constructor.name).toBe('Ciphertext');
  });

  it('decrypt', function() {
    const TEST_DATA = Float64Array.from({ length: ain.he.seal.encoder.slotCount }).map((x, i) => i);
    const cipherText = ain.he.encrypt(TEST_DATA);
    const decrypted = ain.he.decrypt(cipherText.save()); // base64 string representation of the cipher
    expect(decrypted.map((x: number) => 0 + Math.round(x))).toStrictEqual(TEST_DATA);
  });

  it('evaluate', function() {
    const TEST_DATA = Float64Array.from({ length: ain.he.seal.encoder.slotCount }).map((x, i) => i);
    const cipherText = ain.he.encrypt(TEST_DATA);
    ain.he.TEST_evaluate_double(cipherText);
    const decrypted = ain.he.decrypt(cipherText.save()); // base64 string representation of the cipher
    expect(decrypted.map((x: number) => 0 + Math.round(x))).toStrictEqual(TEST_DATA.map(x => x * 2));
  });
});
