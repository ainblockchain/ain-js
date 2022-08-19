import Ain from '../src/ain';
import { FilterDeletionReasons, TransactionStates } from '../src/types';

const { test_event_handler_node } = require('./test_data');
const delayMs = (time) => new Promise(resolve => setTimeout(resolve, time));

jest.setTimeout(180000);

describe('Event Handler', function() {
  let ain = new Ain(test_event_handler_node);

  beforeAll(async () => {
    await ain.em.connect();
  });

  afterAll(() => {
    ain.em.disconnect();
  });

  describe('BLOCK_FINALIZED', () => {
    it('Subscribe to BLOCK_FINALIZED', (done) => {
      ain.em.subscribe('BLOCK_FINALIZED', {
        block_number: null,
      }, (data) => {
        done();
      });
    });

    it('Subscribe to BLOCK_FINALIZED with wrong config', (done) => {
      ain.em.subscribe('BLOCK_FINALIZED', {
        block_number: -1,
      }, (data) => {
      }, (err) => {
        done();
      });
    });
  });

  describe('VALUE_CHANGED', () => {
    const [ testAccount ] = ain.wallet.create(1);
    const testAppName = `test_${Date.now()}`;
    const testAppPath = `/apps/${testAppName}`;

    beforeEach(async () => {
      // Create test app
      ain.wallet.setDefaultAccount(testAccount);
      await ain.db.ref(`/manage_app/${testAppName}/create/${Date.now()}`).setValue({
        value: { admin: { [testAccount]: true } },
      });
    });

    it('Subscribe to VALUE_CHANGED with event_source = null', (done) => {
      let blockEventCount = 0;
      let userEventCount = 0;

      ain.em.subscribe('VALUE_CHANGED', {
        path: testAppPath,
        event_source: null,
      }, (event) => {
        switch (event.event_source) {
          case 'BLOCK':
            blockEventCount++;
            break;
          case 'USER':
            userEventCount++;
            break;
        }
        if (blockEventCount + userEventCount === 2) {
          expect(blockEventCount).toBe(1);
          expect(userEventCount).toBe(1);
          done();
        }
      });

      ain.db.ref(testAppPath).setValue({
        value: 'Dummy',
      });
    });

    it('Subscribe to VALUE_CHANGED with event_source = BLOCK', (done) => {
      ain.em.subscribe('VALUE_CHANGED', {
        path: testAppPath,
        event_source: 'BLOCK',
      }, (event) => {
        expect(event.event_source).toBe('BLOCK');
        done();
      });

      ain.db.ref(testAppPath).setValue({
        value: 'Dummy',
      });
    });

    it('Subscribe to VALUE_CHANGED with event_source = USER', (done) => {
      ain.em.subscribe('VALUE_CHANGED', {
        path: testAppPath,
        event_source: 'USER',
      }, (event) => {
        expect(event.event_source).toBe('USER');
        done();
      });

      ain.db.ref(testAppPath).setValue({
        value: 'Dummy',
      });
    });

    it('Subscribe to VALUE_CHANGED with wrong config', (done) => {
      ain.em.subscribe('VALUE_CHANGED', {
        path: '/..wrong_app_name',
        event_source: null,
      }, (event) => {
      }, (err) => {
        done();
      });
    });
  });

  describe('TX_STATE_CHANGED', () => {
    const [ testAccount ] = ain.wallet.create(1);
    const testAppName = `test_2${Date.now()}`;
    const testAppPath = `/apps/${testAppName}`;

    beforeAll(async () => {
      // Create test app
      ain.wallet.setDefaultAccount(testAccount);
      await ain.db.ref(`/manage_app/${testAppName}/create/${Date.now()}`).setValue({
        value: { admin: { [testAccount]: true } },
      });
    });

    describe('Subscribe to TX_STATE_CHANGED and deleted because end state reached', () => {
      it('Valid transaction', (done) => {
        let eventTriggeredCnt = 0;
        ain.db.ref(testAppPath).setValue({
          value: Date.now(),
        }).then((result)=>{
          const filterId = ain.em.subscribe('TX_STATE_CHANGED', {
            tx_hash: result.tx_hash,
          }, (event) => {
            if (eventTriggeredCnt === 0) {
              expect(event.tx_state.before).toBe(null);
              expect(event.tx_state.after).toBe(TransactionStates.EXECUTED);
              eventTriggeredCnt++;
            } else {
              expect(event.tx_state.before).toBe(TransactionStates.EXECUTED);
              expect(event.tx_state.after).toBe(TransactionStates.FINALIZED);
              eventTriggeredCnt++;
            }
          }, (err) => {
            done.fail(new Error(err.message));
          }, (event) => {
            expect(eventTriggeredCnt).toBe(2);
            expect(event.filter_id).toBe(filterId);
            expect(event.reason).toBe(FilterDeletionReasons.END_STATE_REACHED);
            done();
          })
        })
      });
      it('Invalid transaction', (done) => {
        let eventTriggeredCnt = 0;
        ain.db.ref('/apps/invalid').setValue({
          value: Date.now(),
        }).then((result)=>{
          const filterId = ain.em.subscribe('TX_STATE_CHANGED', {
            tx_hash: result.tx_hash,
          }, (event) => {
            if (eventTriggeredCnt === 0) {
              expect(event.tx_state.before).toBe(null);
              expect(event.tx_state.after).toBe(TransactionStates.PENDING);
              eventTriggeredCnt++;
            } else {
              expect(event.tx_state.before).toBe(TransactionStates.PENDING);
              expect(event.tx_state.after).toBe(TransactionStates.REVERTED);
              eventTriggeredCnt++;
            }
          }, (err) => {
            done.fail(new Error(err.message));
          }, (event) => {
            expect(eventTriggeredCnt).toBe(2);
            expect(event.filter_id).toBe(filterId);
            expect(event.reason).toBe(FilterDeletionReasons.END_STATE_REACHED);
            done();
          })
        })
      });
    });

    it('Subscribe to TX_STATE_CHANGED and deleted because of timeout', (done) => {
      const filterId = ain.em.subscribe('TX_STATE_CHANGED', {
        tx_hash: '0x9ac44b45853c2244715528f89072a337540c909c36bab4c9ed2fd7b7dbab47b2',
      }, (event) => {
        done.fail(new Error('Tx must not be executed'));
      }, (err) => {
        done.fail(new Error(err.message));
      }, (event) => {
        expect(event.filter_id).toBe(filterId);
        expect(event.reason).toBe(FilterDeletionReasons.FILTER_TIMEOUT);
        done();
      });
    });

    it('Subscribe to TX_STATE_CHANGED with wrong config', (done) => {
      ain.em.subscribe('TX_STATE_CHANGED', {
        tx_hash: '123',
      }, (event) => {
      }, (err) => {
        expect(err.code).toBe(70301);
        expect(err.message).toBe('Invalid tx hash (123)');
        done();
      });
    });
  });
});
