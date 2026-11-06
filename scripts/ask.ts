import { answerQuestion } from '../lib/answer';
import { closeDb } from '../lib/db';
import { run } from './run';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
  console.error('Usage: npm run ask -- "your question"');
  process.exit(2);
}

await run(async () => {
  for await (const event of answerQuestion(question)) {
    if (event.type === 'text') process.stdout.write(event.text);
    else {
      console.log('\n');
      if (!event.cited && event.sources.length > 0) console.log('No source was cited. Closest matches:');
      for (const source of event.sources) console.log(`[${source.number}] ${source.heading}: ${source.url}`);
    }
  }
  await closeDb();
});
