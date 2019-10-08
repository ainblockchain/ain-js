import Ain from '../src/ain';
import { TransactionBody } from '../src/types';
import * as ainUtil from '@ainblockchain/ain-util';
const TEST_STRING = 'test_string';
const {
  test_keystore,
  test_pw,
  test_seed,
  test_sk
} = require('./test_data');

// jest.mock('../__mocks__/request');
jest.setTimeout(60000);

// TODO (lia): Create more test cases
describe('ain-js', function() {
  let ain = new Ain('http://localhost:8081');

  describe('Network', function() {
    it('should set provider', async function() {
      ain.setProvider('http://localhost:8080');
      expect(await ain.net.isListening()).toBe(true);
      expect(await ain.net.getNodeInfo()).toMatchSnapshot();
      expect(await ain.net.getPeerCount()).toBe(9);
      expect(await ain.net.isSyncing()).toBe(false);
    });
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
      const v3Keystore = test_keystore
      const account = ain.wallet.fromV3Keystore(v3Keystore, test_pw);
    })

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
        ain.wallet.setDefaultAccount('0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6');
      } catch(e) {
        expect(e.message).toBe('[ain-js.wallet.setDefaultAccount] Add the account first before setting it to defaultAccount.');
      }
      ain.wallet.add(test_sk);
      ain.wallet.setDefaultAccount(('0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6'.toLowerCase()));
      expect(ain.wallet.defaultAccount).toBe('0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6');
      ain.wallet.setDefaultAccount('0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6');
      expect(ain.wallet.defaultAccount).toBe('0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6');
    });

    it('removeDefaultAccount', function() {
      ain.wallet.removeDefaultAccount();
      expect(ain.wallet.defaultAccount).toBe(null);
    });

    it('sign', function() {
      const message = 'hello';
      const hashed = ainUtil.hashMessage(message);
      try {
        ain.wallet.sign(message)
      } catch(e) {
        expect(e.message).toBe('[ain-js.wallet.sign] You need to specify the address or set defaultAccount.');
      }
      ain.wallet.setDefaultAccount('0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6');
      const sig = ain.wallet.sign(message);
      const addr:string = String(ain.wallet.defaultAccount);
      expect(ainUtil.ecVerifySig(message, sig, addr)).toBe(true);
    });

    it('signTransaction', function() {
      const tx: TransactionBody = {
        nonce: 17,
        timestamp: Date.now(),
        operation: {
          type: "SET_VALUE",
          ref: "afan/test",
          value: 100
        }
      }
      const sig = ain.wallet.signTransaction(tx);
      const addr:string = String(ain.wallet.defaultAccount);
      expect(ainUtil.ecVerifySig(tx, sig, addr)).toBe(true);
    });

    it('recover', function() {
      const tx: TransactionBody = {
        nonce: 17,
        timestamp: Date.now(),
        operation: {
          type: "SET_VALUE",
          ref: "afan/test",
          value: 100
        }
      }
      const sig = ain.wallet.signTransaction(tx);
      const addr:string = String(ain.wallet.defaultAccount);
      expect(ain.wallet.recover(sig)).toBe(addr);
    });
  });

  describe('Core', function() {
    it('getBlock', async function() {
      expect(await ain.getBlock(10000)).toMatchSnapshot();
      expect(await ain.getBlock('0xabcdefghijklmnop')).toMatchSnapshot();
      expect(await ain.getBlock(10000, true)).toMatchSnapshot();
      expect(await ain.getBlock('0xabcdefghijklmnop', true)).toMatchSnapshot();
    });

    it('getForger', async function() {
      expect(await ain.getForger(10000)).toMatchSnapshot();
      expect(await ain.getForger('0xabcdefghijklmnop')).toMatchSnapshot();
    });

    it('getValidators', async function() {
      expect(await ain.getValidators(10000)).toMatchSnapshot();
      expect(await ain.getValidators('0xabcdefghijklmnop')).toMatchSnapshot();
      expect(await ain.getValidators(10000)).toMatchSnapshot();
      expect(await ain.getValidators('0xabcdefghijklmnop')).toMatchSnapshot();
    });

    it('getTransaction', async function() {
      expect(await ain.getTransaction('0xabcdefghijklmnop')).toMatchSnapshot();
    });

    it('getTransactionResult', async function() {
      expect(await ain.getTransactionResult('0xabcdefghijklmnop')).toMatchSnapshot();
    });

    it('sendTransaction', function(done) {
      ain.sendTransaction({
        operation: {
          type: "SET_RULE",
          ref: "path/to/rule",
          value: {".write": false, ".apply": "OVERRIDE"}
        }
      })
      .then(res => {
        console.log("then",res)
        done();
      })
      .catch(e => {
        console.log("ERROR:",e)
        done();
      })
    })

    it('sendSignedTransaction', function(done) {
      const tx: TransactionBody = {
        nonce: 17,
        timestamp: Date.now(),
        operation: {
          type: "SET_RULE",
          ref: "path/to/rule",
          value: {".write": false, ".apply": "OVERRIDE"}
        }
      }
      const sig = ain.wallet.signTransaction(tx);

      ain.sendSignedTransaction(sig, tx)
      .then(res => {
        console.log("then",res)
        done();
      })
      .catch(e => {
        console.log("ERROR:",e)
        done();
      })
    })
  });

  describe('Database', function() {
    const test_path = 'test/path';

    it('.ref()', function() {
      expect(ain.db.ref().path).toBe('/');
      expect(ain.db.ref(test_path).path).toBe('/'+test_path);
    });

    it('getValue', async function() {
      expect(await ain.db.ref(test_path).getValue()).toMatchSnapshot();
    });

    it('getRule', async function() {
      expect(await ain.db.ref(test_path).getRule()).toMatchSnapshot();
    });

    it('getOwner', async function() {
      expect(await ain.db.ref(test_path).getOwner()).toMatchSnapshot();
    })

    it('get', async function() {
      expect(await ain.db.ref(test_path).get(
          [
            {
              type: 'GET_RULE',
              ref: ''
            },
            {
              type: 'GET_VALUE',
              ref: ''
            },
            {
              type: 'GET_VALUE',
              ref: 'deeper/path/'
            }
          ]
        )).toMatchSnapshot();
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

    it('deleteValue', function(done) {
      ain.db.ref(test_path).deleteValue()
      .then(res => {
        console.log("then",res)
        done();
      });
    });

    it('setOwner', function(done) {
      ain.db.ref(test_path).setOwner({
        value: {
          inherit: ["test/"],
          owners: {
            "*": {
              owner_update: true,
              rule_update: true,
              branch: true
            },
            "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6": {
              owner_update: true,
              rule_update: true,
              branch: true
            }
          }
        },
      })
      .then(res => {
        console.log("then",res)
        done();
      });
    });

    it('setRule', function(done) {
      ain.db.ref(test_path).setRule({
        value: {".write": true},
      })
      .then(res => {
        console.log("then",res)
        done();
      });
    });

    it('setValue', function(done) {
      ain.db.ref(test_path).setValue({
        value: 100,
      })
      .then(res => {
        console.log("then",res)
        done();
      });
    });

    it('set', function(done) {
      ain.db.ref().set({
        set_list: [
          {
            type: 'SET_RULE',
            ref: 'path/path/',
            value: {".write": true},
          },
          {
            type: 'DEC_VALUE',
            ref: 'path/path/path',
            value: 10,
          },
          {
            type: 'INC_VALUE',
            ref: 'path/path/',
            value: 5
          }
        ]
      })
      .then(res => {
        console.log("then",res)
        done();
      });
    });
  });

  describe('Utils', function() {
    it('isValidAddress', function() {
      expect(ain.utils.isValidAddress('')).toBe(false);
      expect(ain.utils.isValidAddress('0x00000000000000000000')).toBe(false);
      expect(ain.utils.isValidAddress('0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6')).toBe(true);
    });
  });
});
