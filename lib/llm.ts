import { config } from './config';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

// nomic-embed-text was trained with these prefixes, and needs them for good results.
const DOCUMENT_PREFIX = 'search_document: ';
const QUERY_PREFIX = 'search_query: ';

async function embed(input: string[]) {
  const response = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.embedModel, input }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Embedding failed: ${response.status} ${await response.text()}`);

  const { embeddings } = (await response.json()) as { embeddings: number[][] };
  return embeddings;
}

export async function embedDocuments(texts: string[], batchSize = 16) {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((text) => DOCUMENT_PREFIX + text);
    vectors.push(...(await embed(batch)));
  }
  return vectors;
}

export async function embedQuery(text: string) {
  const [vector] = await embed([QUERY_PREFIX + text]);
  if (!vector) throw new Error('The embedding model returned nothing.');
  return vector;
}

/** Streams a reply from any OpenAI-compatible server, one piece of text at a time. */
export async function* streamChat(messages: ChatMessage[], signal?: AbortSignal) {
  const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.llmApiKey ? { Authorization: `Bearer ${config.llmApiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.llmModel,
      messages,
      stream: true,
      temperature: 0.1,
      reasoning_effort: 'none', // answering from given text doesn't need hidden reasoning
    }),
    signal: signal ?? null,
  });

  if (!response.ok || !response.body) {
    throw new Error(`The model returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // the last line may be unfinished

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;

      const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}
