'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { AnswerEvent, Source } from '@/lib/answer';

interface Turn {
  question: string;
  answer: string;
  sources: Source[];
  status: 'streaming' | 'done' | 'error';
}

const EXAMPLES = [
  'What is the default Ollama context window?',
  'Why not store a JWT in localStorage?',
  'What is INP and what score is good?',
];

/** Turns [1] into a link. The answer stays as plain text, so a model can't inject HTML. */
function withCitations(answer: string, sources: Source[]): ReactNode[] {
  return answer.split(/(\[\d+\])/g).map((part, i) => {
    const number = /^\[(\d+)\]$/.exec(part)?.[1];
    const source = sources.find((s) => s.number === Number(number));
    if (!source) return part;
    return (
      <a key={i} className="cite" href={source.url} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    );
  });
}

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  function update(change: (turn: Turn) => Turn) {
    setTurns((all) => all.map((turn, i) => (i === all.length - 1 ? change(turn) : turn)));
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setQuestion('');
    setTurns((all) => [...all, { question: trimmed, answer: '', sources: [], status: 'streaming' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!response.ok || !response.body) {
        const { error } = (await response.json()) as { error?: string };
        throw new Error(error ?? 'Something went wrong.');
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as AnswerEvent | { type: 'error'; error: string };

          if (event.type === 'text') update((t) => ({ ...t, answer: t.answer + event.text }));
          else if (event.type === 'done') update((t) => ({ ...t, sources: event.sources, status: 'done' }));
          else throw new Error(event.error);
        }
        bottom.current?.scrollIntoView({ block: 'end' });
      }
    } catch (error) {
      update((t) => ({ ...t, answer: (error as Error).message, status: 'error' }));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>Docs Copilot</h1>
        <p>Ask a question. Answers come only from the docs, with links to the sources.</p>
      </header>

      <main className="chat" aria-live="polite">
        {turns.length === 0 && (
          <div className="examples">
            <p>Try one of these:</p>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="example" onClick={() => void ask(example)}>
                {example}
              </button>
            ))}
          </div>
        )}

        {turns.map((turn, i) => (
          <article key={i} className="turn">
            <p className="question">{turn.question}</p>
            <div className={`answer ${turn.status}`}>
              {turn.answer ? withCitations(turn.answer, turn.sources) : 'Searching the docs…'}
            </div>

            {turn.sources.length > 0 && (
              <ol className="sources" aria-label="Sources">
                {turn.sources.map((source) => (
                  <li key={source.number} value={source.number}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title} › {source.heading}
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </article>
        ))}
        <div ref={bottom} />
      </main>

      <form className="composer" onSubmit={submit}>
        <label htmlFor="question" className="hidden">
          Your question
        </label>
        <input
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about the docs"
          maxLength={500}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !question.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
