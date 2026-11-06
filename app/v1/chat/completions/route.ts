import { answerQuestion, type Source } from '@/lib/answer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Message {
  role: string;
  content: string;
}

/**
 * An OpenAI-compatible endpoint for the whole pipeline, so an eval tool such as PromptBench
 * can test real answers: search, prompt and model together. It has no rate limit, so it's
 * switched off in production unless EVAL_ENDPOINT=1.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.EVAL_ENDPOINT !== '1') {
    return Response.json({ error: { message: 'Not found' } }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { messages?: Message[] } | null;
  const question = body?.messages?.findLast((message) => message.role === 'user')?.content;
  if (!question) return Response.json({ error: { message: 'No user message.' } }, { status: 400 });

  let answer = '';
  let sources: Source[] = [];

  for await (const event of answerQuestion(question, request.signal)) {
    if (event.type === 'text') answer += event.text;
    else sources = event.sources;
  }

  const list = sources.map((source) => `[${source.number}] ${source.url}`).join('\n');
  const content = list ? `${answer}\n\nSources:\n${list}` : answer;

  return Response.json({ choices: [{ message: { role: 'assistant', content } }] });
}
