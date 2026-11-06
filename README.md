# Docs Copilot

A chat assistant that answers questions from a website's docs, with links to the exact sections it used. If the docs don't cover something, it says "I don't know" rather than making something up.

It runs fully on your machine with Ollama, so it's free to run, and your data stays local.

## How it works

```
Crawl site → Split at headings → Embed → PostgreSQL + pgvector
                                                │
Question → Vector search + keyword search → Merge → Model → Answer with citations
```

| Part | File |
| --- | --- |
| Crawling, with `robots.txt` support | `lib/crawl.ts` |
| Splitting pages into sections | `lib/extract.ts`, `lib/chunk.ts` |
| Database and both searches | `lib/db.ts` |
| Merging results (reciprocal rank fusion) | `lib/search.ts` |
| Prompt, citations and refusals | `lib/answer.ts` |
| Chat page and API | `app/` |

The database is [PGlite](https://pglite.dev): real PostgreSQL running inside Node, with pgvector, so there's nothing to install.

## Setup

You need Node.js 24 and [Ollama](https://ollama.com).

```bash
ollama pull nomic-embed-text
ollama pull qwen3.5:4b
npm install
```

## Index a site

```bash
npm run ingest -- https://example.com/docs/ --selector main --exclude /admin
```

| Option | Meaning |
| --- | --- |
| `--selector <css>` | Index only the content inside this element. Other pages are still followed for links |
| `--exclude <path>` | Never fetch this path. Can be repeated |
| `--max-pages <n>` | Page limit, 200 by default |

Each run replaces the whole index. If nothing is found, the existing index is left alone. Only crawl sites you're allowed to crawl.

**Stop the app before running `ingest`.** PGlite allows one connection at a time.

## Ask questions

In the terminal:

```bash
npm run ask -- "How do I reset my password?"
```

Or in the browser:

```bash
npm run build
npm start
```

Then open http://localhost:3100.

To see what search finds for a question, without calling the model:

```bash
npm run inspect -- "How do I reset my password?"
```

## Configuration

Everything is optional. See `.env.example`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | Any OpenAI-compatible chat server |
| `LLM_MODEL` | `qwen3.5:4b` | Chat model |
| `LLM_API_KEY` | None | Key for a hosted model |
| `OLLAMA_URL` | `http://localhost:11434` | Used for embeddings |
| `EMBED_MODEL` | `nomic-embed-text` | Re-run `ingest` if you change this |
| `DATA_DIR` | `.data/pglite` | Where the database is stored |

Search settings are in `lib/config.ts`. `minSimilarity` was measured on one site, so test it again on yours.

## Testing quality

Answer quality is tested with [PromptBench](https://www.npmjs.com/package/promptbench), through an OpenAI-compatible endpoint that runs the whole pipeline.

```bash
npm install -g promptbench
npm run build
EVAL_ENDPOINT=1 npm start     # in a second terminal, run:
promptbench run -c evals/promptbench.yaml --no-cache
promptbench run -c evals/holdout.yaml --no-cache
```

In PowerShell, set the variable first with `$env:EVAL_ENDPOINT = "1"`.

- `evals/promptbench.yaml` is the set used while tuning.
- `evals/holdout.yaml` was never used for tuning. Don't change the system to pass it, or it stops being a fair test.

Use `--no-cache` after re-indexing. Otherwise PromptBench replays old replies.

Both sets ask about the blog this was built on, so write your own for another site.

## Results

On a blog of 20 pages and 202 sections, using `qwen3.5:4b`:

| Set | Before fixes | After fixes |
| --- | --- | --- |
| Tuning set | 12 of 14 | 14 of 14 |
| Unseen set | Not run | 14 of 14 |

These are small sets that I wrote myself, so they show the system works, not that it's perfect.

## Limits

- **Small models make mistakes.** Check the sources for anything important.
- **One site at a time.** Each `ingest` replaces the index.
- **Single-server.** PGlite and the rate limiter suit one process. For more, move to hosted PostgreSQL. The SQL is the same.
- **No chat history.** Each question stands alone.
- **The context window is fixed.** Ollama's default is 4096 tokens, so `maxContextChars` limits the prompt. Raise both together.
- **HTML only.** The crawler doesn't read PDFs or pages that need JavaScript to show content.

## Development

| Script | What it does |
| --- | --- |
| `npm test` | Unit tests |
| `npm run typecheck` | Checks types |
| `npm run dev` | Development server on port 3100 |

## License

MIT. See [LICENSE](LICENSE).
