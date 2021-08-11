import Ain from '../src/ain';
import { anyTypeAnnotation } from '@babel/types';
import { PlainText } from 'node-seal/implementation/plain-text';
const {
  test_node_1,
} = require('./test_data');

jest.setTimeout(60000);

describe('Homomorphic Encryption', function() {
  let ain = new Ain(test_node_1);
  const TEST_DATA = Int32Array.from([1, 2, 3, 4, 5]);

  it('initialize', async function() {
    expect(ain.he.initialized).toBe(false);
    expect(ain.he.seal).toBe(null);
    await ain.he.init();
    expect(ain.he.initialized).toBe(true);
    expect(ain.he.seal).not.toBeNull();
  });

  it('generate keys', function() {
    expect(ain.he.keyGenerator).toBe(undefined);
    expect(ain.he.encoder).toBe(undefined);
    expect(ain.he.encryptor).toBe(undefined);
    expect(ain.he.decryptor).toBe(undefined);
    expect(ain.he.evaluator).toBe(undefined);
    ain.he.generateKeys();
    expect(ain.he.keyGenerator).not.toBeUndefined();
    expect(ain.he.encoder).not.toBeUndefined();
    expect(ain.he.encryptor).not.toBeUndefined();
    expect(ain.he.decryptor).not.toBeUndefined();
    expect(ain.he.evaluator).not.toBeUndefined();
  });

  it('encode', function() {
    const plainText = ain.he.encode(TEST_DATA);
    expect(plainText).not.toBeUndefined();
  });

  it('decode', function() {
    const plainText = ain.he.encode(TEST_DATA);
    if (!plainText) {
      throw Error('Encoding failure');
    }
    const decodedArray = ain.he.decode(plainText);
    expect(decodedArray).toBeInstanceOf(Int32Array || Uint32Array);
  });

  it('encrypt', function() {
    const plainText = ain.he.encode(TEST_DATA);
    if (!plainText) {
      throw Error('Encoding failure');
    }
    const cipherText = ain.he.encrypt(plainText);
    expect(plainText).not.toBeUndefined();
  });

  it('decrypt', function() {
    const plainText = ain.he.encode(TEST_DATA);
    if (!plainText) {
      throw Error('Encoding failure');
    }
    const cipherText = ain.he.encrypt(plainText);
    if (!cipherText) {
      throw Error('Encryption failure');
    }
    const decryptedPlainText = ain.he.decrypt(cipherText)  as PlainText;
    expect(decryptedPlainText.toPolynomial()).toEqual(plainText.toPolynomial());
  });

  it('evaluate', function() {
    const plainText = ain.he.encode(TEST_DATA);
    if (!plainText) {
      throw Error('Encoding failure');
    }
    const cipherText = ain.he.encrypt(plainText);
    if (!cipherText) {
      throw Error('Encryption failure');
    }
    ain.he.TEMP_evaluate(cipherText);
    const decryptedPlainText = ain.he.decrypt(cipherText);
    if (!decryptedPlainText) {
      throw Error('Decryption failure');
    }
    const decodedArray = ain.he.decode(decryptedPlainText);
    expect(decodedArray.slice(0, TEST_DATA.length)).toStrictEqual(TEST_DATA.map((i) => i * 2));
  });
});
