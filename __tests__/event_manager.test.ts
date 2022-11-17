// @ts-nocheck
import Ain from '../src/ain';
import { FAILED_TO_REGISTER_ERROR_CODE } from '../src/constants';
import { FilterDeletionReasons, TransactionStates } from '../src/types';

const { test_event_handler_node } = require('./test_data');

jest.setTimeout(180000);

describe('Event Handler', function() {
  let ain = new Ain(test_event_handler_node);
  let eventFilterId: string;

  beforeAll(async () => {
    await ain.em.connect();
  });

  afterEach(async () => {
    ain.em.unsubscribe(eventFilterId, (err) => {
      if (err) {
        console.log(`Failed to unsubscribe subscription. (${err.message})`);
      }
    });
  })

  afterAll(() => {
    ain.em.disconnect();
  });

  describe('BLOCK_FINALIZED', () => {
    it('Subscribe to BLOCK_FINALIZED', (done) => {
      eventFilterId = ain.em.subscribe('BLOCK_FINALIZED', {
        block_number: null,
      }, (data) => {
        done();
      });
    });

    it('Subscribe to BLOCK_FINALIZED with wrong config', (done) => {
      eventFilterId = ain.em.subscribe('BLOCK_FINALIZED', {
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

      eventFilterId = ain.em.subscribe('VALUE_CHANGED', {
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
        try {
          if (blockEventCount + userEventCount === 2) {
            expect(blockEventCount).toBe(1);
            expect(userEventCount).toBe(1);
            done();
          }
        } catch (err) {
          done(err);
        }
      });

      ain.db.ref(testAppPath).setValue({
        value: 'Dummy',
      });
    });

    it('Subscribe to VALUE_CHANGED with event_source = BLOCK', (done) => {
      eventFilterId = ain.em.subscribe('VALUE_CHANGED', {
        path: testAppPath,
        event_source: 'BLOCK',
      }, (event) => {
        try {
          expect(event.event_source).toBe('BLOCK');
          done();
        } catch (err) {
          done(err);
        }
      });

      ain.db.ref(testAppPath).setValue({
        value: 'Dummy',
      });
    });

    it('Subscribe to VALUE_CHANGED with event_source = USER', (done) => {
      eventFilterId = ain.em.subscribe('VALUE_CHANGED', {
        path: testAppPath,
        event_source: 'USER',
      }, (event) => {
        try {
          expect(event.event_source).toBe('USER');
          done();
        } catch (err) {
          done(err);
        }
      });

      ain.db.ref(testAppPath).setValue({
        value: 'Dummy',
      });
    });

    it('Subscribe to VALUE_CHANGED with wrong config', (done) => {
      eventFilterId = ain.em.subscribe('VALUE_CHANGED', {
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
          eventFilterId = ain.em.subscribe('TX_STATE_CHANGED', {
            tx_hash: result.tx_hash,
          }, (event) => {
            try {
              if (eventTriggeredCnt === 0) {
                expect(event.tx_state.before).toBe(null);
                expect(event.tx_state.after).toBe(TransactionStates.EXECUTED);
                eventTriggeredCnt++;
              } else {
                expect(event.tx_state.before).toBe(TransactionStates.EXECUTED);
                expect(event.tx_state.after).toBe(TransactionStates.FINALIZED);
                eventTriggeredCnt++;
              }
            } catch (err) {
              done(err);
            }
          }, (err) => {
            done(new Error(err.message));
          }, (event) => {
            try {
              expect(eventTriggeredCnt).toBe(2);
              expect(event.filter_id).toBe(eventFilterId);
              expect(event.reason).toBe(FilterDeletionReasons.END_STATE_REACHED);
              done();
            } catch (err) {
              done(err);
            }
          });
        })
      });
      it('Invalid transaction', (done) => {
        ain.db.ref('/apps/invalid').setValue({
          value: Date.now(),
        }).then((result)=>{
          eventFilterId = ain.em.subscribe('TX_STATE_CHANGED', {
            tx_hash: result.tx_hash,
          }, (event) => {
            try {
              // NOTE(ehgmsdk20): It only checks if the transaction has been added to the tx_pool
              // in a PENDING state, but does not check the tx state change after that.
              // If the node that executed the Tx does not become a proposal node,
              // the state of the sent tx will change from PENDING to TIMED_OUT,
              // which takes too long for the test to wait.
              expect(event.tx_state.before).toBe(null);
              expect(event.tx_state.after).toBe(TransactionStates.PENDING);
              done();
            } catch (err) {
              done(err);
            }
          }, (err) => {
            done(new Error(err.message));
          })
        });
      });
    });

    it('Subscribe to TX_STATE_CHANGED and deleted because of timeout', (done) => {
      eventFilterId = ain.em.subscribe('TX_STATE_CHANGED', {
        tx_hash: '0x9ac44b45853c2244715528f89072a337540c909c36bab4c9ed2fd7b7dbab47b2',
      }, (event) => {
        done(new Error('Tx must not be executed'));
      }, (err) => {
        done(new Error(err.message));
      }, (event) => {
        try {
          expect(event.filter_id).toBe(eventFilterId);
          expect(event.reason).toBe(FilterDeletionReasons.FILTER_TIMEOUT);

          //check whether the filter is actually deleted
          ain.em.unsubscribe(eventFilterId, (err, txHash) => {
            if (err) {
              expect(err.message).toBe(`Non-existent filter ID (${eventFilterId})`);
              done();
            }
            if (txHash) {
              done("Filter must be deleted");
            }
          });
        } catch (err) {
          done(err);
        }
      });
    });

    it('Subscribe to TX_STATE_CHANGED with wrong config', (done) => {
      eventFilterId = ain.em.subscribe('TX_STATE_CHANGED', {
        tx_hash: '123',
      }, (event) => {
      }, (err) => {
        try {
          expect(err.code).toBe(FAILED_TO_REGISTER_ERROR_CODE);
          expect(err.message).toBe(`Failed to register filter with filter ID: ${eventFilterId} ` +
              `due to error: Invalid tx hash (123)`);
          //check whether the filter is actually deleted
          ain.em.unsubscribe(eventFilterId, (err, txHash) => {
            if (err) {
              expect(err.message).toBe(`Non-existent filter ID (${eventFilterId})`);
              done();
            }
            if (txHash) {
              done("Filter must be deleted");
            }
          });
        } catch (err) {
          done(err);
        }
      });
    });
  });
});
