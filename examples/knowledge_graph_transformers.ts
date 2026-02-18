/**
 * Transformer Knowledge Graph from Paper-Code Pairs
 *
 * Populates a knowledge graph of 17 landmark papers from "Attention Is All You
 * Need" (2017) through Mamba (2023), organized into 9 topics that mirror how
 * the transformer family tree actually evolved.  After writing everything
 * on-chain it reconstructs the lineage DAG from tags and prints an ASCII tree.
 *
 * Run:
 *   npx ts-node examples/knowledge_graph_transformers.ts
 *
 * Requires a local AIN blockchain node on port 8081.
 * Total runtime: ~4.5 minutes (26 on-chain writes × 10 s block time).
 */
import Ain from '../src/ain';
import { ExplorationDepth } from '../src/knowledge/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROVIDER_URL = 'http://localhost:8081';
const BLOCK_TIME = 10_000; // ms to wait for block finalization

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if a transaction result indicates success. */
function txOk(result: any): boolean {
  if (!result) return false;
  const r = result.result;
  if (r === true) return true;
  if (r?.code === 0) return true;
  // Multi-op transactions have result_list
  if (r?.result_list) {
    return Object.values(r.result_list).every((op: any) => op.code === 0);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Section 1 — Data
// ---------------------------------------------------------------------------

/** A single topic to register on-chain. */
interface TopicEntry {
  path: string;
  title: string;
  description: string;
}

/** A paper/code pair to write as an exploration. */
interface PaperEntry {
  id: string;               // short id used in builds-on tags
  title: string;
  year: number;
  topicPath: string;
  depth: ExplorationDepth;
  authors: string;
  arxiv: string | null;
  github: string | null;
  tags: string[];            // architecture + concept tags (no builds-on)
  buildsOn: string[];        // ids of parent papers
  influenced: string[];      // ids of child papers
  summary: string;
  concepts: string[];
}

// ---- 9 Topics (parent-first order) ----------------------------------------

const TOPICS: TopicEntry[] = [
  {
    path: 'ai',
    title: 'Artificial Intelligence',
    description: 'Research and applications of artificial intelligence.',
  },
  {
    path: 'ai/transformers',
    title: 'Transformers',
    description: 'The transformer architecture family and its descendants.',
  },
  {
    path: 'ai/transformers/attention',
    title: 'Attention Mechanisms',
    description: 'Core self-attention mechanism introduced in the original Transformer.',
  },
  {
    path: 'ai/transformers/encoder-only',
    title: 'Encoder-Only Models',
    description: 'Masked-language-model architectures: BERT, RoBERTa, ALBERT, XLNet, DeBERTa.',
  },
  {
    path: 'ai/transformers/decoder-only',
    title: 'Decoder-Only Models',
    description: 'Autoregressive language models: GPT family, Transformer-XL, LLaMA, Mistral.',
  },
  {
    path: 'ai/transformers/encoder-decoder',
    title: 'Encoder-Decoder Models',
    description: 'Sequence-to-sequence transformer models such as T5.',
  },
  {
    path: 'ai/transformers/vision',
    title: 'Vision Transformers',
    description: 'Transformer architectures applied to computer vision tasks.',
  },
  {
    path: 'ai/transformers/diffusion',
    title: 'Diffusion Models',
    description: 'Latent diffusion and stable diffusion models for image generation.',
  },
  {
    path: 'ai/state-space-models',
    title: 'State-Space Models',
    description: 'Structured state-space sequence models as alternatives to attention.',
  },
];

// ---- 17 Papers -------------------------------------------------------------

const PAPERS: PaperEntry[] = [
  // --- Attention ---
  {
    id: 'transformer',
    title: 'Attention Is All You Need',
    year: 2017,
    topicPath: 'ai/transformers/attention',
    depth: 3,
    authors: 'Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin',
    arxiv: 'https://arxiv.org/abs/1706.03762',
    github: 'https://github.com/tensorflow/tensor2tensor',
    tags: ['self-attention', 'encoder-decoder', 'positional-encoding', 'multi-head-attention'],
    buildsOn: [],
    influenced: ['gpt1', 'bert', 'transformer-xl', 't5', 'vit'],
    summary: 'Introduced the Transformer architecture, replacing recurrence and convolutions entirely with self-attention mechanisms. Achieved state-of-the-art results on machine translation while being significantly more parallelizable.',
    concepts: [
      'Scaled dot-product attention',
      'Multi-head attention',
      'Positional encoding',
      'Encoder-decoder architecture without recurrence',
    ],
  },

  // --- Decoder-Only ---
  {
    id: 'gpt1',
    title: 'Improving Language Understanding by Generative Pre-Training (GPT-1)',
    year: 2018,
    topicPath: 'ai/transformers/decoder-only',
    depth: 3,
    authors: 'Radford, Narasimhan, Salimans, Sutskever',
    arxiv: null,
    github: 'https://github.com/openai/finetune-transformer-lm',
    tags: ['decoder-only', 'autoregressive', 'pre-training', 'fine-tuning'],
    buildsOn: ['transformer'],
    influenced: ['gpt2'],
    summary: 'Demonstrated that generative pre-training of a language model on diverse text, followed by discriminative fine-tuning, yields large gains on a range of NLP benchmarks.',
    concepts: [
      'Generative pre-training + discriminative fine-tuning',
      'Decoder-only transformer for language modeling',
      'Transfer learning for NLP',
    ],
  },
  {
    id: 'transformer-xl',
    title: 'Transformer-XL: Attentive Language Models Beyond a Fixed-Length Context',
    year: 2019,
    topicPath: 'ai/transformers/decoder-only',
    depth: 2,
    authors: 'Dai, Yang, Yang, Carbonell, Le, Salakhutdinov',
    arxiv: 'https://arxiv.org/abs/1901.02860',
    github: 'https://github.com/kimiyoung/transformer-xl',
    tags: ['decoder-only', 'autoregressive', 'segment-recurrence', 'relative-positional-encoding'],
    buildsOn: ['transformer'],
    influenced: ['xlnet'],
    summary: 'Extended the Transformer with a segment-level recurrence mechanism and relative positional encodings, enabling learning dependencies beyond a fixed-length context without disrupting temporal coherence.',
    concepts: [
      'Segment-level recurrence mechanism',
      'Relative positional encodings',
      'Longer-term dependency modeling',
    ],
  },
  {
    id: 'gpt2',
    title: 'Language Models are Unsupervised Multitask Learners (GPT-2)',
    year: 2019,
    topicPath: 'ai/transformers/decoder-only',
    depth: 2,
    authors: 'Radford, Wu, Child, Luan, Amodei, Sutskever',
    arxiv: null,
    github: 'https://github.com/openai/gpt-2',
    tags: ['decoder-only', 'autoregressive', 'zero-shot', 'large-scale'],
    buildsOn: ['gpt1'],
    influenced: ['gpt3'],
    summary: 'Scaled up GPT-1 to 1.5B parameters and showed that language models can perform downstream tasks in a zero-shot setting without explicit fine-tuning, simply by training on a large and diverse web corpus.',
    concepts: [
      'Zero-shot task transfer',
      'WebText dataset',
      'Scaling language models',
    ],
  },
  {
    id: 'gpt3',
    title: 'Language Models are Few-Shot Learners (GPT-3)',
    year: 2020,
    topicPath: 'ai/transformers/decoder-only',
    depth: 2,
    authors: 'Brown, Mann, Ryder, Subbiah, Kaplan, Dhariwal, Neelakantan, Shyam, Sastry, Askell, et al.',
    arxiv: 'https://arxiv.org/abs/2005.14165',
    github: null,
    tags: ['decoder-only', 'autoregressive', 'few-shot', 'in-context-learning', 'large-scale'],
    buildsOn: ['gpt2'],
    influenced: ['llama'],
    summary: 'Scaled to 175B parameters and demonstrated that very large language models exhibit strong few-shot and in-context learning abilities, achieving competitive results on many NLP benchmarks without gradient updates.',
    concepts: [
      'In-context learning',
      'Few-shot prompting',
      'Scaling laws for language models',
    ],
  },
  {
    id: 'llama',
    title: 'LLaMA: Open and Efficient Foundation Language Models',
    year: 2023,
    topicPath: 'ai/transformers/decoder-only',
    depth: 1,
    authors: 'Touvron, Lavril, Izacard, Martinet, Lachaux, Lacroix, Roziere, Goyal, Hambro, Azhar, et al.',
    arxiv: 'https://arxiv.org/abs/2302.13971',
    github: 'https://github.com/meta-llama/llama',
    tags: ['decoder-only', 'autoregressive', 'open-weights', 'efficient-training'],
    buildsOn: ['gpt3'],
    influenced: ['mistral'],
    summary: 'Showed that smaller, openly released models trained on more tokens can match or exceed the performance of much larger proprietary models, catalyzing the open-source LLM ecosystem.',
    concepts: [
      'Training-compute-optimal models',
      'Open-weight release strategy',
      'RMSNorm and SwiGLU activations',
    ],
  },
  {
    id: 'mistral',
    title: 'Mistral 7B',
    year: 2023,
    topicPath: 'ai/transformers/decoder-only',
    depth: 1,
    authors: 'Jiang, Sablayrolles, Mensch, Bamford, Chaplot, Casas, Bressand, Lengyel, Lample, et al.',
    arxiv: 'https://arxiv.org/abs/2310.06825',
    github: 'https://github.com/mistralai/mistral-inference',
    tags: ['decoder-only', 'autoregressive', 'sliding-window-attention', 'grouped-query-attention'],
    buildsOn: ['llama'],
    influenced: [],
    summary: 'A 7B-parameter model that outperforms LLaMA 2 13B on all benchmarks through grouped-query attention and sliding-window attention, advancing the efficiency frontier for open models.',
    concepts: [
      'Sliding window attention',
      'Grouped-query attention (GQA)',
      'Rolling buffer KV cache',
    ],
  },

  // --- Encoder-Only ---
  {
    id: 'bert',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    year: 2018,
    topicPath: 'ai/transformers/encoder-only',
    depth: 3,
    authors: 'Devlin, Chang, Lee, Toutanova',
    arxiv: 'https://arxiv.org/abs/1810.04805',
    github: 'https://github.com/google-research/bert',
    tags: ['encoder-only', 'masked-lm', 'bidirectional', 'pre-training', 'fine-tuning'],
    buildsOn: ['transformer'],
    influenced: ['roberta', 'albert', 'xlnet', 'deberta'],
    summary: 'Introduced bidirectional pre-training for language representations using masked language modeling and next-sentence prediction. Achieved new state-of-the-art on 11 NLP tasks.',
    concepts: [
      'Masked language modeling (MLM)',
      'Next sentence prediction (NSP)',
      'Bidirectional context encoding',
    ],
  },
  {
    id: 'xlnet',
    title: 'XLNet: Generalized Autoregressive Pretraining for Language Understanding',
    year: 2019,
    topicPath: 'ai/transformers/encoder-only',
    depth: 2,
    authors: 'Yang, Dai, Yang, Carbonell, Salakhutdinov, Le',
    arxiv: 'https://arxiv.org/abs/1906.08237',
    github: 'https://github.com/zihangdai/xlnet',
    tags: ['encoder-only', 'permutation-lm', 'autoregressive', 'two-stream-attention'],
    buildsOn: ['bert', 'transformer-xl'],
    influenced: [],
    summary: 'Combined the best of autoregressive and autoencoding approaches via permutation language modeling, overcoming BERT\'s independence assumption for masked tokens while leveraging Transformer-XL\'s recurrence.',
    concepts: [
      'Permutation language modeling',
      'Two-stream self-attention',
      'Integration of Transformer-XL recurrence',
    ],
  },
  {
    id: 'roberta',
    title: 'RoBERTa: A Robustly Optimized BERT Pretraining Approach',
    year: 2019,
    topicPath: 'ai/transformers/encoder-only',
    depth: 2,
    authors: 'Liu, Ott, Goyal, Du, Joshi, Chen, Levy, Lewis, Zettlemoyer, Stoyanov',
    arxiv: 'https://arxiv.org/abs/1907.11692',
    github: 'https://github.com/facebookresearch/fairseq',
    tags: ['encoder-only', 'masked-lm', 'bidirectional', 'training-optimization'],
    buildsOn: ['bert'],
    influenced: [],
    summary: 'Demonstrated that BERT was significantly undertrained and that careful tuning of hyperparameters, training data size, and training duration can match or exceed all post-BERT methods.',
    concepts: [
      'Dynamic masking',
      'Removal of next sentence prediction',
      'Larger batch sizes and more data',
    ],
  },
  {
    id: 'albert',
    title: 'ALBERT: A Lite BERT for Self-supervised Learning of Language Representations',
    year: 2019,
    topicPath: 'ai/transformers/encoder-only',
    depth: 2,
    authors: 'Lan, Chen, Goodman, Gimpel, Sharma, Soricut',
    arxiv: 'https://arxiv.org/abs/1909.11942',
    github: 'https://github.com/google-research/albert',
    tags: ['encoder-only', 'masked-lm', 'parameter-sharing', 'factorized-embedding'],
    buildsOn: ['bert'],
    influenced: [],
    summary: 'Reduced BERT\'s parameter count by 89% through factorized embedding parameterization and cross-layer parameter sharing, while maintaining competitive performance.',
    concepts: [
      'Factorized embedding parameters',
      'Cross-layer parameter sharing',
      'Sentence-order prediction (SOP)',
    ],
  },
  {
    id: 'deberta',
    title: 'DeBERTa: Decoding-enhanced BERT with Disentangled Attention',
    year: 2020,
    topicPath: 'ai/transformers/encoder-only',
    depth: 1,
    authors: 'He, Liu, Gao, Chen',
    arxiv: 'https://arxiv.org/abs/2006.03654',
    github: 'https://github.com/microsoft/DeBERTa',
    tags: ['encoder-only', 'masked-lm', 'disentangled-attention', 'enhanced-mask-decoder'],
    buildsOn: ['bert'],
    influenced: [],
    summary: 'Improved BERT with disentangled attention that separately encodes content and position, plus an enhanced mask decoder for pre-training. First model to surpass human performance on the SuperGLUE benchmark.',
    concepts: [
      'Disentangled attention (content + position)',
      'Enhanced mask decoder',
      'Virtual adversarial training',
    ],
  },

  // --- Encoder-Decoder ---
  {
    id: 't5',
    title: 'Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer (T5)',
    year: 2019,
    topicPath: 'ai/transformers/encoder-decoder',
    depth: 2,
    authors: 'Raffel, Shazeer, Roberts, Lee, Narang, Matena, Zhou, Li, Liu',
    arxiv: 'https://arxiv.org/abs/1910.10683',
    github: 'https://github.com/google-research/text-to-text-transfer-transformer',
    tags: ['encoder-decoder', 'text-to-text', 'transfer-learning', 'span-corruption'],
    buildsOn: ['transformer'],
    influenced: [],
    summary: 'Unified all NLP tasks into a text-to-text framework and performed a systematic study of transfer learning approaches, pre-training objectives, architectures, and data, resulting in the T5 model family.',
    concepts: [
      'Text-to-text framework for all NLP tasks',
      'Span corruption pre-training objective',
      'Colossal Clean Crawled Corpus (C4)',
    ],
  },

  // --- Vision ---
  {
    id: 'vit',
    title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale (ViT)',
    year: 2020,
    topicPath: 'ai/transformers/vision',
    depth: 2,
    authors: 'Dosovitskiy, Beyer, Kolesnikov, Weissenborn, Zhai, Unterthiner, Dehghani, Minderer, Heigold, Gelly, Uszkoreit, Houlsby',
    arxiv: 'https://arxiv.org/abs/2010.11929',
    github: 'https://github.com/google-research/vision_transformer',
    tags: ['vision-transformer', 'image-patches', 'classification', 'transfer-learning'],
    buildsOn: ['transformer'],
    influenced: ['clip'],
    summary: 'Applied a pure transformer directly to sequences of image patches for image classification, showing that with sufficient pre-training data, transformers can match or exceed state-of-the-art CNNs.',
    concepts: [
      'Image patch tokenization (16x16)',
      'Class token for classification',
      'Large-scale pre-training on JFT-300M',
    ],
  },
  {
    id: 'clip',
    title: 'Learning Transferable Visual Models From Natural Language Supervision (CLIP)',
    year: 2021,
    topicPath: 'ai/transformers/vision',
    depth: 1,
    authors: 'Radford, Kim, Hallacy, Ramesh, Goh, Agarwal, Sastry, Askell, Mishkin, Clark, et al.',
    arxiv: 'https://arxiv.org/abs/2103.00020',
    github: 'https://github.com/openai/CLIP',
    tags: ['vision-transformer', 'contrastive-learning', 'zero-shot', 'multimodal'],
    buildsOn: ['vit'],
    influenced: ['stable-diffusion'],
    summary: 'Trained a vision transformer and text transformer jointly on 400M image-text pairs using contrastive learning. Enables zero-shot image classification by matching images to natural language descriptions.',
    concepts: [
      'Contrastive image-text pre-training',
      'Zero-shot visual classification',
      'Natural language as a supervision signal',
    ],
  },

  // --- Diffusion ---
  {
    id: 'stable-diffusion',
    title: 'High-Resolution Image Synthesis with Latent Diffusion Models (Stable Diffusion)',
    year: 2022,
    topicPath: 'ai/transformers/diffusion',
    depth: 1,
    authors: 'Rombach, Blattmann, Lorenz, Esser, Ommer',
    arxiv: 'https://arxiv.org/abs/2112.10752',
    github: 'https://github.com/CompVis/stable-diffusion',
    tags: ['diffusion', 'latent-space', 'text-to-image', 'cross-attention'],
    buildsOn: ['clip'],
    influenced: [],
    summary: 'Moved diffusion from pixel space to a learned latent space, dramatically reducing compute while maintaining image quality. Uses CLIP text embeddings with cross-attention for text-to-image generation.',
    concepts: [
      'Latent diffusion in compressed space',
      'Cross-attention conditioning with CLIP',
      'Perceptual compression via autoencoder',
    ],
  },

  // --- State-Space ---
  {
    id: 'mamba',
    title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces',
    year: 2023,
    topicPath: 'ai/state-space-models',
    depth: 1,
    authors: 'Gu, Dao',
    arxiv: 'https://arxiv.org/abs/2312.00752',
    github: 'https://github.com/state-spaces/mamba',
    tags: ['state-space', 'selective-ssm', 'linear-time', 'hardware-aware'],
    buildsOn: [],
    influenced: [],
    summary: 'Introduced a selective state-space model that achieves linear-time sequence modeling through input-dependent selection, matching or exceeding Transformer quality on language tasks while scaling linearly in sequence length.',
    concepts: [
      'Selective state-space mechanism',
      'Input-dependent parameterization',
      'Hardware-aware parallel scan',
    ],
  },
];

// ---- Build content Markdown ------------------------------------------------

function buildContent(paper: PaperEntry): string {
  const lines: string[] = [];

  lines.push(`# ${paper.title} (${paper.year})`);
  lines.push('');
  lines.push('## Authors');
  lines.push(paper.authors);
  lines.push('');

  lines.push('## Paper');
  lines.push(paper.arxiv ?? 'N/A (not publicly released as a preprint)');
  lines.push('');

  lines.push('## Code');
  lines.push(paper.github ?? 'N/A (API only)');
  lines.push('');

  lines.push('## Key Concepts');
  for (const c of paper.concepts) {
    lines.push(`- ${c}`);
  }
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

  lines.push('## Summary');
  lines.push(paper.summary);

  return lines.join('\n');
}

/** Build the comma-separated tag string including builds-on edges. */
function buildTags(paper: PaperEntry): string {
  const all = [...paper.tags];
  for (const parentId of paper.buildsOn) {
    all.push(`builds-on:${parentId}`);
  }
  return all.join(',');
}

// ---------------------------------------------------------------------------
// Section 2 — Population
// ---------------------------------------------------------------------------

async function registerTopics(ain: typeof Ain.prototype) {
  console.log('\n--- Registering 9 topics (parent-first) ---\n');
  for (let i = 0; i < TOPICS.length; i++) {
    const t = TOPICS[i];
    const label = `[${i + 1}/${TOPICS.length}] ${t.path}`;
    const result = await ain.knowledge.registerTopic(t.path, {
      title: t.title,
      description: t.description,
    });
    console.log(`  ${label}: ${txOk(result) ? 'OK' : JSON.stringify(result?.result)}`);
    await sleep(BLOCK_TIME);
  }
}

async function writeExplorations(ain: typeof Ain.prototype) {
  console.log('\n--- Writing 17 explorations ---\n');
  for (let i = 0; i < PAPERS.length; i++) {
    const p = PAPERS[i];
    const label = `[${i + 1}/${PAPERS.length}] ${p.title} (${p.year})`;
    const result = await ain.knowledge.explore({
      topicPath: p.topicPath,
      title: p.title,
      content: buildContent(p),
      summary: p.summary,
      depth: p.depth,
      tags: buildTags(p),
    });
    console.log(`  ${label}: ${txOk(result) ? 'OK' : JSON.stringify(result?.result)}`);
    await sleep(BLOCK_TIME);
  }
}

// ---------------------------------------------------------------------------
// Section 3 — Query & Visualization
// ---------------------------------------------------------------------------

/** Print the full topic tree recursively. */
async function printTopicTree(ain: typeof Ain.prototype) {
  console.log('\n=== Topic Tree ===\n');

  async function walk(path: string, indent: string) {
    const info = await ain.knowledge.getTopicInfo(path);
    console.log(`${indent}${path} — ${info?.title ?? '(no info)'}`);
    const subs = await ain.knowledge.listSubtopics(path);
    for (const sub of subs) {
      await walk(`${path}/${sub}`, indent + '  ');
    }
  }

  const roots = await ain.knowledge.listTopics();
  for (const root of roots) {
    await walk(root, '  ');
  }
}

/** Reconstruct the lineage DAG from builds-on tags and print an ASCII tree. */
async function printLineageGraph(ain: typeof Ain.prototype, address: string) {
  console.log('\n=== Lineage Graph (reconstructed from tags) ===\n');

  // Collect all explorations across all topics
  const allByUser = await ain.knowledge.getExplorationsByUser(address);
  if (!allByUser) {
    console.log('  No explorations found.');
    return;
  }

  // Build id -> title map and adjacency list from tags
  const idToTitle: Record<string, string> = {};
  const children: Record<string, string[]> = {};
  const hasParent = new Set<string>();

  // First pass: map exploration titles to our short ids
  for (const paper of PAPERS) {
    idToTitle[paper.id] = `${paper.title} (${paper.year})`;
    if (!children[paper.id]) children[paper.id] = [];
  }

  // Second pass: parse builds-on tags from on-chain data (deduplicate edges)
  const edgeSet = new Set<string>();
  for (const topicKey of Object.keys(allByUser)) {
    const entries = allByUser[topicKey];
    for (const entryId of Object.keys(entries)) {
      const entry = entries[entryId] as any;
      const tags: string[] = (entry.tags || '').split(',').map((t: string) => t.trim());

      // Find which paper this entry corresponds to
      const matchedPaper = PAPERS.find((p) => p.title === entry.title);
      if (!matchedPaper) continue;

      for (const tag of tags) {
        if (tag.startsWith('builds-on:')) {
          const parentId = tag.slice('builds-on:'.length);
          const edge = `${parentId}->${matchedPaper.id}`;
          if (edgeSet.has(edge)) continue;
          edgeSet.add(edge);
          if (!children[parentId]) children[parentId] = [];
          children[parentId].push(matchedPaper.id);
          hasParent.add(matchedPaper.id);
        }
      }
    }
  }

  // Find roots (no parent)
  const roots = PAPERS.map((p) => p.id).filter((id) => !hasParent.has(id));

  // Print ASCII tree
  function printTree(id: string, prefix: string, isLast: boolean) {
    const connector = isLast ? '└── ' : '├── ';
    console.log(`  ${prefix}${connector}${idToTitle[id] || id}`);
    const kids = children[id] || [];
    for (let i = 0; i < kids.length; i++) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      printTree(kids[i], childPrefix, i === kids.length - 1);
    }
  }

  for (const root of roots) {
    console.log(`  ${idToTitle[root] || root}`);
    const kids = children[root] || [];
    for (let i = 0; i < kids.length; i++) {
      printTree(kids[i], '', i === kids.length - 1);
    }
  }
}

/** Group all tags and show which papers they connect. */
async function printTagCrossReferences(ain: typeof Ain.prototype, address: string) {
  console.log('\n=== Tag Cross-References ===\n');

  const allByUser = await ain.knowledge.getExplorationsByUser(address);
  if (!allByUser) return;

  const tagToPapers: Record<string, Set<string>> = {};

  for (const topicKey of Object.keys(allByUser)) {
    const entries = allByUser[topicKey];
    for (const entryId of Object.keys(entries)) {
      const entry = entries[entryId] as any;
      const tags: string[] = (entry.tags || '').split(',').map((t: string) => t.trim());
      for (const tag of tags) {
        if (tag.startsWith('builds-on:')) continue; // skip lineage tags
        if (!tagToPapers[tag]) tagToPapers[tag] = new Set();
        tagToPapers[tag].add(entry.title);
      }
    }
  }

  // Sort by number of papers (descending)
  const sorted = Object.entries(tagToPapers)
    .map(([tag, set]) => [tag, Array.from(set)] as [string, string[]])
    .sort((a, b) => b[1].length - a[1].length);
  for (const [tag, papers] of sorted) {
    if (papers.length > 1) {
      console.log(`  [${tag}] (${papers.length} papers)`);
      for (const p of papers) {
        console.log(`    - ${p}`);
      }
    }
  }
}

/** Print the frontier map for all subtopics. */
async function printFrontierMap(ain: typeof Ain.prototype) {
  console.log('\n=== Frontier Map ===\n');

  const topLevelTopics = ['ai/transformers', 'ai/state-space-models'];
  for (const parent of topLevelTopics) {
    console.log(`  ${parent}:`);
    const map = await ain.knowledge.getFrontierMap(parent);
    if (map.length === 0) {
      console.log('    (no subtopics with data)');
      continue;
    }
    console.log('    ┌─────────────────────────────┬───────────┬───────────┬───────────┐');
    console.log('    │ Subtopic                    │ Explorers │ Max Depth │ Avg Depth │');
    console.log('    ├─────────────────────────────┼───────────┼───────────┼───────────┤');
    for (const entry of map) {
      const topic = entry.topic.padEnd(27);
      const explorers = String(entry.stats.explorer_count).padStart(9);
      const maxD = String(entry.stats.max_depth).padStart(9);
      const avgD = String(entry.stats.avg_depth).padStart(9);
      console.log(`    │ ${topic} │${explorers} │${maxD} │${avgD} │`);
    }
    console.log('    └─────────────────────────────┴───────────┴───────────┴───────────┘');
  }
}

/** Access a few entries to demonstrate round-trip content retrieval. */
async function demonstrateAccess(ain: typeof Ain.prototype, address: string) {
  console.log('\n=== Content Access (round-trip verification) ===\n');

  const samplesToAccess = ['ai/transformers/attention', 'ai/transformers/decoder-only', 'ai/state-space-models'];

  for (const topicPath of samplesToAccess) {
    const explorations = await ain.knowledge.getExplorations(address, topicPath);
    if (!explorations) {
      console.log(`  ${topicPath}: no explorations found`);
      continue;
    }
    const firstEntryId = Object.keys(explorations)[0];
    const entry = explorations[firstEntryId] as any;
    const result = await ain.knowledge.access(address, topicPath, firstEntryId);
    console.log(`  ${topicPath} / "${entry.title}":`);
    console.log(`    paid: ${result.paid}`);
    console.log(`    content preview: ${result.content.substring(0, 120)}...`);
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Section 4 — Main
// ---------------------------------------------------------------------------

async function main() {
  const ain = new Ain(PROVIDER_URL);

  // Use node 0's private key (has balance on local chain)
  const address = ain.wallet.addAndSetDefaultAccount(
    'b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96'
  );
  console.log(`\n===== Transformer Knowledge Graph =====`);
  console.log(`Account: ${address}\n`);

  // Phase 1: Setup & register topics (~90s)
  console.log('Phase 1: Setup & register topics');
  console.log('Setting up knowledge app...');
  const setupResult = await ain.knowledge.setupApp();
  console.log('  setupApp:', txOk(setupResult) ? 'OK' : JSON.stringify(setupResult?.result));
  await sleep(BLOCK_TIME);

  await registerTopics(ain);

  // Phase 2: Write explorations (~170s)
  console.log('\nPhase 2: Write explorations');
  await writeExplorations(ain);

  // Phase 3: Query & visualize
  console.log('\nPhase 3: Query & visualize');
  await printTopicTree(ain);
  await printLineageGraph(ain, address);
  await printTagCrossReferences(ain, address);
  await printFrontierMap(ain);
  await demonstrateAccess(ain, address);

  console.log('\n===== Done! =====\n');
}

main().catch(console.error);
