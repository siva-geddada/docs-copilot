import type { Page } from './extract';

export interface Chunk {
  url: string;
  title: string;
  heading: string;
  anchor: string | null;
  content: string;
}

// Large enough to keep most sections whole. A piece cut from its section loses the words that
// say what it is about, and then search can't find it.
const MAX_CHARS = 2000;
const OVERLAP_CHARS = 200;

/** Splits text on line breaks where possible, with a little overlap between pieces. */
export function splitText(text: string, max = MAX_CHARS, overlap = OVERLAP_CHARS) {
  if (text.length <= max) return [text];

  const pieces: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + max, text.length);

    if (end < text.length) {
      const lineBreak = text.lastIndexOf('\n', end);
      const space = text.lastIndexOf(' ', end);
      // Only break early if the piece stays a useful size.
      if (lineBreak > start + max / 2) end = lineBreak;
      else if (space > start + max / 2) end = space;
    }

    pieces.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1); // always moves forward
  }
  return pieces.filter(Boolean);
}

export function chunkPage(page: Page, url: string): Chunk[] {
  return page.sections.flatMap((section) =>
    splitText(section.text).map((content) => ({
      url,
      title: page.title,
      heading: section.heading,
      anchor: section.anchor,
      content,
    })),
  );
}

/** The text that gets embedded. The title and heading tell the model what a passage is about. */
export const toEmbeddingText = (chunk: Pick<Chunk, 'title' | 'heading' | 'content'>) =>
  `${chunk.title} > ${chunk.heading}\n${chunk.content}`;
