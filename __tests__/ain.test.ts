import Ain from '../src/ain';
import Reference from '../src/ain-db/ref';
import { TransactionBody, SetOperation, Transaction, TransactionInput, SetOperationType } from '../src/types';
import { createSecretKey } from 'crypto';
import { anyTypeAnnotation } from '@babel/types';
import axios from 'axios';
const TEST_STRING = 'test_string';
const TX_PATTERN = /^0x([A-Fa-f0-9]{64})$/;
const {
  test_keystore,
  test_pw,
  test_seed,
  test_sk,
  test_node_1,
  test_node_2
} = require('./test_data');

jest.setTimeout(180000);

// TODO (lia): Create more test cases
describe('ain-js', function() {
  let ain = new Ain(test_node_1);
  let keystoreAddress = '';

  describe('Network', function() {
    it('chainId', function() {
      expect(ain.chainId).toBe(0);
      expect(ain.wallet.chainId).toBe(0);
      ain.setProvider(test_node_1, 2);
      expect(ain.chainId).toBe(2);
      expect(ain.wallet.chainId).toBe(2);
    });

    it('sanitize provider urls', function() {
      expect(() => ain.setProvider('')).toThrow('Invalid endpoint received.');
      expect(() => ain.setProvider('localhost:3000')).toThrow('Invalid endpoint received.');
      const noTrailingSlash = 'http://localhost:3000';
      ain.setProvider(noTrailingSlash + '/');
      expect(ain.provider.endpoint).toBe(noTrailingSlash);
      expect(ain.provider.apiEndpoint).toBe(noTrailingSlash + '/json-rpc');
    });

    it('should set provider', async function() {
      ain.setProvider(test_node_2);
      expect(await ain.net.getNetworkId()).toBe(0);
      expect(await ain.net.isListening()).toMatchSnapshot();
      expect(await ain.net.getPeerCount()).toBeGreaterThan(0);
      expect(await ain.net.isSyncing()).toBe(false);
    });

    it('getProtocolVersion', function(done) {
      ain.net.getProtocolVersion()
      .then(res => {
        expect(res).not.toBeNull();
        done();
      })
      .catch(e => {
        console.log("ERROR:", e);
        done();
      })
    });

    it('checkProtocolVersion', function(done) {
      ain.net.checkProtocolVersion()
      .then(res => {
        expect(res.code).toBe(0);
        expect(res.result).toBe('Success');
        done();
      })
      .catch(e => {
        console.log("ERROR:", e)
        done();
      })
    })
  });

  describe('Wallet', function() {
    let addresses = []
    it('create', function() {
      const beforeLength = ain.wallet.length;
      ain.wallet.create(2);
      const afterLength = ain.wallet.length;
      expect(afterLength).toBe(beforeLength + 2);
    });

    it('V3Keystore (encrypt and decrypt)', function() {
      const v3Keystore = test_keystore;
      const beforeLength = ain.wallet.length;
      keystoreAddress = ain.wallet.addFromV3Keystore(v3Keystore, test_pw);
      const afterLength = ain.wallet.length;
      expect(afterLength).toBe(beforeLength + 1);
      const convertedV3Keystore = ain.wallet.accountToV3Keystore(keystoreAddress, test_pw);
      const derivedAddress = Ain.utils.privateToAddress(
        Ain.utils.v3KeystoreToPrivate(convertedV3Keystore, test_pw));
      expect(derivedAddress).toBe(keystoreAddress);
    });

    it('add', function() {
      let beforeLength = ain.wallet.length;
      ain.wallet.add(test_sk);
      let afterLength = ain.wallet.length;
      expect(afterLength).toBe(beforeLength + 1);

      beforeLength = ain.wallet.length;
      try {
        ain.wallet.add('');
      } catch(e) {
        expect(e.message).toBe('private key length is invalid');
      }
      afterLength = ain.wallet.length;
      expect(afterLength).toBe(beforeLength);
    });

    it('addAndSetDefaultAccount', function () {
      ain.wallet.addAndSetDefaultAccount(test_sk);
      expect(ain.wallet.defaultAccount!.private_key).toBe(test_sk);
    });

    it('addFromHDWallet', function() {
      const seedPhrase = test_seed;
      const beforeLength = ain.wallet.length;
      ain.wallet.addFromHDWallet(seedPhrase, 0);
      const afterLength = ain.wallet.length;
      expect(afterLength).toBe(beforeLength + 1);
    });

    it('remove', function() {
      const beforeLength = ain.wallet.length;
      ain.wallet.remove('0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6');
      const afterLength = ain.wallet.length;
      expect(afterLength).toBe(beforeLength - 1);
    });

    it('clear', function() {
      ain.wallet.clear();
      const afterLength = ain.wallet.length;
      expect(afterLength).toBe(0);
    });

    it('setDefaultAccount', function() {
      try {
        ain.wallet.setDefaultAccount('0x09A0d53FDf1c36A131938eb379b98910e55EEfe1');
      } catch(e) {
        expect(e.message).toBe('[ain-js.wallet.setDefaultAccount] Add the account first before setting it to defaultAccount.');
      }
      ain.wallet.add(test_sk);
      ain.wallet.setDefaultAccount(('0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'.toLowerCase()));
      expect(ain.wallet.defaultAccount!.address).toBe('0x09A0d53FDf1c36A131938eb379b98910e55EEfe1');
      ain.wallet.setDefaultAccount('0x09A0d53FDf1c36A131938eb379b98910e55EEfe1');
      expect(ain.wallet.defaultAccount!.address).toBe('0x09A0d53FDf1c36A131938eb379b98910e55EEfe1');
    });

    it('removeDefaultAccount', function() {
      ain.wallet.removeDefaultAccount();
      expect(ain.wallet.defaultAccount).toBeNull();
    });

    it('sign', function() {
      const message = 'hello';
      const hashed = Ain.utils.hashMessage(message);
      try {
        ain.wallet.sign(message)
      } catch(e) {
        expect(e.message).toBe('You need to specify the address or set defaultAccount.');
      }
      ain.wallet.setDefaultAccount('0x09A0d53FDf1c36A131938eb379b98910e55EEfe1');
      const sig = ain.wallet.sign(message);
      const addr:string = String(ain.wallet.defaultAccount!.address);
      expect(Ain.utils.ecVerifySig(message, sig, addr)).toBe(true);
    });

    it('signTransaction', function() {
      const tx: TransactionBody = {
        nonce: 17,
        gas_price: 500,
        timestamp: Date.now(),
        operation: {
          type: "SET_VALUE",
          ref: "afan/test",
          value: 100
        }
      }
      const sig = ain.wallet.signTransaction(tx);
      const addr:string = String(ain.wallet.defaultAccount!.address);
      expect(Ain.utils.ecVerifySig(tx, sig, addr)).toBe(true);
    });

    it('recover', function() {
      const tx: TransactionBody = {
        nonce: 17,
        gas_price: 500,
        timestamp: Date.now(),
        operation: {
          type: "SET_VALUE",
          ref: "afan/test",
          value: 100
        }
      }
      const sig = ain.wallet.signTransaction(tx);
      const addr:string = String(ain.wallet.defaultAccount!.address);
      expect(ain.wallet.recover(sig)).toBe(addr);
    });

    it('getBalance', async function() {
      const balance = await ain.wallet.getBalance();
      expect(balance).toBeGreaterThan(0);
    });

    it('transfer', async function() {
      const balanceBefore = await ain.wallet.getBalance();
      const response = await ain.wallet.transfer({
          to: '0xbA58D93edD8343C001eC5f43E620712Ba8C10813', value: 100, nonce: -1 });
      const balanceAfter = await ain.wallet.getBalance();
      expect(balanceAfter).toBe(balanceBefore - 100);
    });

    it('chainId', function() {
      // chainId = 0
      ain.setProvider(test_node_2, 0);
      let tx: TransactionBody = {
        nonce: 17,
        gas_price: 500,
        timestamp: Date.now(),
        operation: {
          type: "SET_VALUE",
          ref: "afan/test",
          value: 100
        }
      }
      let sig = ain.wallet.signTransaction(tx);
      let addr:string = String(ain.wallet.defaultAccount!.address);
      expect(ain.wallet.verifySignature(tx, sig, addr)).toBe(true);
      expect(() => Ain.utils.ecVerifySig(tx, sig, addr, 2)).toThrow('[ain-util] ecRecoverPub: Invalid signature v value');
      expect(ain.wallet.recover(sig)).toBe(addr);

      // chainId = 2
      ain.setProvider(test_node_2, 2);
      tx = {
        nonce: 17,
        timestamp: Date.now(),
        operation: {
          type: "SET_VALUE",
          ref: "afan/test",
          value: 100
        }
      }
      sig = ain.wallet.signTransaction(tx);
      addr = String(ain.wallet.defaultAccount!.address);
      expect(ain.wallet.verifySignature(tx, sig, addr)).toBe(true);
      expect(() => Ain.utils.ecVerifySig(tx, sig, addr, 0)).toThrow('[ain-util] ecRecoverPub: Invalid signature v value');
      expect(ain.wallet.recover(sig)).toBe(addr);
    });
  });

  describe('Core', function() {
    let addr1: string, addr2: string, defaultAddr: string, targetTxHash: string;
    const targetTx: SetOperation = {
      type: 'SET_OWNER',
      ref: `/apps/test`,
      value: {
        ".owner": {
          "owners": {
            "*": {
              write_owner: true,
              write_rule: true,
              branch_owner: true,
              write_function: true,
            }
          }
        }
      }
    };

    async function waitUntilTxFinalized(txHash: string) {
      const MAX_ITERATION = 20;
      let iterCount = 0;
      while (true) {
        if (iterCount >= MAX_ITERATION) {
          console.log(`Iteration count exceeded its limit before the given tx ${txHash} is finalized!`);
          return false;
        }
        const txStatus = (await axios.get(`${test_node_2}/get_transaction?hash=${txHash}`)).data.result;
        if (txStatus && txStatus.is_finalized === true) {
          return true;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 5000);
        });
        iterCount++;
      }
    }

    beforeAll(async () => {
      ain.setProvider(test_node_2, 0);
      const newAccounts = ain.wallet.create(2);
      defaultAddr = ain.wallet.defaultAccount!.address as string;
      addr1 = newAccounts[0];
      addr2 = newAccounts[1];
      const nodeAddr = (await axios.get(`${test_node_2}/get_address`)).data.result;
      const stakeForApps = (await axios.post(`${test_node_2}/set`, {
        op_list: [
          {
            type: 'SET_VALUE',
            ref: `/staking/test/${nodeAddr}/0/stake/${Date.now()}/value`,
            value: 1
          },
          {
            type: 'SET_VALUE',
            ref: `/staking/bfan/${nodeAddr}/0/stake/${Date.now()}/value`,
            value: 1
          },
        ],
        nonce: -1
      })).data;
      await waitUntilTxFinalized(stakeForApps.result.tx_hash);

      const createApps = (await axios.post(`${test_node_2}/set`, {
        op_list: [
          {
            type: 'SET_VALUE',
            ref: `/manage_app/test/create/${Date.now()}`,
            value: { admin: { [defaultAddr]: true } }
          },
          {
            type: 'SET_VALUE',
            ref: `/manage_app/bfan/create/${Date.now()}`,
            value: { admin: { [defaultAddr]: true } }
          },
        ],
        nonce: -1
      })).data;
      await waitUntilTxFinalized(createApps.result.tx_hash);
    });

    it('getBlock', async function () {
      const block = await ain.getBlock(3)
      const hash = block.hash || "";
      expect(await ain.getBlock(hash)).toStrictEqual(block);
    });

    it('getProposer', async function () {
      const proposer = await ain.getProposer(1);
      const hash = (await ain.getBlock(1)).hash || "";
      expect(await ain.getProposer(hash)).toBe(proposer);
    });

    it('getValidators', async function () {
      const validators = await ain.getValidators(4);
      const hash = (await ain.getBlock(4)).hash || "";
      expect(await ain.getValidators(hash)).toStrictEqual(validators);
    });

    // TODO (lia): add getTransactionResult method and test case for it
    // it('getTransactionResult', async function() {
    //   expect(await ain.getTransactionResult('0xabcdefghijklmnop')).toMatchSnapshot();
    // });

    it('validateAppName', async function () {
      expect(await ain.validateAppName('test')).toStrictEqual({
        "is_valid": false,
        "code": 30603,
        "message": "App name already in use: test",
      });
      expect(await ain.validateAppName('test_new')).toStrictEqual({
        "is_valid": true,
        "code": 0,
      });
    });

    it('sendTransaction', function(done) {
      ain.sendTransaction({ operation: targetTx })
      .then(res => {
        expect(res.result.code).toBe(0);
        expect(res.tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        targetTxHash = res.tx_hash;
        done();
      })
      .catch(e => {
        console.log("ERROR:", e)
        done();
      })
    });

    it('getTransaction', async function () {
      const tx = await ain.getTransaction(targetTxHash);
      expect(tx.transaction.tx_body.operation).toStrictEqual(targetTx);
    });


    it('sendSignedTransaction', function(done) {
      const tx: TransactionBody = {
        nonce: -1,
        gas_price: 500,
        timestamp: Date.now(),
        operation: {
          type: "SET_OWNER",
          ref: "/apps/bfan",
          value: {
            ".owner": {
              "owners": {
                "*": {
                  write_owner: true,
                  write_rule: true,
                  branch_owner: true,
                  write_function: true,
                }
              }
            }
          }
        }
      }
      const sig = ain.wallet.signTransaction(tx);

      ain.sendSignedTransaction(sig, tx)
      .then(res => {
        expect(res.result.code).toBe(0);
        expect(res.tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        done();
      })
      .catch(e => {
        console.log("ERROR:", e)
        done();
      })
    });

    it('sendSignedTransaction: invalid signature', function(done) {
      const tx: TransactionBody = {
        nonce: -1,
        gas_price: 500,
        timestamp: Date.now(),
        operation: {
          type: "SET_OWNER",
          ref: "/apps/bfan",
          value: {
            ".owner": {
              "owners": {
                "*": {
                  write_owner: true,
                  write_rule: true,
                  branch_owner: true,
                  write_function: true,
                }
              }
            }
          }
        }
      }
      const sig = '';  // Invalid signature value

      ain.sendSignedTransaction(sig, tx)
      .then(res => {
        expect(res.code).toBe(30302);
        expect(res.message).toEqual('Missing properties.');
        done();
      })
      .catch(e => {
        console.log("ERROR:", e)
        done();
      })
    });

    it('sendTransactionBatch', function(done) {
      const tx1: TransactionInput = {
        operation: {
          type: 'SET_VALUE',
          ref: "/apps/bfan/users",
          value: { [defaultAddr]: true }
        },
        address: addr1
      };

      const tx2: TransactionInput = {
        operation: {
          type: 'SET',
          op_list: [
            {
              type: 'SET_OWNER',
              ref: `/apps/bfan/users`,
              value: {
                ".owner": {
                  "owners": {
                    "*": {
                      write_owner: false,
                      write_rule: false,
                      branch_owner: true,
                      write_function: true,
                    }
                  }
                }
              }
            },
            {
              type: 'SET_OWNER',
              ref: `/apps/bfan/users/${defaultAddr}`,
              value: {
                ".owner": {
                  "owners": {
                    [defaultAddr]: {
                      write_owner: true,
                      write_rule: true,
                      branch_owner: true,
                      write_function: true,
                    }
                  }
                }
              }
            }
          ]
        },
        address: addr2
      };

      const tx3: TransactionInput = {
        operation: {
          type: 'SET_RULE',
          ref: `/apps/bfan/users/${defaultAddr}`,
          value: { '.rule': { 'write': `auth.addr === "${defaultAddr}"` } }
        }
      };

      const tx4: TransactionInput = {
        operation: {
          type: 'SET_VALUE',
          ref: `/apps/bfan/users/${defaultAddr}`,
          value: false
        }
      };

      const tx5: TransactionInput = {
        operation: {
          type: 'SET_VALUE',
          ref: `/apps/bfan/users/${defaultAddr}`,
          value: true
        },
        address: addr1
      };

      const tx6: TransactionInput = {
        operation: {
          type: 'SET_RULE',
          ref: `/apps/bfan/users/${defaultAddr}`,
          value: { '.rule': { 'write': 'true' } }
        },
        address: addr2
      }

      ain.sendTransactionBatch([ tx1, tx2, tx3, tx4, tx5, tx6 ])
      .then(res => {
        expect(res[0].result.code).toBe(12103);
        expect(res[0].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res[1].result.result_list[0].code).toBe(0);
        expect(res[1].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res[2].result.code).toBe(0);
        expect(res[2].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res[3].result.code).toBe(0);
        expect(res[3].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res[4].result.code).toBe(12103);
        expect(res[4].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res[5].result.code).toBe(12302);
        expect(res[5].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        done();
      })
      .catch(e => {
        console.log("ERROR:", e)
        done();
      })
    });
  });

  describe('Database', function() {
    let defaultAccount, allowed_path;
    const test_path = 'apps/bfan';

    beforeAll(() => {
      defaultAccount = ain.wallet.defaultAccount!.address;
      allowed_path = `${test_path}/users/${defaultAccount}`;
    });

    it('.ref()', function() {
      expect(ain.db.ref().path).toBe('/');
      expect(ain.db.ref(test_path).path).toBe('/' + test_path);
    });

    it('setOwner', function(done) {
      ain.db.ref(allowed_path).setOwner({
        value: {
          ".owner": {
              "owners": {
              "*": {
                write_owner: true,
                write_rule: true,
                write_function: true,
                branch_owner: true
              }
            }
          }
        }
      })
      .then(res => {
        expect(res.result.code).toBe(0);
        done();
      })
      .catch((error) => {
        console.log("setOwner error:", error);
        done();
      });
    });

    it('should fail to setOwner', function(done) {
      ain.db.ref('/consensus').setOwner({
        value: {
          ".owner": {
              "owners": {
              "*": {
                write_owner: true,
                write_rule: true,
                branch_owner: true,
                write_function: true,
              }
            }
          }
        }
      })
      .then(res => {
        expect(res.result.code).toBe(12501);
        done();
      })
      .catch((error) => {
        console.log("setOwner error:", error);
        done();
      });
    });

    it('setRule', function(done) {
      ain.db.ref(allowed_path).setRule({
        value: { '.rule': { 'write': "true" } }
      })
      .then(res => {
        expect(res.result.code).toBe(0);
        done();
      })
      .catch((error) => {
        console.log("setRule error:", error);
        done();
      });
    });

    it('setValue', function(done) {
      ain.db.ref(allowed_path + '/username').setValue({
        value: "test_user"
      })
      .then(res => {
        expect(res.result.code).toBe(0);
        done();
      })
      .catch((error) => {
        console.log("setValue error:", error);
        done();
      });
    });

    it('setFunction', function(done) {
      ain.db.ref(allowed_path).setFunction({
          value: {
            ".function": {
              '0xFUNCTION_HASH': {
                function_url: "https://events.ainetwork.ai/trigger",
                function_id: '0xFUNCTION_HASH',
                function_type: "REST"
              }
            }
          }
        })
        .then(res => {
          expect(res.result.code).toBe(0);
          done();
        })
        .catch((error) => {
          console.log("setFunction error:", error);
          done();
        })
    });

    it('set', function(done) {
      ain.db.ref(allowed_path).set({
        op_list: [
          {
            type: 'SET_RULE',
            ref: 'can/write/',
            value: { '.rule': { 'write': "true" } }
          },
          {
            type: 'SET_RULE',
            ref: 'cannot/write',
            value: { '.rule': { 'write': "false" } }
          },
          {
            type: 'INC_VALUE',
            ref: 'can/write/',
            value: 5
          },
          {
            type: 'DEC_VALUE',
            ref: 'can/write',
            value: 10,
          }
        ],
        nonce: -1
      })
      .then(res => {
        expect(Object.keys(res.result).length).toBe(4);
        done();
      })
      .catch((error) => {
        console.log("set error:",error);
        done();
      });
    });

    it('getValue', async function() {
      expect(await ain.db.ref(allowed_path).getValue()).toMatchSnapshot();
    });

    it('getRule', async function() {
      expect(await ain.db.ref(allowed_path).getRule()).toMatchSnapshot();
    });

    it('getOwner', async function() {
      expect(await ain.db.ref(allowed_path).getOwner()).toMatchSnapshot();
    });

    it('getFunction', async function() {
      expect(await ain.db.ref(allowed_path).getFunction()).toMatchSnapshot();
    });

    it('get', async function() {
      expect(await ain.db.ref(allowed_path).get(
          [
            {
              type: 'GET_RULE',
              ref: ''
            },
            {
              type: 'GET_VALUE',
            },
            {
              type: 'GET_VALUE',
              ref: 'deeper/path/'
            }
          ]
        )).toMatchSnapshot();
    });

    it('get with options', async function() {
      expect(await ain.db.ref().getValue(allowed_path, { is_final: true })).toMatchSnapshot();
      expect(await ain.db.ref().getValue(allowed_path, { is_global: true })).toMatchSnapshot();
      expect(await ain.db.ref().getValue(allowed_path, { is_shallow: true })).toMatchSnapshot();
      expect(await ain.db.ref().getValue(allowed_path, { include_proof: true })).toMatchSnapshot();
      expect(await ain.db.ref().getValue(allowed_path, { include_tree_info: true })).toMatchSnapshot();
      const getWithVersion = await ain.db.ref().getValue(allowed_path, { include_version: true });
      expect(getWithVersion['#version']).not.toBeNull();
    });

    it('deleteValue', function(done) {
      ain.db.ref(`${allowed_path}/can/write`).deleteValue()
      .then(res => {
        expect(res.result.code).toBe(0);
        done();
      })
      .catch((error) => {
        console.log("deleteValue error:",error);
        done();
      });
    });

    it('evalRule: true', function(done) {
      ain.db.ref(allowed_path).evalRule({ ref: '/can/write', value: 'hi' })
      .then(res => {
        expect(res).toStrictEqual({"code": 0, "matched": {"state": {"closestRule": {"config": null, "path": []}, "matchedRulePath": ["apps", "bfan", "users", "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1", "can", "write"], "matchedValuePath": ["apps", "bfan", "users", "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1", "can", "write"], "pathVars": {}}, "write": {"closestRule": {"config": {"write": "true"}, "path": ["apps", "bfan", "users", "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1", "can", "write"]}, "matchedRulePath": ["apps", "bfan", "users", "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1", "can", "write"], "matchedValuePath": ["apps", "bfan", "users", "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1", "can", "write"], "pathVars": {}, "subtreeRules": []}}});
        done();
      })
      .catch(error => {
        console.log("error:", error);
        done();
      })
    });

    it('evalRule: false', function(done) {
      ain.db.ref(allowed_path).evalRule({ ref: '/cannot/write', value: 'hi' })
      .then(res => {
        expect(res.code).toBe(12103);
        done();
      })
      .catch(error => {
        console.log("error:", error);
        done();
      })
    });

    it('evalOwner', function(done) {
      ain.db.ref(allowed_path).evalOwner({ permission: "branch_owner" })
      .then(res => {
        expect(res).toMatchSnapshot();
        done();
      })
      .catch(error => {
        console.log("error:", error);
        done();
      })
    });

    it('matchFunction', function(done) {
      ain.db.ref(allowed_path).matchFunction()
      .then(res => {
        expect(res).toMatchSnapshot();
        done();
      })
      .catch(error => {
        console.log("error:", error);
        done();
      })
    });

    it('matchRule', function(done) {
      ain.db.ref(allowed_path).matchRule()
      .then(res => {
        expect(res).toMatchSnapshot();
        done();
      })
      .catch(error => {
        console.log("error:", error);
        done();
      })
    });

    it('matchOwner', function(done) {
      ain.db.ref(allowed_path).matchOwner()
      .then(res => {
        expect(res).toMatchSnapshot();
        done();
      })
      .catch(error => {
        console.log("error:", error);
        done();
      })
    });

    /*it('on and off', function(done) {
      try {
        ain.db.ref().on('value', (snap:any) => console.log)
      } catch(e) {
        expect(e.message).toEqual('[ain-js.Reference.on] Cannot attach an on() listener to a root node');
      }

      const ref = ain.db.ref(test_path);
      const f1 = (snap: any) => { console.log("f1: "+snap) }
      const f2 = (snap: any) => { console.log("f2: "+snap) }
      const f3 = (snap: any) => { console.log("f3: "+snap) }

      ref.on('value', f1);
      ref.on('value', f2);
      ref.on('child_added', f3);
      expect(ref.numberOfListeners).toBe(3);
      setTimeout(() => {
        ref.off('value', f1);
        expect(ref.numberOfListeners).toBe(2);
      }, 2000);
      setTimeout(() => {
        ref.off('value');
        expect(ref.numberOfListeners).toBe(1);
      }, 4000);
      setTimeout(() => {
        ref.off();
        expect(ref.numberOfListeners).toBe(0);
        done();
      }, 8000);
    });*/
  });

  describe('Utils', function() {
    it('isValidAddress', function() {
      expect(Ain.utils.isValidAddress('')).toBe(false);
      expect(Ain.utils.isValidAddress('0x00000000000000000000')).toBe(false);
      expect(Ain.utils.isValidAddress('0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6')).toBe(true);
    });
  });
});
