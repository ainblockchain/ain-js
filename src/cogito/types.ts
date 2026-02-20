/**
 * Types for the Cogito module of ain-js.
 */

/** YAML front matter watch criteria. */
export interface RecipeWatch {
  tags: string[];
  topics: string[];
  exclude_tags: string[];
}

/** YAML front matter output configuration. */
export interface RecipeOutput {
  tags: string[];
  price: string;
  depth: number;
}

/** YAML front matter LLM configuration. */
export interface RecipeLlmConfig {
  temperature: number;
  max_tokens: number;
}

/** A fully parsed recipe (front matter + system prompt). */
export interface ParsedRecipe {
  name: string;
  version: number;
  watch: RecipeWatch;
  output: RecipeOutput;
  llm: RecipeLlmConfig;
  systemPrompt: string;
  registered_at?: number;
}

/** Result of enriching an entry via an LLM recipe. */
export interface ThinkResult {
  title: string;
  summary: string;
  content: string;
  tags: string[];
}
