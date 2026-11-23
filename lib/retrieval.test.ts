import { beforeEach, describe, expect, it, vi } from "vitest";

const { createEmbeddings, queryRaw } = vi.hoisted(() => ({
  createEmbeddings: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/embeddings", () => ({ createEmbeddings }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

import { retrieveChunks } from "./retrieval";

describe("retrieveChunks", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects an absent or malformed query embedding", async () => {
    createEmbeddings.mockResolvedValue([Array(1535).fill(1)]);

    await expect(retrieveChunks("How do I reset my password?")).rejects.toThrow(
      "Invalid query embedding"
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("uses the embedding and clamps the requested result limit", async () => {
    const embedding = Array(1536).fill(0.25);
    const expected = [
      { id: 2, documentId: 1, chunkIndex: 0, content: "Reset instructions", distance: 0.01 },
    ];
    createEmbeddings.mockResolvedValue([embedding]);
    queryRaw.mockResolvedValue(expected);

    await expect(retrieveChunks("Reset password", 99)).resolves.toEqual(expected);
    expect(createEmbeddings).toHaveBeenCalledWith(["Reset password"], expect.objectContaining({ requestId: expect.any(String), callId: expect.any(String) }));
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0]).toContain(10);
  });
});
