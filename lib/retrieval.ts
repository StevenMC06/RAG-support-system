
import { prisma } from "@/lib/prisma";
import { createEmbeddings } from "@/lib/embeddings";

export type SearchResult = {
  id: number;
  documentId: number;
  chunkIndex: number;
  content: string;
  distance: number;
};

export async function retrieveChunks(
  question: string,
  limit = 5
): Promise<SearchResult[]> {
  const embeddings = await createEmbeddings([question]);
  const queryEmbedding = embeddings[0];

  if (
    !queryEmbedding ||
    queryEmbedding.length !== 1536 ||
    !queryEmbedding.every(Number.isFinite)
  ) {
    throw new Error("Invalid query embedding");
  }

  const vector = `[${queryEmbedding.join(",")}]`;
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));

  return prisma.$queryRaw<SearchResult[]>`
    SELECT
      id,
      "documentId",
      "chunkIndex",
      content,
      (embedding <=> ${vector}::vector)::float8 AS distance
    FROM "DocumentChunk"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${safeLimit}
  `;
}

