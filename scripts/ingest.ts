import { parseArgs } from 'node:util';
import { chunkPage, toEmbeddingText } from '../lib/chunk';
import { crawl } from '../lib/crawl';
import { closeDb, countChunks, replaceChunks } from '../lib/db';
import { embedDocuments } from '../lib/llm';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    selector: { type: 'string' },
    exclude: { type: 'string', multiple: true, default: [] },
    'max-pages': { type: 'string', default: '200' },
  },
});

const [start] = positionals;
if (!start) {
  console.error('Usage: npm run ingest -- <url> [--selector .prose] [--exclude /admin] [--max-pages 200]');
  process.exit(2);
}

const started = Date.now();
console.log(`Crawling ${start}`);

const pages = await crawl(start, {
  maxPages: Number(values['max-pages']),
  exclude: values.exclude,
  ...(values.selector ? { selector: values.selector } : {}),
  onPage: (url, status) => console.log(`  ${new URL(url).pathname}: ${status}`),
});

const chunks = pages.flatMap((page) => chunkPage(page, page.url));
if (chunks.length === 0) {
  console.error('No content found, so the existing index was left unchanged.');
  process.exit(1);
}

console.log(`\nEmbedding ${chunks.length} sections from ${pages.length} pages`);
const embeddings = await embedDocuments(chunks.map(toEmbeddingText));

await replaceChunks(chunks, embeddings);
console.log(`Indexed ${await countChunks()} sections in ${((Date.now() - started) / 1000).toFixed(1)}s`);
await closeDb();
