import { describe, expect, it } from "vitest";
import { chunkText } from "./chunkTest";

describe("chunkText", () => {
  it("returns no chunks for blank input", () => {
    expect(chunkText(" \n\t ")).toEqual([]);
  });

  it("normalizes whitespace and assigns consecutive chunk indexes", () => {
    const chunks = chunkText(" First sentence.\r\n\r\n\r\nSecond sentence. ", {
      targetTokens: 20,
      maxTokens: 30,
      overlapTokens: 0,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      content: "First sentence.\n\nSecond sentence.",
      chunkIndex: 0,
    });
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  it("keeps oversized input within the configured maximum", () => {
    const chunks = chunkText("word ".repeat(120), {
      targetTokens: 20,
      maxTokens: 25,
      overlapTokens: 0,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index)
    );
    expect(chunks.every((chunk) => chunk.tokenCount <= 25)).toBe(true);
  });

  it.each([
    [{ targetTokens: 0 }, "targetTokens must be greater than 0"],
    [
      { targetTokens: 10, maxTokens: 9 },
      "maxTokens must be greater than or equal to targetTokens",
    ],
    [
      { targetTokens: 10, overlapTokens: 10 },
      "overlapTokens must be non-negative and smaller than targetTokens",
    ],
  ])("rejects invalid options %#", (options, message) => {
    expect(() => chunkText("text", options)).toThrow(message);
  });
});
