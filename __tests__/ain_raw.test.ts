import Ain from '../src/ain';
import { TransactionBody, SetOperation, TransactionInput } from '../src/types';
import axios from 'axios';
const {
  test_sk,
  test_node_1,
  test_node_2
} = require('./test_data');

const TX_PATTERN = /^0x([A-Fa-f0-9]{64})$/;

jest.setTimeout(180000);

function eraseProtoVer(retVal) {
  retVal.protoVer = 'erased';
  return retVal;
}

describe('ain-js', function() {
  let ain = new Ain(test_node_1);
  ain.setRawResultMode(true);

  beforeAll(() => {
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
        expect(eraseProtoVer(res)).toStrictEqual({
          "protoVer": "erased",
          "result": {
            "result": {
              "bandwidth_gas_amount": 1,
              "code": 0,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "app": {
                    "bfan_raw": 1,
                  },
                  "service": 0,
                },
                "state": {
                  "app": {
                    "bfan_raw": 912,
                  },
                  "service": 0,
                },
              },
              "gas_cost_total": 0,
            },
            "tx_hash": "0xdf776dd3771f6b9a55f5183f2d2015417d7860bea3719fc1286a4e08520da271",
          },
        });
      })
      .catch(e => {
        console.log("ERROR:", e)
        fail();
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
        fail();
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
        expect(res.result[0].result.code).toBe(12103);
        expect(res.result[0].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res.result[1].result.result_list[0].code).toBe(0);
        expect(res.result[1].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res.result[2].result.code).toBe(0);
        expect(res.result[2].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res.result[3].result.code).toBe(0);
        expect(res.result[3].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res.result[4].result.code).toBe(12103);
        expect(res.result[4].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
        expect(res.result[5].result.code).toBe(12302);
        expect(res.result[5].tx_hash).toEqual(expect.stringMatching(TX_PATTERN));
      })
      .catch(e => {
        console.log("ERROR:", e)
        fail();
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
        fail();
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
              "write": "auth.addr === \"0x09A0d53FDf1c36A131938eb379b98910e55EEfe1\"",
            },
          },
          false,
          null,
        ],
      });
    });

    it('get with empty op_list', async function() {
      expect(await ain.db.ref(allowed_path).get([]))
      .toEqual({
        "result": null,
        "code": 30006,
        "message": "Invalid op_list given",
        "protoVer": "1.0.7",
      });
    });
  });
});
