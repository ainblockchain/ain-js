const Ain = require('@ainblockchain/ain-js').default;
const ain = new Ain('https://testnet-api.ainetwork.ai/', 'wss://testnet-event.ainetwork.ai/');

async function main() {
  await ain.em.connect(); // NOTE: https://docs.ainetwork.ai/reference/blockchain-sdk/ain-js/ain.em#connect

  ain.em.subscribe('VALUE_CHANGED', {
    path: '/apps/$appName/data', // NOTE: https://docs.ainetwork.ai/reference/blockchain-sdk/ain-js/ain.em#event-type
  }, (valueChangedEvent) => {
    console.log(`Before value: ${valueChangedEvent.values.before}`);
    console.log(`After value: ${valueChangedEvent.values.after}`);
  }, (err) => {
    console.log(`Error: ${err.message}`);
  });

  ain.em.subscribe('BLOCK_FINALIZED', {
    block_number: null, // NOTE: https://docs.ainetwork.ai/reference/blockchain-sdk/ain-js/ain.em#event-type
  }, (blockFinalizedEvent) => {
    console.log(`Finalized block number: ${blockFinalizedEvent.block_number}`);
    console.log(`Finalized block hash: ${blockFinalizedEvent.block_hash}`);
  }, (err) => {
    console.log(`Error: ${err.message}`);
  });
}

main();
