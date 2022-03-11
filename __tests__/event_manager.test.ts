import Ain from '../src/ain';

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
