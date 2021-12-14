import Ain from '../src/ain';

const { test_event_handler_node } = require('./test_data');
const delayMs = (time) => new Promise(resolve => setTimeout(resolve, time));

jest.setTimeout(60000);

describe('Event Handler', function() {
  let ain = new Ain(test_event_handler_node);

  beforeAll(async () => {
    await ain.em.connect();
  });

  afterAll(() => {
    ain.em.disconnect();
  });

  it('Subscribe to BLOCK_FINALIZED', async () => {
    const callback = jest.fn();
    ain.em.subscribe('BLOCK_FINALIZED', {}, (data) => {
      callback(data);
    });
    await delayMs(10000);
    expect(callback).toBeCalled();
  });
});
