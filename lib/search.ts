import { config } from './config';
import { searchKeyword, searchVector, type Row, type VectorRow } from './db';
import { embedQuery } from './llm';

const RRF_K = 60; // the standard constant: it stops top ranks from dominating

export interface Hit extends Row {
  score: number;
  similarity: number;
}

/**
 * Reciprocal rank fusion merges ranked lists using position alone. That matters here,
 * because cosine similarity and text rank are on completely different scales.
 */
export function fuse(vectorRows: VectorRow[], keywordRows: Row[]) {
  const hits = new Map<number, Hit>();

  vectorRows.forEach((row, rank) => {
    hits.set(row.id, { ...row, score: 1 / (RRF_K + rank + 1) });
  });

  keywordRows.forEach((row, rank) => {
    const score = 1 / (RRF_K + rank + 1);
    const existing = hits.get(row.id);
    if (existing) existing.score += score;
    else hits.set(row.id, { ...row, score, similarity: 0 });
  });

  return [...hits.values()].sort((a, b) => b.score - a.score);
}

/** Merged results, or nothing if the docs don't appear to cover the question. */
export async function retrieve(question: string) {
  const embedding = await embedQuery(question);
  const [vectorRows, keywordRows] = await Promise.all([
    searchVector(embedding, config.candidates),
    searchKeyword(question, config.candidates),
  ]);

  const best = vectorRows[0]?.similarity ?? 0;
  if (best < config.minSimilarity) return { hits: [], best };

  return { hits: fuse(vectorRows, keywordRows).slice(0, config.topK), best };
}
