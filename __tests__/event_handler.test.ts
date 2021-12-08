import Ain from '../src/ain';

const { test_event_handler_node } = require('./test_data');
const delayMs = (time) => new Promise(resolve => setTimeout(resolve, time));

jest.setTimeout(60000);

describe('Event Handler', function() {
  let ain = new Ain(test_event_handler_node);

  beforeAll(async () => {
    await ain.eh.connect();
  });

  afterAll(() => {
    ain.eh.disconnect();
  });

  it('Subscribe BLOCK_FINALIZED', async () => {
    const callback = jest.fn();
    const subscription = ain.eh.subscribe('BLOCK_FINALIZED', {});
    subscription.once('data', (data) => {
      callback(data);
    });
    await delayMs(10000);
    expect(callback).toBeCalledTimes(1);
  });
});
