/**
 * Knowledge Module — Multi-User Scenario
 *
 * Two users (Alice & Bob) explore the same topics, discover each other's work,
 * and test cross-user access including gated content.
 *
 * Run: npx ts-node examples/knowledge_multiuser.ts
 * Requires: local blockchain running (bash start_local_blockchain.sh)
 *           and knowledge app already set up (run knowledge_demo.ts first)
 */
import Ain from '../src/ain';

const PROVIDER_URL = process.env.AIN_PROVIDER_URL || 'http://localhost:8081';
const BLOCK_TIME = 10000;

// Node private keys from start_local_blockchain.sh (set via env for production)
const ALICE_SK = process.env.AIN_PRIVATE_KEY || process.env.ALICE_SK || '';
const BOB_SK = process.env.BOB_SK || '';

async function main() {
  // --- Setup two independent clients ---
  const alice = new Ain(PROVIDER_URL);
  const aliceAddr = alice.wallet.addAndSetDefaultAccount(ALICE_SK);

  const bob = new Ain(PROVIDER_URL);
  const bobAddr = bob.wallet.addAndSetDefaultAccount(BOB_SK);

  console.log(`\n=== Multi-User Knowledge Demo ===`);
  console.log(`Alice: ${aliceAddr}`);
  console.log(`Bob:   ${bobAddr}\n`);

  // -------------------------------------------------------------------------
  // 1. Check existing state from previous demo
  // -------------------------------------------------------------------------
  console.log('1. Checking existing state...');
  const existingTopics = await alice.knowledge.listTopics();
  console.log('   Existing topics:', existingTopics);

  const aliceExisting = await alice.knowledge.getExplorations(aliceAddr, 'physics/quantum');
  console.log('   Alice\'s existing quantum entries:', aliceExisting ? Object.keys(aliceExisting).length : 0);

  // -------------------------------------------------------------------------
  // 2. Bob writes his own explorations on the same topics
  // -------------------------------------------------------------------------
  console.log('\n2. Bob explores physics/quantum...');

  const b1 = await bob.knowledge.explore({
    topicPath: 'physics/quantum',
    title: 'Quantum Entanglement',
    content: 'Two particles can be correlated such that measuring one instantly determines the state of the other, regardless of distance. Einstein called this "spooky action at a distance."',
    summary: 'How entangled particles share quantum states across space.',
    depth: 4,
    tags: 'quantum,entanglement,EPR,bell',
  });
  console.log('   Bob explore #1:', b1?.result?.result_list?.['0']?.code === 0 ? 'OK' : JSON.stringify(b1?.result));
  await sleep(BLOCK_TIME);

  const b2 = await bob.knowledge.explore({
    topicPath: 'physics/quantum',
    title: 'Quantum Computing Basics',
    content: 'Quantum computers use qubits that can exist in superposition. Algorithms like Shor\'s and Grover\'s exploit quantum parallelism for exponential speedup on specific problems.',
    summary: 'Introduction to quantum computing and its key algorithms.',
    depth: 3,
    tags: 'quantum,computing,qubits,algorithms',
  });
  console.log('   Bob explore #2:', b2?.result?.result_list?.['0']?.code === 0 ? 'OK' : JSON.stringify(b2?.result));
  await sleep(BLOCK_TIME);

  // Bob also writes a gated entry
  const b3 = await bob.knowledge.explore({
    topicPath: 'physics/quantum',
    title: 'Bob\'s Premium: Quantum Error Correction Deep Dive',
    content: 'Detailed analysis of surface codes, stabilizer formalism, and fault-tolerant quantum computation...',
    summary: 'Advanced quantum error correction techniques — premium.',
    depth: 5,
    tags: 'quantum,error-correction,surface-codes',
    price: '1.00',
    gatewayUrl: 'https://bob-gateway.example.com/qec-notes',
  });
  console.log('   Bob explore #3 (gated $1.00):', b3?.result?.result_list?.['0']?.code === 0 ? 'OK' : JSON.stringify(b3?.result));
  await sleep(BLOCK_TIME);

  // Bob explores relativity too
  const b4 = await bob.knowledge.explore({
    topicPath: 'physics/relativity',
    title: 'Gravitational Lensing',
    content: 'Massive objects curve spacetime, bending light paths. This effect is used to detect dark matter and observe distant galaxies magnified by foreground clusters.',
    summary: 'How gravity bends light and what we learn from it.',
    depth: 3,
    tags: 'relativity,gravity,lensing,dark-matter',
  });
  console.log('   Bob explore #4 (relativity):', b4?.result?.result_list?.['0']?.code === 0 ? 'OK' : JSON.stringify(b4?.result));
  await sleep(BLOCK_TIME);

  console.log('   Bob\'s explorations written!');

  // -------------------------------------------------------------------------
  // 3. Cross-user discovery: see who explored what
  // -------------------------------------------------------------------------
  console.log('\n3. Cross-user discovery...');

  const quantumExplorers = await alice.knowledge.getExplorers('physics/quantum');
  console.log('   Explorers of physics/quantum:', quantumExplorers);

  const relativityExplorers = await alice.knowledge.getExplorers('physics/relativity');
  console.log('   Explorers of physics/relativity:', relativityExplorers);

  // -------------------------------------------------------------------------
  // 4. Read each other's explorations
  // -------------------------------------------------------------------------
  console.log('\n4. Reading each other\'s entries...');

  const bobQuantum = await alice.knowledge.getExplorations(bobAddr, 'physics/quantum');
  if (bobQuantum) {
    console.log(`   Bob's quantum entries (seen by Alice):`);
    for (const [id, entry] of Object.entries(bobQuantum)) {
      const e = entry as any;
      console.log(`   - "${e.title}" (depth: ${e.depth}, price: ${e.price || 'free'})`);
      if (e.content) {
        console.log(`     content: "${e.content.substring(0, 60)}..."`);
      } else {
        console.log(`     [gated] summary: "${e.summary}"`);
      }
    }
  }

  const aliceQuantum = await bob.knowledge.getExplorations(aliceAddr, 'physics/quantum');
  if (aliceQuantum) {
    console.log(`   Alice's quantum entries (seen by Bob):`);
    for (const [id, entry] of Object.entries(aliceQuantum)) {
      const e = entry as any;
      console.log(`   - "${e.title}" (depth: ${e.depth}, price: ${e.price || 'free'})`);
    }
  }

  // -------------------------------------------------------------------------
  // 5. Updated frontier with both users
  // -------------------------------------------------------------------------
  console.log('\n5. Updated frontier...');

  const quantumFrontier = await alice.knowledge.getFrontier('physics/quantum');
  console.log('   physics/quantum frontier:');
  console.log(`     explorers: ${quantumFrontier.explorers.length} (${quantumFrontier.explorers.map(a => a.substring(0, 8) + '...').join(', ')})`);
  console.log(`     stats: explorer_count=${quantumFrontier.stats.explorer_count}, max_depth=${quantumFrontier.stats.max_depth}, avg_depth=${quantumFrontier.stats.avg_depth}`);

  console.log('\n   Frontier map (physics):');
  const map = await alice.knowledge.getFrontierMap('physics');
  for (const entry of map) {
    console.log(`     ${entry.topic}: ${entry.stats.explorer_count} explorers, max_depth=${entry.stats.max_depth}, avg_depth=${entry.stats.avg_depth}`);
  }

  // -------------------------------------------------------------------------
  // 6. Bob accesses Alice's free content
  // -------------------------------------------------------------------------
  console.log('\n6. Bob accesses Alice\'s free content...');
  if (aliceQuantum) {
    const freeEntry = Object.entries(aliceQuantum).find(([_, e]: any) => !e.price);
    if (freeEntry) {
      const [freeId, freeData] = freeEntry;
      const accessResult = await bob.knowledge.access(aliceAddr, 'physics/quantum', freeId);
      console.log(`   Accessed "${(freeData as any).title}":`);
      console.log(`     paid: ${accessResult.paid}`);
      console.log(`     content: "${accessResult.content.substring(0, 80)}..."`);
    }
  }

  // -------------------------------------------------------------------------
  // 7. Bob tries to access Alice's gated content (no x402 = expected error)
  // -------------------------------------------------------------------------
  console.log('\n7. Bob tries to access Alice\'s gated content...');
  if (aliceQuantum) {
    const gatedEntry = Object.entries(aliceQuantum).find(([_, e]: any) => e.price);
    if (gatedEntry) {
      const [gatedId, gatedData] = gatedEntry;
      console.log(`   Trying "${(gatedData as any).title}" (price: ${(gatedData as any).price})...`);
      try {
        await bob.knowledge.access(aliceAddr, 'physics/quantum', gatedId);
      } catch (err: any) {
        console.log(`   Expected error: ${err.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8. Alice tries to access Bob's gated content (also no x402)
  // -------------------------------------------------------------------------
  console.log('\n8. Alice tries to access Bob\'s gated content...');
  if (bobQuantum) {
    const gatedEntry = Object.entries(bobQuantum).find(([_, e]: any) => e.price);
    if (gatedEntry) {
      const [gatedId, gatedData] = gatedEntry;
      console.log(`   Trying "${(gatedData as any).title}" (price: ${(gatedData as any).price})...`);
      try {
        await alice.knowledge.access(bobAddr, 'physics/quantum', gatedId);
      } catch (err: any) {
        console.log(`   Expected error: ${err.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 9. Verify permission isolation: Alice can't write to Bob's path
  // -------------------------------------------------------------------------
  console.log('\n9. Permission isolation test...');
  console.log('   Alice tries to write an exploration as Bob (should fail rule check)...');
  try {
    // Alice's ain instance is signed by Alice, but we try writing to Bob's exploration path
    const badResult = await alice.db.ref(`/apps/knowledge/explorations/${bobAddr}/test|path/fake_entry`).setValue({
      value: { title: 'Injected by Alice', content: 'Should not work' }
    });
    const code = badResult?.result?.code;
    if (code !== 0) {
      console.log(`   Correctly rejected (code: ${code})`);
    } else {
      console.log('   WARNING: Write succeeded unexpectedly!');
    }
  } catch (err: any) {
    console.log(`   Correctly rejected: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // 10. Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Summary ===');
  const allAlice = await alice.knowledge.getExplorationsByUser(aliceAddr);
  const allBob = await bob.knowledge.getExplorationsByUser(bobAddr);
  const aliceTopicCount = allAlice ? Object.keys(allAlice).length : 0;
  const bobTopicCount = allBob ? Object.keys(allBob).length : 0;
  let aliceEntryCount = 0;
  let bobEntryCount = 0;
  if (allAlice) for (const t of Object.values(allAlice)) { aliceEntryCount += Object.keys(t as any).length; }
  if (allBob) for (const t of Object.values(allBob)) { bobEntryCount += Object.keys(t as any).length; }

  console.log(`Alice: ${aliceEntryCount} entries across ${aliceTopicCount} topics`);
  console.log(`Bob:   ${bobEntryCount} entries across ${bobTopicCount} topics`);
  console.log(`Total explorers on physics/quantum: ${quantumExplorers.length}`);
  console.log(`Max depth reached on physics/quantum: ${quantumFrontier.stats.max_depth}`);
  console.log();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
