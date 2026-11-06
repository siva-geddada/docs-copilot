import { z } from 'zod';
import { answerQuestion } from '@/lib/answer';
import { config } from '@/lib/config';
import { allow } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const input = z.object({ question: z.string().trim().min(1).max(config.maxQuestionLength) });

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!allow(ip)) return Response.json({ error: 'Too many questions. Try again in a minute.' }, { status: 429 });

  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Send a question of up to 500 characters.' }, { status: 400 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        for await (const event of answerQuestion(parsed.data.question, request.signal)) send(event);
      } catch (error) {
        if (!request.signal.aborted) {
          console.error(error);
          send({ type: 'error', error: 'Could not reach the model. Is Ollama running?' });
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  });
}
