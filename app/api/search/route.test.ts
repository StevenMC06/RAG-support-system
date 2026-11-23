import { beforeEach, describe, expect, it, vi } from "vitest";

const { retrieveChunks } = vi.hoisted(() => ({
  retrieveChunks: vi.fn(),
}));

vi.mock("@/lib/retrieval", () => ({ retrieveChunks }));

import { POST } from "./route";

describe("POST /api/search", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects an empty question before retrieval", async () => {
    const response = await POST(
      new Request("http://localhost/api/search", {
        method: "POST",
        body: JSON.stringify({ question: "  " }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Invalid question",
    });
    expect(retrieveChunks).not.toHaveBeenCalled();
  });

  it("trims a valid question and returns retrieved chunks", async () => {
    const results = [
      { id: 1, documentId: 7, chunkIndex: 2, content: "Policy", distance: 0.1 },
    ];
    retrieveChunks.mockResolvedValue(results);

    const response = await POST(
      new Request("http://localhost/api/search", {
        method: "POST",
        body: JSON.stringify({ question: "  What is the policy?  " }),
      })
    );

    expect(retrieveChunks).toHaveBeenCalledWith("What is the policy?", 5, expect.objectContaining({ requestId: expect.any(String), callId: expect.any(String) }));
    await expect(response.json()).resolves.toEqual({
      success: true,
      question: "What is the policy?",
      results,
    });
  });

  it("returns a safe error when retrieval fails", async () => {
    retrieveChunks.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(
      new Request("http://localhost/api/search", {
        method: "POST",
        body: JSON.stringify({ question: "Question" }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Search failed",
    });
  });
});
