export const config = {
  llmBaseUrl: (process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/+$/, ''),
  llmModel: process.env.LLM_MODEL ?? 'qwen3.5:4b',
  llmApiKey: process.env.LLM_API_KEY,
  ollamaUrl: (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/+$/, ''),
  embedModel: process.env.EMBED_MODEL ?? 'nomic-embed-text',
  dataDir: process.env.DATA_DIR ?? '.data/pglite',

  /** The size of nomic-embed-text vectors. Another model may need a different value. */
  embedDimensions: 768,
  /** How many sections the model gets to read. */
  topK: 6,
  /** How many results each search method contributes before they are merged. */
  candidates: 20,
  /** Measured on real questions. This cuts off most, but not all, unrelated questions. */
  minSimilarity: 0.6,
  /** Ollama silently drops text past its context window, so the prompt must stay under it. */
  maxContextChars: 9000,
  maxQuestionLength: 500,
};
