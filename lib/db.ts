import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import type { Chunk } from './chunk';
import { config } from './config';

export interface Row extends Chunk {
  id: number;
}

export interface VectorRow extends Row {
  similarity: number;
}

const SCHEMA = `
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS chunks (
    id        serial PRIMARY KEY,
    url       text NOT NULL,
    title     text NOT NULL,
    heading   text NOT NULL,
    anchor    text,
    content   text NOT NULL,
    embedding vector(${config.embedDimensions}) NOT NULL,
    search    tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('english', title), 'B') ||
      setweight(to_tsvector('english', heading), 'A') ||
      setweight(to_tsvector('english', content), 'C')
    ) STORED
  );

  CREATE INDEX IF NOT EXISTS chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);
  CREATE INDEX IF NOT EXISTS chunks_search ON chunks USING gin (search);
`;

// Next.js reloads modules in development, and PGlite allows one connection per folder.
const globals = globalThis as unknown as { docsCopilotDb?: Promise<PGlite> };

export function getDb(dataDir: string = config.dataDir) {
  globals.docsCopilotDb ??= (async () => {
    mkdirSync(dataDir, { recursive: true }); // PGlite won't create parent folders
    const db = await PGlite.create({ dataDir, extensions: { vector } });
    await db.exec(SCHEMA);
    return db;
  })();
  return globals.docsCopilotDb;
}

export async function closeDb() {
  const db = await globals.docsCopilotDb;
  await db?.close();
  delete globals.docsCopilotDb;
}

const toVector = (values: number[]) => `[${values.join(',')}]`;

/** Replaces the whole index in one transaction, so a failed run can't leave it half empty. */
export async function replaceChunks(chunks: Chunk[], embeddings: number[][], db?: PGlite) {
  const database = db ?? (await getDb());

  await database.transaction(async (tx) => {
    await tx.query('DELETE FROM chunks');
    for (const [i, chunk] of chunks.entries()) {
      await tx.query(
        'INSERT INTO chunks (url, title, heading, anchor, content, embedding) VALUES ($1, $2, $3, $4, $5, $6)',
        [chunk.url, chunk.title, chunk.heading, chunk.anchor, chunk.content, toVector(embeddings[i] as number[])],
      );
    }
  });
}

/** Finds sections by meaning. */
export async function searchVector(embedding: number[], limit: number, db?: PGlite) {
  const database = db ?? (await getDb());
  const { rows } = await database.query<VectorRow>(
    `SELECT id, url, title, heading, anchor, content, 1 - (embedding <=> $1) AS similarity
     FROM chunks ORDER BY embedding <=> $1 LIMIT $2`,
    [toVector(embedding), limit],
  );
  return rows;
}

/**
 * Finds sections by exact words, which catches error codes and names that embeddings miss.
 * Terms are joined with OR, because a full question rarely has every word in one section.
 */
export async function searchKeyword(question: string, limit: number, db?: PGlite) {
  const database = db ?? (await getDb());
  const { rows } = await database.query<Row>(
    `WITH q AS (
       SELECT nullif(replace(plainto_tsquery('english', $1)::text, ' & ', ' | '), '')::tsquery AS query
     )
     SELECT id, url, title, heading, anchor, content
     FROM chunks, q
     WHERE search @@ q.query
     ORDER BY ts_rank(search, q.query) DESC
     LIMIT $2`,
    [question, limit],
  );
  return rows;
}

export async function countChunks(db?: PGlite) {
  const database = db ?? (await getDb());
  const { rows } = await database.query<{ n: number }>('SELECT count(*)::int AS n FROM chunks');
  return rows[0]?.n ?? 0;
}
