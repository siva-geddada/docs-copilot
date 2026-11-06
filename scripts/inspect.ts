// Shows what search finds for a question, without calling the chat model.
// Usage: npm run inspect -- "your question"
import { config } from '../lib/config';
import { closeDb, searchKeyword, searchVector } from '../lib/db';
import { embedQuery } from '../lib/llm';
import { fuse } from '../lib/search';

const questions = process.argv.slice(2);

for (const question of questions) {
  const vectorRows = await searchVector(await embedQuery(question), config.candidates);
  const keywordRows = await searchKeyword(question, config.candidates);

  console.log(`\n${question}`);
  console.log(`  best similarity: ${vectorRows[0]?.similarity.toFixed(3)}`);

  fuse(vectorRows, keywordRows)
    .slice(0, config.topK)
    .forEach((hit, i) => {
      const rank = vectorRows.findIndex((row) => row.id === hit.id) + 1;
      const word = keywordRows.findIndex((row) => row.id === hit.id) + 1;
      console.log(`  ${i + 1}. ${hit.title.slice(0, 24)} > ${hit.heading.slice(0, 34)}  (vector #${rank || '-'}, keyword #${word || '-'})`);
    });
}
await closeDb();
