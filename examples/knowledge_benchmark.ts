/**
 * Knowledge Graph Benchmark
 *
 * Populates 3 backends (blockchain, in-memory, Neo4j) with the same 17-paper
 * transformer graph, then benchmarks reads, graph traversals, and ledger ops.
 *
 * Run:
 *   npx ts-node examples/knowledge_benchmark.ts
 *
 * Prerequisites:
 *   - Neo4j: docker run -d -p 7687:7687 -p 7474:7474 -e NEO4J_AUTH=neo4j/testpassword neo4j:5
 *   - (Optional) AIN blockchain node on port 8081 for blockchain benchmark
 */

import Ain from '../src/ain';
import { ExplorationDepth } from '../src/knowledge/types';
import { KnowledgeGraph } from '../src/knowledge/knowledge-graph';
import { MemoryBackend } from '../src/knowledge/memory-backend';
import { Neo4jBackend } from '../src/knowledge/neo4j-backend';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROVIDER_URL = 'http://localhost:8081';
const BLOCK_TIME = 10_000;
const NEO4J_URI = 'bolt://localhost:7687';
const NEO4J_USER = 'neo4j';
const NEO4J_PASS = 'testpassword';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function txOk(result: any): boolean {
  if (!result) return false;
  const r = result.result;
  if (r === true) return true;
  if (r?.code === 0) return true;
  if (r?.result_list) {
    return Object.values(r.result_list).every((op: any) => op.code === 0);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Data (same as knowledge_graph_transformers.ts)
// ---------------------------------------------------------------------------

interface TopicEntry {
  path: string;
  title: string;
  description: string;
}

interface PaperEntry {
  id: string;
  title: string;
  year: number;
  topicPath: string;
  depth: ExplorationDepth;
  authors: string;
  arxiv: string | null;
  github: string | null;
  tags: string[];
  buildsOn: string[];
  influenced: string[];
  summary: string;
  concepts: string[];
}

const TOPICS: TopicEntry[] = [
  { path: 'ai', title: 'Artificial Intelligence', description: 'Research and applications of artificial intelligence.' },
  { path: 'ai/transformers', title: 'Transformers', description: 'The transformer architecture family and its descendants.' },
  { path: 'ai/transformers/attention', title: 'Attention Mechanisms', description: 'Core self-attention mechanism introduced in the original Transformer.' },
  { path: 'ai/transformers/encoder-only', title: 'Encoder-Only Models', description: 'Masked-language-model architectures: BERT, RoBERTa, ALBERT, XLNet, DeBERTa.' },
  { path: 'ai/transformers/decoder-only', title: 'Decoder-Only Models', description: 'Autoregressive language models: GPT family, Transformer-XL, LLaMA, Mistral.' },
  { path: 'ai/transformers/encoder-decoder', title: 'Encoder-Decoder Models', description: 'Sequence-to-sequence transformer models such as T5.' },
  { path: 'ai/transformers/vision', title: 'Vision Transformers', description: 'Transformer architectures applied to computer vision tasks.' },
  { path: 'ai/transformers/diffusion', title: 'Diffusion Models', description: 'Latent diffusion and stable diffusion models for image generation.' },
  { path: 'ai/state-space-models', title: 'State-Space Models', description: 'Structured state-space sequence models as alternatives to attention.' },
];

const PAPERS: PaperEntry[] = [
  {
    id: 'transformer', title: 'Attention Is All You Need', year: 2017,
    topicPath: 'ai/transformers/attention', depth: 3,
    authors: 'Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin',
    arxiv: 'https://arxiv.org/abs/1706.03762', github: 'https://github.com/tensorflow/tensor2tensor',
    tags: ['self-attention', 'encoder-decoder', 'positional-encoding', 'multi-head-attention'],
    buildsOn: [], influenced: ['gpt1', 'bert', 'transformer-xl', 't5', 'vit'],
    summary: 'Introduced the Transformer architecture, replacing recurrence and convolutions entirely with self-attention mechanisms.',
    concepts: ['Scaled dot-product attention', 'Multi-head attention', 'Positional encoding', 'Encoder-decoder architecture without recurrence'],
  },
  {
    id: 'gpt1', title: 'Improving Language Understanding by Generative Pre-Training (GPT-1)', year: 2018,
    topicPath: 'ai/transformers/decoder-only', depth: 3,
    authors: 'Radford, Narasimhan, Salimans, Sutskever', arxiv: null,
    github: 'https://github.com/openai/finetune-transformer-lm',
    tags: ['decoder-only', 'autoregressive', 'pre-training', 'fine-tuning'],
    buildsOn: ['transformer'], influenced: ['gpt2'],
    summary: 'Demonstrated that generative pre-training followed by fine-tuning yields large gains on NLP benchmarks.',
    concepts: ['Generative pre-training + discriminative fine-tuning', 'Decoder-only transformer', 'Transfer learning for NLP'],
  },
  {
    id: 'transformer-xl', title: 'Transformer-XL: Attentive Language Models Beyond a Fixed-Length Context', year: 2019,
    topicPath: 'ai/transformers/decoder-only', depth: 2,
    authors: 'Dai, Yang, Yang, Carbonell, Le, Salakhutdinov',
    arxiv: 'https://arxiv.org/abs/1901.02860', github: 'https://github.com/kimiyoung/transformer-xl',
    tags: ['decoder-only', 'autoregressive', 'segment-recurrence', 'relative-positional-encoding'],
    buildsOn: ['transformer'], influenced: ['xlnet'],
    summary: 'Extended Transformer with segment-level recurrence and relative positional encodings.',
    concepts: ['Segment-level recurrence mechanism', 'Relative positional encodings', 'Longer-term dependency modeling'],
  },
  {
    id: 'gpt2', title: 'Language Models are Unsupervised Multitask Learners (GPT-2)', year: 2019,
    topicPath: 'ai/transformers/decoder-only', depth: 2,
    authors: 'Radford, Wu, Child, Luan, Amodei, Sutskever', arxiv: null,
    github: 'https://github.com/openai/gpt-2',
    tags: ['decoder-only', 'autoregressive', 'zero-shot', 'large-scale'],
    buildsOn: ['gpt1'], influenced: ['gpt3'],
    summary: 'Scaled up GPT-1 to 1.5B parameters; zero-shot task transfer from large web corpus.',
    concepts: ['Zero-shot task transfer', 'WebText dataset', 'Scaling language models'],
  },
  {
    id: 'gpt3', title: 'Language Models are Few-Shot Learners (GPT-3)', year: 2020,
    topicPath: 'ai/transformers/decoder-only', depth: 2,
    authors: 'Brown, Mann, Ryder, Subbiah, et al.',
    arxiv: 'https://arxiv.org/abs/2005.14165', github: null,
    tags: ['decoder-only', 'autoregressive', 'few-shot', 'in-context-learning', 'large-scale'],
    buildsOn: ['gpt2'], influenced: ['llama'],
    summary: '175B parameters demonstrating strong few-shot and in-context learning.',
    concepts: ['In-context learning', 'Few-shot prompting', 'Scaling laws for language models'],
  },
  {
    id: 'llama', title: 'LLaMA: Open and Efficient Foundation Language Models', year: 2023,
    topicPath: 'ai/transformers/decoder-only', depth: 1,
    authors: 'Touvron, Lavril, Izacard, et al.',
    arxiv: 'https://arxiv.org/abs/2302.13971', github: 'https://github.com/meta-llama/llama',
    tags: ['decoder-only', 'autoregressive', 'open-weights', 'efficient-training'],
    buildsOn: ['gpt3'], influenced: ['mistral'],
    summary: 'Showed smaller open models trained on more tokens can match larger proprietary models.',
    concepts: ['Training-compute-optimal models', 'Open-weight release strategy', 'RMSNorm and SwiGLU activations'],
  },
  {
    id: 'mistral', title: 'Mistral 7B', year: 2023,
    topicPath: 'ai/transformers/decoder-only', depth: 1,
    authors: 'Jiang, Sablayrolles, Mensch, et al.',
    arxiv: 'https://arxiv.org/abs/2310.06825', github: 'https://github.com/mistralai/mistral-inference',
    tags: ['decoder-only', 'autoregressive', 'sliding-window-attention', 'grouped-query-attention'],
    buildsOn: ['llama'], influenced: [],
    summary: '7B model outperforming LLaMA 2 13B through grouped-query and sliding-window attention.',
    concepts: ['Sliding window attention', 'Grouped-query attention (GQA)', 'Rolling buffer KV cache'],
  },
  {
    id: 'bert', title: 'BERT: Pre-training of Deep Bidirectional Transformers', year: 2018,
    topicPath: 'ai/transformers/encoder-only', depth: 3,
    authors: 'Devlin, Chang, Lee, Toutanova',
    arxiv: 'https://arxiv.org/abs/1810.04805', github: 'https://github.com/google-research/bert',
    tags: ['encoder-only', 'masked-lm', 'bidirectional', 'pre-training', 'fine-tuning'],
    buildsOn: ['transformer'], influenced: ['roberta', 'albert', 'xlnet', 'deberta'],
    summary: 'Introduced bidirectional pre-training via masked language modeling and next-sentence prediction.',
    concepts: ['Masked language modeling (MLM)', 'Next sentence prediction (NSP)', 'Bidirectional context encoding'],
  },
  {
    id: 'xlnet', title: 'XLNet: Generalized Autoregressive Pretraining', year: 2019,
    topicPath: 'ai/transformers/encoder-only', depth: 2,
    authors: 'Yang, Dai, Yang, Carbonell, Salakhutdinov, Le',
    arxiv: 'https://arxiv.org/abs/1906.08237', github: 'https://github.com/zihangdai/xlnet',
    tags: ['encoder-only', 'permutation-lm', 'autoregressive', 'two-stream-attention'],
    buildsOn: ['bert', 'transformer-xl'], influenced: [],
    summary: 'Combined autoregressive and autoencoding via permutation language modeling.',
    concepts: ['Permutation language modeling', 'Two-stream self-attention', 'Transformer-XL recurrence integration'],
  },
  {
    id: 'roberta', title: 'RoBERTa: A Robustly Optimized BERT Pretraining Approach', year: 2019,
    topicPath: 'ai/transformers/encoder-only', depth: 2,
    authors: 'Liu, Ott, Goyal, et al.',
    arxiv: 'https://arxiv.org/abs/1907.11692', github: 'https://github.com/facebookresearch/fairseq',
    tags: ['encoder-only', 'masked-lm', 'bidirectional', 'training-optimization'],
    buildsOn: ['bert'], influenced: [],
    summary: 'Showed BERT was significantly undertrained; careful tuning matches all post-BERT methods.',
    concepts: ['Dynamic masking', 'Removal of next sentence prediction', 'Larger batch sizes and more data'],
  },
  {
    id: 'albert', title: 'ALBERT: A Lite BERT for Self-supervised Learning', year: 2019,
    topicPath: 'ai/transformers/encoder-only', depth: 2,
    authors: 'Lan, Chen, Goodman, Gimpel, Sharma, Soricut',
    arxiv: 'https://arxiv.org/abs/1909.11942', github: 'https://github.com/google-research/albert',
    tags: ['encoder-only', 'masked-lm', 'parameter-sharing', 'factorized-embedding'],
    buildsOn: ['bert'], influenced: [],
    summary: 'Reduced BERT parameter count by 89% via factorized embedding and cross-layer sharing.',
    concepts: ['Factorized embedding parameters', 'Cross-layer parameter sharing', 'Sentence-order prediction (SOP)'],
  },
  {
    id: 'deberta', title: 'DeBERTa: Decoding-enhanced BERT with Disentangled Attention', year: 2020,
    topicPath: 'ai/transformers/encoder-only', depth: 1,
    authors: 'He, Liu, Gao, Chen',
    arxiv: 'https://arxiv.org/abs/2006.03654', github: 'https://github.com/microsoft/DeBERTa',
    tags: ['encoder-only', 'masked-lm', 'disentangled-attention', 'enhanced-mask-decoder'],
    buildsOn: ['bert'], influenced: [],
    summary: 'Improved BERT with disentangled attention for content and position. First to surpass human on SuperGLUE.',
    concepts: ['Disentangled attention (content + position)', 'Enhanced mask decoder', 'Virtual adversarial training'],
  },
  {
    id: 't5', title: 'T5: Exploring the Limits of Transfer Learning', year: 2019,
    topicPath: 'ai/transformers/encoder-decoder', depth: 2,
    authors: 'Raffel, Shazeer, Roberts, Lee, et al.',
    arxiv: 'https://arxiv.org/abs/1910.10683', github: 'https://github.com/google-research/text-to-text-transfer-transformer',
    tags: ['encoder-decoder', 'text-to-text', 'transfer-learning', 'span-corruption'],
    buildsOn: ['transformer'], influenced: [],
    summary: 'Unified all NLP tasks into text-to-text framework with systematic study of transfer learning.',
    concepts: ['Text-to-text framework', 'Span corruption pre-training', 'Colossal Clean Crawled Corpus (C4)'],
  },
  {
    id: 'vit', title: 'ViT: An Image is Worth 16x16 Words', year: 2020,
    topicPath: 'ai/transformers/vision', depth: 2,
    authors: 'Dosovitskiy, Beyer, Kolesnikov, et al.',
    arxiv: 'https://arxiv.org/abs/2010.11929', github: 'https://github.com/google-research/vision_transformer',
    tags: ['vision-transformer', 'image-patches', 'classification', 'transfer-learning'],
    buildsOn: ['transformer'], influenced: ['clip'],
    summary: 'Applied a pure transformer to image patches for classification, matching CNNs with enough data.',
    concepts: ['Image patch tokenization (16x16)', 'Class token for classification', 'Large-scale pre-training on JFT-300M'],
  },
  {
    id: 'clip', title: 'CLIP: Learning Transferable Visual Models From Natural Language Supervision', year: 2021,
    topicPath: 'ai/transformers/vision', depth: 1,
    authors: 'Radford, Kim, Hallacy, et al.',
    arxiv: 'https://arxiv.org/abs/2103.00020', github: 'https://github.com/openai/CLIP',
    tags: ['vision-transformer', 'contrastive-learning', 'zero-shot', 'multimodal'],
    buildsOn: ['vit'], influenced: ['stable-diffusion'],
    summary: 'Joint vision-text training on 400M pairs via contrastive learning. Zero-shot image classification.',
    concepts: ['Contrastive image-text pre-training', 'Zero-shot visual classification', 'Natural language as supervision signal'],
  },
  {
    id: 'stable-diffusion', title: 'Stable Diffusion: High-Resolution Image Synthesis with Latent Diffusion', year: 2022,
    topicPath: 'ai/transformers/diffusion', depth: 1,
    authors: 'Rombach, Blattmann, Lorenz, Esser, Ommer',
    arxiv: 'https://arxiv.org/abs/2112.10752', github: 'https://github.com/CompVis/stable-diffusion',
    tags: ['diffusion', 'latent-space', 'text-to-image', 'cross-attention'],
    buildsOn: ['clip'], influenced: [],
    summary: 'Moved diffusion to latent space, dramatically reducing compute. CLIP text embeddings for conditioning.',
    concepts: ['Latent diffusion in compressed space', 'Cross-attention conditioning with CLIP', 'Perceptual compression via autoencoder'],
  },
  {
    id: 'mamba', title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces', year: 2023,
    topicPath: 'ai/state-space-models', depth: 1,
    authors: 'Gu, Dao',
    arxiv: 'https://arxiv.org/abs/2312.00752', github: 'https://github.com/state-spaces/mamba',
    tags: ['state-space', 'selective-ssm', 'linear-time', 'hardware-aware'],
    buildsOn: [], influenced: [],
    summary: 'Selective state-space model achieving linear-time sequence modeling matching Transformer quality.',
    concepts: ['Selective state-space mechanism', 'Input-dependent parameterization', 'Hardware-aware parallel scan'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildContent(paper: PaperEntry): string {
  const lines: string[] = [];
  lines.push(`# ${paper.title} (${paper.year})`);
  lines.push('', '## Authors', paper.authors, '');
  lines.push('## Paper', paper.arxiv ?? 'N/A', '');
  lines.push('## Code', paper.github ?? 'N/A', '');
  lines.push('## Key Concepts');
  for (const c of paper.concepts) lines.push(`- ${c}`);
  lines.push('');
  if (paper.buildsOn.length > 0) {
    lines.push('## Builds On');
    for (const parentId of paper.buildsOn) {
      const parent = PAPERS.find((p) => p.id === parentId);
      lines.push(`- ${parent ? parent.title : parentId}`);
    }
    lines.push('');
  }
  if (paper.influenced.length > 0) {
    lines.push('## Influenced');
    for (const childId of paper.influenced) {
      const child = PAPERS.find((p) => p.id === childId);
      lines.push(`- ${child ? child.title : childId}`);
    }
    lines.push('');
  }
  lines.push('## Summary', paper.summary);
  return lines.join('\n');
}

function buildTags(paper: PaperEntry): string {
  const all = [...paper.tags];
  for (const parentId of paper.buildsOn) {
    all.push(`builds-on:${parentId}`);
  }
  return all.join(',');
}

// ---------------------------------------------------------------------------
// Benchmark harness
// ---------------------------------------------------------------------------

interface BenchResult {
  min: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
}

async function bench(
  name: string,
  fn: () => Promise<any>,
  iterations: number = 10
): Promise<BenchResult> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    min: times[0],
    median: times[Math.floor(times.length / 2)],
    p95: times[Math.floor(times.length * 0.95)],
    max: times[times.length - 1],
    mean: times.reduce((a, b) => a + b, 0) / times.length,
  };
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1) return `${ms.toFixed(1)}ms`;
  return `${(ms * 1000).toFixed(0)}us`;
}

// ---------------------------------------------------------------------------
// Population functions
// ---------------------------------------------------------------------------

async function populateBlockchain(ain: InstanceType<typeof Ain>): Promise<number> {
  const start = performance.now();
  const address = ain.signer.getAddress();

  console.log('  Setting up app...');
  const setupResult = await ain.knowledge.setupApp();
  if (!txOk(setupResult)) {
    console.log('    setupApp failed:', JSON.stringify(setupResult?.result));
  }
  await sleep(BLOCK_TIME);

  console.log('  Registering topics...');
  for (const t of TOPICS) {
    const result = await ain.knowledge.registerTopic(t.path, { title: t.title, description: t.description });
    if (!txOk(result)) console.log(`    FAIL: ${t.path}`);
    await sleep(BLOCK_TIME);
  }

  console.log('  Writing explorations...');
  for (const p of PAPERS) {
    const result = await ain.knowledge.explore({
      topicPath: p.topicPath,
      title: p.title,
      content: buildContent(p),
      summary: p.summary,
      depth: p.depth,
      tags: buildTags(p),
    });
    if (!txOk(result)) console.log(`    FAIL: ${p.title}`);
    await sleep(BLOCK_TIME);
  }

  return performance.now() - start;
}

async function populateGraphBackend(
  kg: KnowledgeGraph,
  label: string
): Promise<number> {
  const start = performance.now();

  console.log(`  [${label}] Registering topics...`);
  for (const t of TOPICS) {
    await kg.registerTopic(t.path, { title: t.title, description: t.description });
  }

  console.log(`  [${label}] Writing explorations...`);
  for (const p of PAPERS) {
    await kg.explore({
      topicPath: p.topicPath,
      title: p.title,
      content: buildContent(p),
      summary: p.summary,
      depth: p.depth,
      tags: buildTags(p),
    });
  }

  return performance.now() - start;
}

// ---------------------------------------------------------------------------
// Result table rendering
// ---------------------------------------------------------------------------

interface RowData {
  operation: string;
  blockchain: string;
  memory: string;
  neo4j: string;
}

function printTable(rows: RowData[]) {
  const colWidths = { op: 35, bc: 16, mem: 16, neo: 16 };

  const hr = `${'═'.repeat(colWidths.op + 2)}${'═'.repeat(colWidths.bc + 2)}${'═'.repeat(colWidths.mem + 2)}${'═'.repeat(colWidths.neo + 2)}`;
  const sep = `${'─'.repeat(colWidths.op + 2)}${'─'.repeat(colWidths.bc + 2)}${'─'.repeat(colWidths.mem + 2)}${'─'.repeat(colWidths.neo + 2)}`;

  console.log(`╔${hr}╗`);
  console.log(
    `║ ${'Operation'.padEnd(colWidths.op)} ║ ${'Blockchain'.padEnd(colWidths.bc)} ║ ${'In-Memory'.padEnd(colWidths.mem)} ║ ${'Neo4j'.padEnd(colWidths.neo)} ║`
  );
  console.log(`╠${sep}╣`);

  for (const row of rows) {
    console.log(
      `║ ${row.operation.padEnd(colWidths.op)} ║ ${row.blockchain.padStart(colWidths.bc)} ║ ${row.memory.padStart(colWidths.mem)} ║ ${row.neo4j.padStart(colWidths.neo)} ║`
    );
  }

  console.log(`╚${hr}╝`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Knowledge Graph Backend Benchmark                   ║');
  console.log('║  Blockchain vs In-Memory vs Neo4j — 17-paper graph         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // --- Setup ---
  const DUMMY_ADDRESS = '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF';
  const rows: RowData[] = [];

  // Check which backends are available
  let blockchainAvailable = false;
  let neo4jAvailable = false;
  let ain: InstanceType<typeof Ain> | null = null;

  // Try blockchain (with 3s timeout to avoid hanging)
  try {
    ain = new Ain(PROVIDER_URL);
    ain.wallet.addAndSetDefaultAccount(
      'b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96'
    );
    const bcCheck = ain.provider.send('ain_getAddress', { protoVer: '1.1.3' });
    const bcTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([bcCheck, bcTimeout]);
    blockchainAvailable = true;
    console.log('  [+] Blockchain: connected at ' + PROVIDER_URL);
  } catch {
    console.log('  [-] Blockchain: not available (skipping)');
    ain = null;
  }

  // Try Neo4j (with 5s timeout)
  let neo4jBackend: Neo4jBackend | null = null;
  try {
    neo4jBackend = new Neo4jBackend({ uri: NEO4J_URI, username: NEO4J_USER, password: NEO4J_PASS });
    const neoInit = neo4jBackend.initialize().then(() => neo4jBackend!.clearAll());
    const neoTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    await Promise.race([neoInit, neoTimeout]);
    neo4jAvailable = true;
    console.log('  [+] Neo4j: connected at ' + NEO4J_URI);
  } catch (e: any) {
    console.log('  [-] Neo4j: not available (' + (e.message || e) + ') — skipping');
    if (neo4jBackend) { try { await neo4jBackend.close(); } catch {} }
    neo4jBackend = null;
  }

  // Memory backend always available
  const memBackend = new MemoryBackend();
  await memBackend.initialize();
  console.log('  [+] In-Memory: ready\n');

  const memKg = new KnowledgeGraph(memBackend, DUMMY_ADDRESS);
  const neo4jKg = neo4jAvailable && neo4jBackend ? new KnowledgeGraph(neo4jBackend, DUMMY_ADDRESS) : null;

  // =========================================================================
  // Phase 1: Write benchmark — populate all backends
  // =========================================================================
  console.log('━━━ Phase 1: Population ━━━\n');

  let bcPopTime = 'N/A';
  if (blockchainAvailable && ain) {
    console.log('  Populating blockchain (this will take ~4.5 minutes)...');
    const t = await populateBlockchain(ain);
    bcPopTime = fmtMs(t);
    console.log(`  Blockchain population: ${bcPopTime}\n`);
  }

  const memPopStart = performance.now();
  await populateGraphBackend(memKg, 'Memory');
  const memPopTime = performance.now() - memPopStart;
  console.log(`  In-Memory population: ${fmtMs(memPopTime)}\n`);

  let neo4jPopTime = 'N/A';
  if (neo4jKg) {
    const neo4jPopStart = performance.now();
    await populateGraphBackend(neo4jKg, 'Neo4j');
    const t = performance.now() - neo4jPopStart;
    neo4jPopTime = fmtMs(t);
    console.log(`  Neo4j population: ${neo4jPopTime}\n`);
  }

  rows.push({
    operation: 'Populate (26 writes)',
    blockchain: bcPopTime,
    memory: fmtMs(memPopTime),
    neo4j: neo4jPopTime,
  });

  // =========================================================================
  // Phase 2: Read benchmark
  // =========================================================================
  console.log('━━━ Phase 2: Read Benchmark (10 iterations) ━━━\n');

  // listTopics
  const memListTopics = await bench('listTopics [mem]', () => memKg.listTopics());
  let bcListTopics: BenchResult | null = null;
  let neoListTopics: BenchResult | null = null;
  if (ain) bcListTopics = await bench('listTopics [bc]', () => ain!.knowledge.listTopics());
  if (neo4jKg) neoListTopics = await bench('listTopics [neo4j]', () => neo4jKg!.listTopics());

  rows.push({
    operation: 'listTopics()',
    blockchain: bcListTopics ? fmtMs(bcListTopics.median) : 'N/A',
    memory: fmtMs(memListTopics.median),
    neo4j: neoListTopics ? fmtMs(neoListTopics.median) : 'N/A',
  });

  // getTopicStats
  const statsTopic = 'ai/transformers/decoder-only';
  const memStats = await bench('getTopicStats [mem]', () => memKg.getTopicStats(statsTopic));
  let bcStats: BenchResult | null = null;
  let neoStats: BenchResult | null = null;
  if (ain) bcStats = await bench('getTopicStats [bc]', () => ain!.knowledge.getTopicStats(statsTopic));
  if (neo4jKg) neoStats = await bench('getTopicStats [neo4j]', () => neo4jKg!.getTopicStats(statsTopic));

  rows.push({
    operation: `getTopicStats('decoder-only')`,
    blockchain: bcStats ? fmtMs(bcStats.median) : 'N/A',
    memory: fmtMs(memStats.median),
    neo4j: neoStats ? fmtMs(neoStats.median) : 'N/A',
  });

  // getFrontierMap
  const frontierParent = 'ai/transformers';
  const memFrontier = await bench('getFrontierMap [mem]', () => memKg.getFrontierMap(frontierParent));
  let bcFrontier: BenchResult | null = null;
  let neoFrontier: BenchResult | null = null;
  if (ain) bcFrontier = await bench('getFrontierMap [bc]', () => ain!.knowledge.getFrontierMap(frontierParent));
  if (neo4jKg) neoFrontier = await bench('getFrontierMap [neo4j]', () => neo4jKg!.getFrontierMap(frontierParent));

  rows.push({
    operation: `getFrontierMap('ai/transformers')`,
    blockchain: bcFrontier ? fmtMs(bcFrontier.median) : 'N/A',
    memory: fmtMs(memFrontier.median),
    neo4j: neoFrontier ? fmtMs(neoFrontier.median) : 'N/A',
  });

  // =========================================================================
  // Phase 3: Graph traversal benchmark
  // =========================================================================
  console.log('━━━ Phase 3: Graph Traversal Benchmark ━━━\n');

  // For graph backends we use the exploration ID of "transformer" paper
  // We need to find it by searching explorations
  const memExplorations = await memKg.getExplorationsByUser(DUMMY_ADDRESS);
  let transformerExpId: string | null = null;
  let mistralExpId: string | null = null;

  if (memExplorations) {
    for (const topicKey of Object.keys(memExplorations)) {
      for (const [entryId, exp] of Object.entries(memExplorations[topicKey])) {
        if (exp.title.includes('Attention Is All You Need')) transformerExpId = entryId;
        if (exp.title.includes('Mistral 7B')) mistralExpId = entryId;
      }
    }
  }

  if (transformerExpId) {
    // Lineage: get ancestors of Mistral back to Transformer
    if (mistralExpId) {
      const memLineage = await bench('lineage [mem]', () => memKg.getLineage(mistralExpId!));
      let neoLineage: BenchResult | null = null;
      if (neo4jKg) neoLineage = await bench('lineage [neo4j]', () => neo4jKg!.getLineage(mistralExpId!));

      rows.push({
        operation: 'Lineage: Mistral ancestors',
        blockchain: 'N/A (manual)',
        memory: fmtMs(memLineage.median),
        neo4j: neoLineage ? fmtMs(neoLineage.median) : 'N/A',
      });

      // Shortest path
      const memPath = await bench('shortestPath [mem]', () =>
        memKg.getShortestPath(transformerExpId!, mistralExpId!)
      );
      let neoPath: BenchResult | null = null;
      if (neo4jKg) {
        neoPath = await bench('shortestPath [neo4j]', () =>
          neo4jKg!.getShortestPath(transformerExpId!, mistralExpId!)
        );
      }

      rows.push({
        operation: 'ShortestPath: Transformer→Mistral',
        blockchain: 'N/A',
        memory: fmtMs(memPath.median),
        neo4j: neoPath ? fmtMs(neoPath.median) : 'N/A',
      });
    }

    // Descendants of Transformer
    const memDesc = await bench('descendants [mem]', () => memKg.getDescendants(transformerExpId!));
    let neoDesc: BenchResult | null = null;
    if (neo4jKg) {
      neoDesc = await bench('descendants [neo4j]', () => neo4jKg!.getDescendants(transformerExpId!));
    }

    rows.push({
      operation: 'Descendants of Transformer',
      blockchain: 'N/A',
      memory: fmtMs(memDesc.median),
      neo4j: neoDesc ? fmtMs(neoDesc.median) : 'N/A',
    });
  }

  // =========================================================================
  // Phase 4: Ledger benchmark
  // =========================================================================
  console.log('━━━ Phase 4: Ledger Operations Benchmark ━━━\n');

  const memSnapshot = await bench('takeSnapshot [mem]', () => memKg.takeSnapshot(), 5);
  let neoSnapshot: BenchResult | null = null;
  if (neo4jKg) neoSnapshot = await bench('takeSnapshot [neo4j]', () => neo4jKg!.takeSnapshot(), 5);

  rows.push({
    operation: 'takeSnapshot()',
    blockchain: 'N/A',
    memory: fmtMs(memSnapshot.median),
    neo4j: neoSnapshot ? fmtMs(neoSnapshot.median) : 'N/A',
  });

  const memIntegrity = await bench('verifyIntegrity [mem]', () => memKg.verifyIntegrity(), 5);
  let neoIntegrity: BenchResult | null = null;
  if (neo4jKg) neoIntegrity = await bench('verifyIntegrity [neo4j]', () => neo4jKg!.verifyIntegrity(), 5);

  rows.push({
    operation: 'verifyIntegrity()',
    blockchain: 'N/A',
    memory: fmtMs(memIntegrity.median),
    neo4j: neoIntegrity ? fmtMs(neoIntegrity.median) : 'N/A',
  });

  // =========================================================================
  // Phase 5: Results
  // =========================================================================
  console.log('\n━━━ Phase 5: Results ━━━\n');
  printTable(rows);

  // --- Correctness checks ---
  console.log('\n━━━ Correctness Checks ━━━\n');

  // Compare listTopics
  const memTopics = await memKg.listTopics();
  console.log(`  listTopics() — Memory: ${memTopics.length} topics`);
  if (neo4jKg) {
    const neoTopics = await neo4jKg.listTopics();
    const topicsMatch = JSON.stringify(memTopics.sort()) === JSON.stringify(neoTopics.sort());
    console.log(`  listTopics() — Neo4j: ${neoTopics.length} topics — Match: ${topicsMatch ? '✓' : '✗'}`);
  }

  // Compare getTopicStats
  const memStatsResult = await memKg.getTopicStats(statsTopic);
  console.log(`  getTopicStats('decoder-only') — Memory: explorers=${memStatsResult.explorer_count}, max_depth=${memStatsResult.max_depth}, avg_depth=${memStatsResult.avg_depth}`);
  if (neo4jKg) {
    const neoStatsResult = await neo4jKg.getTopicStats(statsTopic);
    const statsMatch =
      memStatsResult.explorer_count === neoStatsResult.explorer_count &&
      memStatsResult.max_depth === neoStatsResult.max_depth &&
      memStatsResult.avg_depth === neoStatsResult.avg_depth;
    console.log(`  getTopicStats('decoder-only') — Neo4j: explorers=${neoStatsResult.explorer_count}, max_depth=${neoStatsResult.max_depth}, avg_depth=${neoStatsResult.avg_depth} — Match: ${statsMatch ? '✓' : '✗'}`);
  }

  // TxLog count
  const memTxLog = await memKg.getTxLog();
  console.log(`  TxLog entries — Memory: ${memTxLog.length} (expected: 26)`);
  if (neo4jKg) {
    const neoTxLog = await neo4jKg.getTxLog();
    console.log(`  TxLog entries — Neo4j: ${neoTxLog.length} (expected: 26)`);
  }

  // Integrity
  const memIntegrityResult = await memKg.verifyIntegrity();
  console.log(`  Integrity — Memory: ${memIntegrityResult.valid}/${memIntegrityResult.total} valid, ${memIntegrityResult.invalid.length} invalid`);
  if (neo4jKg) {
    const neoIntegrityResult = await neo4jKg.verifyIntegrity();
    console.log(`  Integrity — Neo4j: ${neoIntegrityResult.valid}/${neoIntegrityResult.total} valid, ${neoIntegrityResult.invalid.length} invalid`);
  }

  // Snapshot
  const memSnapshotResult = await memKg.takeSnapshot();
  console.log(`  Snapshot — Memory: ${memSnapshotResult.node_count} nodes, ${memSnapshotResult.rel_count} edges, ${memSnapshotResult.tx_count} txs`);
  if (neo4jKg) {
    const neoSnapshotResult = await neo4jKg.takeSnapshot();
    console.log(`  Snapshot — Neo4j: ${neoSnapshotResult.node_count} nodes, ${neoSnapshotResult.rel_count} edges, ${neoSnapshotResult.tx_count} txs`);
  }

  // Append-only verification
  console.log('\n━━━ Append-Only Verification ━━━\n');
  const beforeCount = await memBackend.nodeCount('Exploration');
  await memKg.explore({
    topicPath: 'ai/transformers/attention',
    title: 'Attention Is All You Need (duplicate)',
    content: 'Duplicate exploration to verify append-only.',
    summary: 'Duplicate',
    depth: 1,
    tags: 'test',
  });
  const afterCount = await memBackend.nodeCount('Exploration');
  console.log(`  Exploration nodes before: ${beforeCount}, after: ${afterCount} — Append-only: ${afterCount === beforeCount + 1 ? '✓' : '✗'}`);

  // --- Cleanup ---
  await memBackend.close();
  if (neo4jBackend) await neo4jBackend.close();

  console.log('\n━━━ Done! ━━━\n');
}

main().catch(console.error);
