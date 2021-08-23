import Ain from '../src/ain';
const { test_node_1 } = require('./test_data');

jest.setTimeout(60000);

describe('Homomorphic Encryption', function() {
  let ain = new Ain(test_node_1);

  it('initialize and generate keys', async function() {
    expect(ain.he.initialized).toBe(false);
    expect(ain.he.seal).toBe(null);
    await ain.he.init();
    expect(ain.he.initialized).toBe(true);
    expect(ain.he.seal).not.toBeNull();
  });

  it('initialize with existing keys', async function() {
    const keys = require('./test_he_keys.json');
    await ain.he.init(keys);
    expect(ain.he.initialized).toBe(true);
    expect(ain.he.seal).not.toBeNull();
    expect(ain.he.TEST_getKeys()).toEqual(keys);
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
