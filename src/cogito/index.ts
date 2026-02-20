import Provider from '../provider';
import { ParsedRecipe, RecipeWatch, RecipeOutput, RecipeLlmConfig } from './types';

/**
 * A class for the Cogito module of AIN blockchain.
 * Manages recipe registration, listing, and removal using existing
 * blockchain state operations (no new JSON-RPC methods).
 */
export default class Cogito {
  private _ain: any;
  private _provider: Provider;

  static RECIPES_PATH = '/apps/cogito/recipes';

  /**
   * Creates a new Cogito object.
   * @param {any} ain The Ain instance.
   * @param {Provider} provider The network provider object.
   */
  constructor(ain: any, provider: Provider) {
    this._ain = ain;
    this._provider = provider;
  }

  /**
   * Register a recipe by parsing its markdown and writing to blockchain state.
   * Stores at /apps/cogito/recipes/{address}/{name}.
   * @param {string} markdown The recipe markdown string with YAML front matter.
   * @returns {Promise<any>} The transaction result.
   */
  async registerRecipe(markdown: string): Promise<any> {
    const recipe = parseRecipe(markdown);
    const address = this._ain.signer.getAddress();
    return this._ain.db.ref(`${Cogito.RECIPES_PATH}/${address}/${recipe.name}`).setValue({
      value: { ...recipe, registered_at: Date.now() },
    });
  }

  /**
   * List all recipes for an address.
   * @param {string} address Optional address. Defaults to the current signer's address.
   * @returns {Promise<ParsedRecipe[]>} Array of parsed recipes.
   */
  async listRecipes(address?: string): Promise<ParsedRecipe[]> {
    const addr = address || this._ain.signer.getAddress();
    const data = await this._ain.db.ref(`${Cogito.RECIPES_PATH}/${addr}`).getValue();
    return Object.values(data || {});
  }

  /**
   * Remove a recipe by name.
   * @param {string} name The recipe name.
   * @returns {Promise<any>} The transaction result.
   */
  async removeRecipe(name: string): Promise<any> {
    const address = this._ain.signer.getAddress();
    return this._ain.db.ref(`${Cogito.RECIPES_PATH}/${address}/${name}`).setValue({ value: null });
  }
}

// ── Recipe parser (lightweight, no external deps) ─────────────────

function parseRecipe(markdown: string): ParsedRecipe {
  const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error('Recipe must have YAML front matter delimited by ---');
  }

  const fm = parseSimpleYaml(fmMatch[1]);
  const systemPrompt = fmMatch[2].trim();

  const watch: RecipeWatch = {
    tags: toStringArray(fm.watch?.tags),
    topics: toStringArray(fm.watch?.topics),
    exclude_tags: toStringArray(fm.watch?.exclude_tags),
  };

  const output: RecipeOutput = {
    tags: toStringArray(fm.output?.tags),
    price: String(fm.output?.price ?? '0'),
    depth: Number(fm.output?.depth ?? 3),
  };

  const llm: RecipeLlmConfig = {
    temperature: Number(fm.llm?.temperature ?? 0.7),
    max_tokens: Number(fm.llm?.max_tokens ?? 4096),
  };

  if (!fm.name) throw new Error('Recipe must have a "name" field');

  return { name: String(fm.name), version: Number(fm.version ?? 1), watch, output, llm, systemPrompt };
}

function parseSimpleYaml(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');
  const stack: Array<{ obj: Record<string, any>; indent: number }> = [{ obj: result, indent: -1 }];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    const trimmed = line.trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    const kvMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1].trim();
    const value = kvMatch[2].trim();

    if (value === '' || value === undefined) {
      const child: Record<string, any> = {};
      parent[key] = child;
      stack.push({ obj: child, indent });
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1);
      parent[key] = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      parent[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return result;
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return [val];
  return [];
}
