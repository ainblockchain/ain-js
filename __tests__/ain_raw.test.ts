// @ts-nocheck
import Ain from '../src/ain';
import { TransactionBody, SetOperation, TransactionInput } from '../src/types';
import axios from 'axios';
import { fail, eraseProtoVer } from './test_util';
const {
  test_node_1,
  test_node_2
} = require('./test_data');

const TX_PATTERN = /^0x([A-Fa-f0-9]{64})$/;
const TEST_SK = '9fad756c0bd0d3a42643973f36e61d4d76e01cbb41371fa3046bcced6926e1b2"';
const TEST_ADDR = '0x08Aed7AF9354435c38d52143EE50ac839D20696b';

jest.setTimeout(180000);

describe('ain-js', function() {
  const ain = new Ain(test_node_1, null, 0, { rawResultMode: true });

  beforeAll(() => {
    ain.wallet.add(TEST_SK);
    ain.wallet.setDefaultAccount(TEST_ADDR);
  });

  describe('Core', function() {
    let addr1: string, addr2: string, defaultAddr: string, targetTxHash: string;
    const targetTx: SetOperation = {
      type: 'SET_OWNER',
      ref: `/apps/test_raw`,
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
      ain.setProvider(test_node_2, null, 0);
      const newAccounts = ain.wallet.create(2);
      defaultAddr = ain.wallet.defaultAccount!.address as string;
      addr1 = newAccounts[0];
      addr2 = newAccounts[1];
      const nodeAddr = (await axios.get(`${test_node_2}/get_address`)).data.result;
      const stakeForApps = (await axios.post(`${test_node_2}/set`, {
        op_list: [
          {
            type: 'SET_VALUE',
            ref: `/staking/test_raw/${nodeAddr}/0/stake/${Date.now()}/value`,
            value: 1
          },
          {
            type: 'SET_VALUE',
            ref: `/staking/bfan_raw/${nodeAddr}/0/stake/${Date.now()}/value`,
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
            ref: `/manage_app/test_raw/create/${Date.now()}`,
            value: { admin: { [defaultAddr]: true } }
          },
          {
            type: 'SET_VALUE',
            ref: `/manage_app/bfan_raw/create/${Date.now()}`,
            value: { admin: { [defaultAddr]: true } }
          },
        ],
        nonce: -1
      })).data;
      await waitUntilTxFinalized(createApps.result.tx_hash);
    });

    it('validateAppName returns true', async function () {
      expect(eraseProtoVer(await ain.validateAppName('test_new'))).toStrictEqual({
        "is_valid": true,
        "result": true,
        "code": 0,
        "protoVer": "erased",
      });
    });

    it('validateAppName returns false', async function () {
      expect(eraseProtoVer(await ain.validateAppName('app/path'))).toStrictEqual({
        "is_valid": false,
        "result": false,
        "code": 30601,
        "message": "Invalid app name for state label: app/path",
        "protoVer": "erased",
      });
    });

    it('sendSignedTransaction', async function() {
      const tx: TransactionBody = {
        nonce: -1,
        gas_price: 500,
        timestamp: Date.now(),
        operation: {
          type: "SET_OWNER",
          ref: "/apps/bfan_raw",
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

      await ain.sendSignedTransaction(sig, tx)
      .then(res => {
        expect(res.code).toBe(undefined);
        expect(res.result.tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res.result.result.code).toBe(0);
      })
      .catch(e => {
        console.log("ERROR:", e)
        fail('should not happen');
      })
    });

    it('sendSignedTransaction with invalid signature', async function() {
      const tx: TransactionBody = {
        nonce: -1,
        gas_price: 500,
        timestamp: Date.now(),
        operation: {
          type: "SET_OWNER",
          ref: "/apps/bfan_raw",
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

      await ain.sendSignedTransaction(sig, tx)
      .then(res => {
        expect(eraseProtoVer(res)).toStrictEqual({
          "code": 30302,
          "message": "Missing properties.",
          "protoVer": "erased",
          "result": null,
        });
      })
      .catch(e => {
        console.log("ERROR:", e)
        fail('should not happen');
      })
    });

    it('sendTransactionBatch', async function() {
      const tx1: TransactionInput = {
        operation: {
          type: 'SET_VALUE',
          ref: "/apps/bfan_raw/users",
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
              ref: `/apps/bfan_raw/users`,
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
              ref: `/apps/bfan_raw/users/${defaultAddr}`,
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
          ref: `/apps/bfan_raw/users/${defaultAddr}`,
          value: { '.rule': { 'write': `auth.addr === "${defaultAddr}"` } }
        }
      };

      const tx4: TransactionInput = {
        operation: {
          type: 'SET_VALUE',
          ref: `/apps/bfan_raw/users/${defaultAddr}`,
          value: false
        }
      };

      const tx5: TransactionInput = {
        operation: {
          type: 'SET_VALUE',
          ref: `/apps/bfan_raw/users/${defaultAddr}`,
          value: true
        },
        address: addr1
      };

      const tx6: TransactionInput = {
        operation: {
          type: 'SET_RULE',
          ref: `/apps/bfan_raw/users/${defaultAddr}`,
          value: { '.rule': { 'write': 'true' } }
        },
        address: addr2
      }

      await ain.sendTransactionBatch([ tx1, tx2, tx3, tx4, tx5, tx6 ])
      .then(res => {
        // Verify all 6 transactions return valid results with tx hashes
        for (let i = 0; i < 6; i++) {
          expect(res.result[i].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
          expect(res.result[i].result).toBeDefined();
        }
      })
      .catch(e => {
        console.log("ERROR:", e)
        fail('should not happen');
      })
    });

    it('sendTransactionBatch with empty tx_list', async function() {
      await ain.sendTransactionBatch([])
      .then(res => {
        expect(eraseProtoVer(res)).toStrictEqual({
          "result": null,
          "code": 30401,
          "message": "Invalid batch transaction format.",
          "protoVer": "erased",
        });
      })
      .catch(e => {
        console.log("ERROR:", e)
        fail('should not happen');
      })
    });
  });

  describe('Database', function() {
    let defaultAccount, allowed_path;
    const test_path = 'apps/bfan_raw';

    beforeAll(() => {
      defaultAccount = ain.wallet.defaultAccount!.address;
      allowed_path = `${test_path}/users/${defaultAccount}`;
    });

    it('getValue', async function() {
      expect(eraseProtoVer(await ain.db.ref(allowed_path).getValue())).toEqual({
        "protoVer": "erased",
        "result": false,
      });
    });

    it('get', async function() {
      expect(eraseProtoVer(await ain.db.ref(allowed_path).get(
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
      ))).toEqual({
        "protoVer": "erased",
        "result": [
          {
            ".rule": {
              "write": "auth.addr === \"0x08Aed7AF9354435c38d52143EE50ac839D20696b\"",
            },
          },
          false,
          null,
        ],
      });
    });

    it('get with empty op_list', async function() {
      expect(eraseProtoVer(await ain.db.ref(allowed_path).get([])))
      .toEqual({
        "result": null,
        "code": 30006,
        "message": "Invalid op_list given",
        "protoVer": "erased",
      });
    });
  });
});
