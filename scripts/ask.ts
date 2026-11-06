import { answerQuestion } from '../lib/answer';
import { closeDb } from '../lib/db';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
  console.error('Usage: npm run ask -- "your question"');
  process.exit(2);
}

for await (const event of answerQuestion(question)) {
  if (event.type === 'text') process.stdout.write(event.text);
  else {
    console.log('\n');
    for (const source of event.sources) console.log(`[${source.number}] ${source.heading}: ${source.url}`);
  }
}
await closeDb();
