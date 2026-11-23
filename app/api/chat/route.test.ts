import { beforeEach, describe, expect, it, vi } from "vitest";

const { completionCreate, retrieveChunks } = vi.hoisted(() => ({
  completionCreate: vi.fn(),
  retrieveChunks: vi.fn(),
}));

vi.mock("@/lib/retrieval", () => ({ retrieveChunks }));
vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: completionCreate } };
  },
}));

import { POST } from "./route";

describe("POST /api/chat", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects a malformed question before calling dependencies", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: 1 }),
      })
    );

    expect(response.status).toBe(400);
    expect(retrieveChunks).not.toHaveBeenCalled();
    expect(completionCreate).not.toHaveBeenCalled();
  });

  it("returns the fallback answer without calling OpenAI when no chunks match", async () => {
    retrieveChunks.mockResolvedValue([]);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: "Where is the handbook?" }),
      })
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      answer: "No relevant document content is available.",
      citations: [],
    });
    expect(completionCreate).not.toHaveBeenCalled();
  });

  it("uses retrieved excerpts and returns citations", async () => {
    retrieveChunks.mockResolvedValue([
      { id: 1, documentId: 4, chunkIndex: 3, content: "Vacation is 15 days.", distance: 0.04 },
    ]);
    completionCreate.mockResolvedValue({
      choices: [{ message: { content: "Employees receive 15 days [Source 4:3]." } }],
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: "  How much vacation? " }),
      })
    );

    expect(retrieveChunks).toHaveBeenCalledWith("How much vacation?", 5, expect.objectContaining({ requestId: expect.any(String), callId: expect.any(String) }));
    expect(completionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining("Vacation is 15 days.") }),
        ]),
      })
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      question: "How much vacation?",
      answer: "Employees receive 15 days [Source 4:3].",
      citations: [{ documentId: 4, chunkIndex: 3, distance: 0.04 }],
    });
  });
});
