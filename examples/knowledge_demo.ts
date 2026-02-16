/**
 * Knowledge Module — Real Example
 *
 * Run: npx ts-node examples/knowledge_demo.ts
 */
import Ain from '../src/ain';

const PROVIDER_URL = 'http://localhost:8081';
const BLOCK_TIME = 10000; // Wait time for block finalization

async function main() {
  const ain = new Ain(PROVIDER_URL);

  // Use node 0's private key (has balance on local chain)
  const address = ain.wallet.addAndSetDefaultAccount(
    'b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96'
  );
  console.log(`\n=== Account: ${address} ===\n`);

  // -------------------------------------------------------------------------
  // 1. Setup App (create /apps/knowledge with rules)
  // -------------------------------------------------------------------------
  console.log('1. Setting up knowledge app...');
  const setupResult = await ain.knowledge.setupApp();
  console.log('   setupApp tx result:', JSON.stringify(setupResult?.result, null, 2));
  console.log('   Waiting for block finalization...');
  await sleep(BLOCK_TIME);

  // Verify the app exists
  const appCheck = await ain.db.ref('/apps/knowledge').getValue();
  console.log('   App exists:', appCheck !== null);

  // -------------------------------------------------------------------------
  // 2. Register Topics
  // -------------------------------------------------------------------------
  console.log('\n2. Registering topics...');

  const r1 = await ain.knowledge.registerTopic('physics', {
    title: 'Physics',
    description: 'The study of matter, energy, and the fundamental forces of nature.',
  });
  console.log('   Registered physics:', r1?.result?.code === 0 || r1?.result === true ? 'OK' : JSON.stringify(r1?.result));
  await sleep(BLOCK_TIME);

  const r2 = await ain.knowledge.registerTopic('physics/quantum', {
    title: 'Quantum Physics',
    description: 'The study of phenomena at the atomic and subatomic level.',
  });
  console.log('   Registered physics/quantum:', r2?.result?.code === 0 || r2?.result === true ? 'OK' : JSON.stringify(r2?.result));
  await sleep(BLOCK_TIME);

  const r3 = await ain.knowledge.registerTopic('physics/relativity', {
    title: 'Relativity',
    description: 'Einstein\'s theories of special and general relativity.',
  });
  console.log('   Registered physics/relativity:', r3?.result?.code === 0 || r3?.result === true ? 'OK' : JSON.stringify(r3?.result));
  await sleep(BLOCK_TIME);

  // -------------------------------------------------------------------------
  // 3. List Topics
  // -------------------------------------------------------------------------
  console.log('\n3. Listing topics...');
  const topics = await ain.knowledge.listTopics();
  console.log('   Top-level topics:', topics);

  const subtopics = await ain.knowledge.listSubtopics('physics');
  console.log('   Subtopics of physics:', subtopics);

  const topicInfo = await ain.knowledge.getTopicInfo('physics/quantum');
  console.log('   Topic info (physics/quantum):', topicInfo);

  // -------------------------------------------------------------------------
  // 4. Explore (write knowledge entries)
  // -------------------------------------------------------------------------
  console.log('\n4. Writing explorations...');

  const e1 = await ain.knowledge.explore({
    topicPath: 'physics/quantum',
    title: 'Wave-Particle Duality',
    content: 'Light exhibits both wave-like and particle-like properties. The double-slit experiment demonstrates this fundamental aspect of quantum mechanics.',
    summary: 'An introduction to wave-particle duality in quantum physics.',
    depth: 2,
    tags: 'quantum,duality,waves,particles',
  });
  console.log('   explore #1 result:', JSON.stringify(e1?.result));
  await sleep(BLOCK_TIME);

  const e2 = await ain.knowledge.explore({
    topicPath: 'physics/quantum',
    title: 'Heisenberg Uncertainty Principle',
    content: 'It is fundamentally impossible to simultaneously know both the exact position and exact momentum of a particle.',
    summary: 'The uncertainty principle and its implications.',
    depth: 3,
    tags: 'quantum,uncertainty,heisenberg',
  });
  console.log('   explore #2 result:', JSON.stringify(e2?.result));
  await sleep(BLOCK_TIME);

  const e3 = await ain.knowledge.explore({
    topicPath: 'physics/relativity',
    title: 'Time Dilation',
    content: 'Time passes more slowly for objects moving at high velocities relative to a stationary observer.',
    summary: 'How speed affects the passage of time.',
    depth: 2,
    tags: 'relativity,time,dilation',
  });
  console.log('   explore #3 result:', JSON.stringify(e3?.result));
  await sleep(BLOCK_TIME);

  // Gated (priced) content
  const e4 = await ain.knowledge.explore({
    topicPath: 'physics/quantum',
    title: 'Advanced Quantum Field Theory Notes',
    content: 'This is premium content about QFT...',
    summary: 'Comprehensive notes on quantum field theory — premium content.',
    depth: 5,
    tags: 'quantum,qft,advanced',
    price: '0.50',
    gatewayUrl: 'https://my-gateway.example.com/qft-notes',
  });
  console.log('   explore #4 (gated) result:', JSON.stringify(e4?.result));
  await sleep(BLOCK_TIME);

  console.log('   Explorations written!');

  // -------------------------------------------------------------------------
  // 5. Read Explorations
  // -------------------------------------------------------------------------
  console.log('\n5. Reading explorations...');
  const explorations = await ain.knowledge.getExplorations(address, 'physics/quantum');
  if (explorations) {
    const entries = Object.entries(explorations);
    console.log(`   Found ${entries.length} entries for physics/quantum:`);
    for (const [id, entry] of entries) {
      const e = entry as any;
      console.log(`   - [${id}] "${e.title}" (depth: ${e.depth}, price: ${e.price || 'free'})`);
    }
  } else {
    console.log('   No explorations found.');
  }

  // -------------------------------------------------------------------------
  // 6. Get Explorers
  // -------------------------------------------------------------------------
  console.log('\n6. Getting explorers...');
  const explorers = await ain.knowledge.getExplorers('physics/quantum');
  console.log('   Explorers of physics/quantum:', explorers);

  // -------------------------------------------------------------------------
  // 7. Topic Stats & Frontier
  // -------------------------------------------------------------------------
  console.log('\n7. Topic stats & frontier...');
  const stats = await ain.knowledge.getTopicStats('physics/quantum');
  console.log('   Stats for physics/quantum:', stats);

  const frontier = await ain.knowledge.getFrontier('physics/quantum');
  console.log('   Frontier for physics/quantum:', {
    info: frontier.info?.title,
    stats: frontier.stats,
    explorers: frontier.explorers,
  });

  // -------------------------------------------------------------------------
  // 8. Frontier Map (bird's-eye view)
  // -------------------------------------------------------------------------
  console.log('\n8. Frontier map for physics...');
  const frontierMap = await ain.knowledge.getFrontierMap('physics');
  for (const entry of frontierMap) {
    console.log(`   ${entry.topic}: ${entry.stats.explorer_count} explorers, max_depth=${entry.stats.max_depth}, avg_depth=${entry.stats.avg_depth}`);
  }

  // -------------------------------------------------------------------------
  // 9. Access free content
  // -------------------------------------------------------------------------
  console.log('\n9. Accessing free content...');
  if (explorations) {
    const firstFreeEntry = Object.entries(explorations).find(([_, e]: any) => !e.price);
    if (firstFreeEntry) {
      const [freeId] = firstFreeEntry;
      const result = await ain.knowledge.access(address, 'physics/quantum', freeId);
      console.log('   Free access result:', {
        paid: result.paid,
        contentPreview: result.content.substring(0, 80) + '...',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 10. Check access for gated content (without x402 client)
  // -------------------------------------------------------------------------
  console.log('\n10. Attempting gated content access (without x402 client)...');
  if (explorations) {
    const gatedEntry = Object.entries(explorations).find(([_, e]: any) => e.price);
    if (gatedEntry) {
      const [gatedId] = gatedEntry;
      try {
        await ain.knowledge.access(address, 'physics/quantum', gatedId);
      } catch (err: any) {
        console.log('   Expected error:', err.message);
      }
    }
  }

  console.log('\n=== Done! ===\n');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
