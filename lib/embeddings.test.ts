import { afterEach, describe, expect, it, vi } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { embeddings = { create }; } }));
import { createEmbeddings } from "./embeddings";

afterEach(() => { vi.restoreAllMocks(); create.mockReset(); });

describe("embedding call telemetry", () => {
  it("propagates context and provider request ID without logging input", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    create.mockResolvedValue({ data: [{ embedding: [1, 2] }], _request_id: "provider-id" });
    await expect(createEmbeddings(["private text"], { requestId: "request", callId: "parent" })).resolves.toEqual([[1, 2]]);
    const event = JSON.parse(log.mock.calls[0][0]);
    expect(event).toMatchObject({ requestId: "request", parentId: "parent", providerRequestId: "provider-id", model: "text-embedding-3-small", outcome: "success" });
    expect(log.mock.calls[0][0]).not.toContain("private text");
  });

  it("does not invent a model call for empty input", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(createEmbeddings([])).resolves.toEqual([]);
    expect(create).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
